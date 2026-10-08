//! Local-only Page 1 reads. No command in this module starts capture, discovery,
//! scans, connectivity probes, GeoIP HTTP requests, or threat-feed downloads.
use crate::{models::*, state::BackendState};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use tauri::{command, State};

fn bounded(limit: Option<usize>) -> usize { limit.unwrap_or(100).clamp(1, 500) }

#[derive(Serialize)]
pub struct SourceState {
    pub state: String,
    pub detail: String,
}

#[derive(Serialize)]
pub struct GlobalIntelSnapshot {
    pub collected_at: String,
    pub scope: String,
    pub capture: CaptureMetrics,
    pub capture_availability: SourceState,
    pub flows: Vec<FlowRecord>,
    pub flow_summary: FlowSummaryStats,
    pub detections: Vec<DetectionFinding>,
    pub detection_summary: DetectionSummary,
    pub connectivity: ConnectivityStatus,
    pub threat_intel: ThreatIntelStatus,
    pub geoip: Vec<GeoIpEntry>,
    pub threat_matches: Vec<ThreatMatchEntry>,
    pub devices: Vec<DeviceEntry>,
    pub storage: SourceState,
    pub enrichment: SourceState,
}

struct CachedIntel {
    geoip: Vec<GeoIpEntry>,
    threats: Vec<ThreatMatchEntry>,
    devices: Vec<DeviceEntry>,
}

fn open_cache(state: &BackendState) -> Result<Connection, String> {
    let path = state.sqlite_path.as_ref().ok_or_else(|| state.storage_error.clone().unwrap_or_else(|| "Local storage unavailable".into()))?;
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())
}

fn read_cache(state: &BackendState, limit: usize) -> Result<CachedIntel, String> {
    let mut conn = open_cache(state)?;
    // The cache collections are read from one SQLite transaction. Engine
    // collections are current-session snapshots, not a historical DB replay.
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let geoip = {
        let mut stmt = tx.prepare("SELECT ip,country,country_code,city,latitude,longitude,asn,org,source,resolved_at FROM geoip_cache ORDER BY resolved_at DESC LIMIT ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([limit as i64], |r| Ok(GeoIpEntry { ip:r.get(0)?, country:r.get(1)?, country_code:r.get(2)?, city:r.get(3)?, latitude:r.get(4)?, longitude:r.get(5)?, asn:r.get(6)?, org:r.get(7)?, source:r.get(8)?, resolved_at:r.get(9)? })).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };
    let threats = {
        let mut stmt = tx.prepare("SELECT ip,indicator_type,feed,severity,feed_first_seen,feed_last_seen,matched_at FROM threat_matches ORDER BY matched_at DESC LIMIT ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([limit as i64], |r| Ok(ThreatMatchEntry { ip:r.get(0)?, indicator_type:r.get(1)?, feed:r.get(2)?, severity:r.get(3)?, feed_first_seen:r.get(4)?, feed_last_seen:r.get(5)?, matched_at:r.get(6)? })).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };
    let devices = {
        let mut stmt = tx.prepare("SELECT ip,mac,hostname,vendor,interface,first_seen,last_seen,active,is_self FROM devices ORDER BY last_seen DESC LIMIT ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([limit as i64], |r| Ok(DeviceEntry { ip:r.get(0)?, mac:r.get(1)?, hostname:r.get(2)?, vendor:r.get(3)?, interface:r.get(4)?, first_seen:r.get(5)?, last_seen:r.get(6)?, active:r.get::<_, i64>(7)? != 0, is_self:r.get::<_, i64>(8)? != 0 })).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };
    Ok(CachedIntel { geoip, threats, devices })
}

#[command]
pub fn get_active_flows(state: State<'_, BackendState>, limit: Option<usize>) -> Result<Vec<FlowRecord>, String> {
    Ok(state.flows.lock().map_err(|_| "Flow engine unavailable")?.get_recent_flows(bounded(limit)))
}

#[command]
pub fn get_flow_summary(state: State<'_, BackendState>) -> Result<FlowSummaryStats, String> {
    Ok(state.flows.lock().map_err(|_| "Flow engine unavailable")?.get_summary_stats())
}

#[command]
pub fn get_detections(state: State<'_, BackendState>, limit: Option<usize>) -> Result<Vec<DetectionFinding>, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.get_findings(bounded(limit)))
}

#[command]
pub fn get_detection_summary(state: State<'_, BackendState>) -> Result<DetectionSummary, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.get_summary())
}

#[command]
pub fn get_connectivity_status(state: State<'_, BackendState>) -> Result<ConnectivityStatus, String> {
    Ok(state.connectivity.lock().map_err(|_| "Connectivity state unavailable")?.clone())
}

#[command]
pub fn get_threat_intel_status(state: State<'_, BackendState>) -> ThreatIntelStatus {
    state.threats.status()
}

#[command]
pub fn get_geoip_for_active_flows(state: State<'_, BackendState>) -> Result<Vec<GeoIpEntry>, String> {
    let flows = state.flows.lock().map_err(|_| "Flow engine unavailable")?.get_recent_flows(500);
    Ok(read_cache(&state, 500)?.geoip.into_iter().filter(|g| flows.iter().any(|f| f.src_ip == g.ip || f.dst_ip == g.ip)).collect())
}

#[command]
pub fn get_geoip_lookup(ip: String, state: State<'_, BackendState>) -> Result<Option<GeoIpEntry>, String> {
    ip.parse::<std::net::IpAddr>().map_err(|_| "Invalid IP address")?;
    open_cache(&state)?.query_row(
        "SELECT ip,country,country_code,city,latitude,longitude,asn,org,source,resolved_at FROM geoip_cache WHERE ip = ?1",
        [ip],
        |r| Ok(GeoIpEntry { ip:r.get(0)?, country:r.get(1)?, country_code:r.get(2)?, city:r.get(3)?, latitude:r.get(4)?, longitude:r.get(5)?, asn:r.get(6)?, org:r.get(7)?, source:r.get(8)?, resolved_at:r.get(9)? }),
    ).optional().map_err(|e| e.to_string())
}

#[command]
pub fn get_public_ip(state: State<'_, BackendState>) -> Result<Option<String>, String> {
    Ok(state.geoip.last_public_ip.lock().map_err(|_| "Public IP cache unavailable")?.clone())
}

#[command]
pub fn get_threat_matches(state: State<'_, BackendState>, limit: Option<usize>) -> Result<Vec<ThreatMatchEntry>, String> {
    Ok(read_cache(&state, bounded(limit))?.threats)
}

#[command]
pub fn get_devices(state: State<'_, BackendState>) -> Result<Vec<DeviceEntry>, String> {
    Ok(read_cache(&state, 500)?.devices)
}

#[command]
pub fn evaluate_flows_for_threats(state: State<'_, BackendState>) -> Result<Vec<ThreatMatchEntry>, String> {
    if state.threats.last_fetched.lock().map_err(|_| "Threat state unavailable")?.is_none() {
        return Err("Refresh threat feeds before evaluating flows".into());
    }
    let flows = state.flows.lock().map_err(|_| "Flow engine unavailable")?.get_recent_flows(500);
    let ips: std::collections::HashSet<String> = flows.into_iter().flat_map(|f| [f.src_ip, f.dst_ip]).collect();
    Ok(crate::services::evaluate_ips_for_threats(&state.threats, &ips.into_iter().collect::<Vec<_>>(), 500))
}

#[command]
pub fn get_global_intel_snapshot(state: State<'_, BackendState>, limit: Option<usize>) -> Result<GlobalIntelSnapshot, String> {
    snapshot(&state, bounded(limit))
}

fn snapshot(state: &BackendState, limit: usize) -> Result<GlobalIntelSnapshot, String> {
    let capture = state.capture.lock().map_err(|_| "Capture state unavailable")?.get_metrics();
    let (flows, flow_summary) = {
        let engine = state.flows.lock().map_err(|_| "Flow engine unavailable")?;
        (engine.get_recent_flows(limit), engine.get_summary_stats())
    };
    let (detections, detection_summary) = {
        let engine = state.detections.lock().map_err(|_| "Detection engine unavailable")?;
        (engine.get_findings(limit), engine.get_summary())
    };
    let (availability, reason) = super::inspect_npcap_availability()?;
    let (cache, storage) = match read_cache(state, limit) {
        Ok(cache) => (cache, SourceState { state: "AVAILABLE".into(), detail: "Read-only local cache; entries retain their original observation timestamps and may be stale".into() }),
        Err(error) => (CachedIntel { geoip: vec![], threats: vec![], devices: vec![] }, SourceState { state: "UNAVAILABLE".into(), detail: error }),
    };
    Ok(GlobalIntelSnapshot {
        collected_at: chrono::Utc::now().to_rfc3339(),
        scope: "current_session_engines_and_local_cache".into(),
        capture,
        capture_availability: SourceState { state: availability, detail: reason },
        flows, flow_summary, detections, detection_summary,
        connectivity: state.connectivity.lock().map_err(|_| "Connectivity state unavailable")?.clone(),
        threat_intel: state.threats.status(),
        geoip: cache.geoip, threat_matches: cache.threats, devices: cache.devices, storage,
        enrichment: SourceState { state: "CACHE_ONLY".into(), detail: "This snapshot performs no external requests. Refresh commands explicitly update GeoIP, public-IP, connectivity and threat-feed state".into() },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_snapshot_has_no_fabricated_observations_and_reports_storage_failure() {
        let state = BackendState::new(Err("test storage unavailable".into()));
        let result = snapshot(&state, 100).unwrap();
        assert!(result.flows.is_empty());
        assert!(result.detections.is_empty());
        assert!(result.geoip.is_empty());
        assert_eq!(result.capture.status, "STOPPED");
        assert_eq!(result.capture.packets_captured, 0);
        assert_eq!(result.storage.state, "UNAVAILABLE");
        assert_eq!(result.connectivity.latency_ms, None);
        assert_eq!(result.threat_intel.feed_state, "NOT_STARTED");
    }

    #[test]
    fn cached_snapshot_is_bounded_and_read_only() {
        let path = std::env::temp_dir().join(format!("netoze-intel-{}-{}.db", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let conn = Connection::open(&path).unwrap();
        crate::database::sqlite::initialize_phase11_tables(&conn).unwrap();
        conn.execute("INSERT INTO geoip_cache VALUES ('192.0.2.1','Fixture','ZZ','Test',NULL,NULL,NULL,NULL,'test',1)", []).unwrap();
        conn.execute("INSERT INTO geoip_cache VALUES ('192.0.2.2','Fixture','ZZ','Test',NULL,NULL,NULL,NULL,'test',2)", []).unwrap();
        let state = BackendState::new(Ok(path.clone()));
        let result = read_cache(&state, 1).unwrap();
        assert_eq!(result.geoip.len(), 1);
        assert_eq!(result.geoip[0].ip, "192.0.2.2");
        assert_eq!(result.geoip[0].latitude, None);
        assert!(open_cache(&state).unwrap().execute("DELETE FROM geoip_cache", []).is_err());
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM geoip_cache", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
        drop(conn);
        std::fs::remove_file(path).unwrap();
    }
}

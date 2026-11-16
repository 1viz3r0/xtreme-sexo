//! Watchtower persistent IP intelligence: passive observation ingest, a
//! bounded auto-scan scheduler, per-IP investigation, and investigation notes.
//!
//! Reuses existing engines instead of adding a second scanner: scheduled and
//! manual scans run through the shared, explicitly authorized Scan Buddy
//! engine (`services::scan_buddy`), and persistence is plain SQLite additive
//! tables. Public IPs discovered passively in traffic are stored but are
//! never scanned automatically; scanning requires an explicit per-IP user
//! authorization (`scan_enabled` + `scan_authorized_at`).
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

pub const MAX_INVENTORY_ROWS: usize = 400;
pub const MAX_NOTES: usize = 500;
pub const MAX_SCAN_HISTORY: usize = 200;
/// A host that failed this many consecutive automatic scans stops being an
/// automatic candidate (manual "Scan now" still works).
pub const MAX_SCAN_FAILURES: i64 = 5;

// ------------------------------------------------------------------
// Data model
// ------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchtowerIpRecord {
    pub ip: String,
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub hostname: Option<String>,
    #[serde(default)]
    pub vendor: Option<String>,
    #[serde(default)]
    pub os_guess: Option<String>,
    #[serde(default)]
    pub os_confidence: Option<String>,
    #[serde(default)]
    pub os_basis: Option<String>,
    #[serde(default)]
    pub interface: Option<String>,
    pub first_seen: i64,
    pub last_seen: i64,
    #[serde(default)]
    pub packet_count: u64,
    #[serde(default)]
    pub byte_count: u64,
    #[serde(default)]
    pub flow_count: u64,
    #[serde(default)]
    pub last_activity_at: Option<i64>,
    /// passive-discovery | kernel-neighbors | traffic | manual
    pub source: String,
    /// observed | manual — manual entries are user-created; passive
    /// ingestion keeps their user fields intact.
    pub origin: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub excluded: bool,
    #[serde(default)]
    pub scan_enabled: bool,
    #[serde(default)]
    pub scan_authorized_at: Option<i64>,
    #[serde(default)]
    pub open_ports: Option<String>,
    #[serde(default)]
    pub last_scan_at: Option<i64>,
    #[serde(default)]
    pub scan_failures: i64,
    #[serde(default)]
    pub last_scan_state: Option<String>,
    pub updated_at: i64,
}

/// One passive observation of an address. Engines call `record_observations`
/// with small batches; missing fields are never allowed to erase known data.
#[derive(Debug, Clone)]
pub struct IpObservation {
    pub ip: String,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub interface: Option<String>,
    pub source: &'static str,
    pub packets: u64,
    pub bytes: u64,
    pub flows: u64,
    pub activity_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub enabled: bool,
    pub interval_seconds: i64,
    pub intensity: String,
    pub max_runs_per_cycle: i64,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_seconds: 900,
            intensity: "light".into(),
            max_runs_per_cycle: 4,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanStatus {
    pub running: bool,
    pub current_ip: Option<String>,
    pub last_job_id: Option<String>,
    pub last_job_state: Option<String>,
    /// RFC3339 of the earliest due candidate, or null when nothing is due.
    pub next_due_at: Option<String>,
    pub due_count: usize,
    pub config: ScanConfig,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanOutcome {
    pub ip: String,
    pub trigger: String,
    pub started_at: i64,
    pub state: String,
    pub open_ports: Vec<u16>,
    pub probe_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteRecord {
    pub id: i64,
    pub ip: Option<String>,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Unix-milliseconds → RFC3339 (UTC). Used for next-due display.
pub fn rfc3339(ms: i64) -> String {
    chrono::DateTime::from_timestamp(ms.div_euclid(1000), (ms.rem_euclid(1000) * 1_000_000) as u32)
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// Accepted inventory addresses. Multicast, unspecified, broadcast, and
/// IPv6 link-local addresses are rejected — the inventory is for
/// investigable unicast hosts only.
pub fn validate_inventory_ip(ip: &str) -> Result<IpAddr, String> {
    let parsed: IpAddr = ip
        .trim()
        .parse()
        .map_err(|_| "Enter a valid IP address".to_string())?;
    match parsed {
        IpAddr::V4(v) if v.is_unspecified() || v.is_multicast() || v == Ipv4Addr::BROADCAST => {
            Err("Unspecified, multicast and broadcast addresses are not allowed".into())
        }
        IpAddr::V6(v) if v.is_unspecified() || v.is_multicast() => {
            Err("Unspecified and multicast addresses are not allowed".into())
        }
        IpAddr::V6(v) if (v.segments()[0] & 0xffc0) == 0xfe80 => {
            Err("IPv6 link-local addresses require a scope and are not supported".into())
        }
        IpAddr::V6(v) if v.to_ipv4_mapped().is_some() => {
            validate_inventory_ip(&v.to_ipv4_mapped().unwrap().to_string())
        }
        _ => Ok(parsed),
    }
}

// ------------------------------------------------------------------
// Pure scheduling + inference logic (unit-tested below)
// ------------------------------------------------------------------

/// When is this record next eligible for an automatic scan? Applies the
/// configured interval plus exponential backoff on consecutive failures
/// (doubled each failure, capped at 24h). Hosts stuck at the failure cap
/// need a manual re-enable ("Scan now") before they re-enter the schedule.
pub fn candidate_next_due(record: &WatchtowerIpRecord, config: &ScanConfig) -> Option<i64> {
    if !config.enabled
        || record.excluded
        || !record.scan_enabled
        || record.scan_authorized_at.is_none()
        || record.scan_failures >= MAX_SCAN_FAILURES
    {
        return None;
    }
    let interval_ms = config.interval_seconds.saturating_mul(1000);
    let after_interval = record.last_seen.saturating_add(interval_ms);
    let due = match record.last_scan_at {
        // Authorized but never scanned: eligible right away so a newly
        // authorized host gets its first (light) scan on the next cycle.
        None => record.last_seen,
        Some(last_scan) => {
            let shift = record.scan_failures.clamp(0, 12) as u32;
            let backoff_ms = interval_ms
                .saturating_mul(1i64 << shift)
                .min(24 * 3600 * 1000);
            after_interval.max(last_scan.saturating_add(backoff_ms))
        }
    };
    Some(due)
}

/// Eligible automatic scan candidates, most-recently-active first.
/// Hosts whose backoff window has not elapsed are skipped; inactive hosts
/// are naturally deprioritized by the last_seen ordering.
pub fn select_scan_candidates(
    now: i64,
    records: &[WatchtowerIpRecord],
    config: &ScanConfig,
) -> Vec<String> {
    if !config.enabled {
        return vec![];
    }
    let mut due: Vec<(i64, &WatchtowerIpRecord)> = records
        .iter()
        .filter_map(|record| {
            candidate_next_due(record, config)
                .filter(|due| *due <= now)
                .map(|_| (record.last_seen, record))
        })
        .collect();
    due.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.ip.cmp(&b.1.ip)));
    due.into_iter()
        .take(config.max_runs_per_cycle.unsigned_abs() as usize)
        .map(|(_, record)| record.ip.clone())
        .collect()
}

/// Port-signature + MAC-vendor OS family inference. This is an inference
/// from explicitly observed evidence (open TCP ports, OUI vendor), never a
/// verified fingerprint; the confidence reflects how much evidence agreed.
pub fn os_inference(
    open_ports: &[u16],
    vendor: Option<&str>,
    hostname: Option<&str>,
) -> (Option<String>, Option<&'static str>, String) {
    let vendor = vendor.unwrap_or("");
    let vendor_lower = vendor.to_ascii_lowercase();
    let host_lower = hostname.unwrap_or("").to_ascii_lowercase();

    let mut families: Vec<(&'static str, u8)> = Vec::new();
    // Port signatures (weight = supporting probes).
    let mut signature = |name: &'static str, ports: &[u16], weight: u8| {
        if ports.iter().any(|port| open_ports.contains(port)) {
            families.push((name, weight));
        }
    };
    signature("Windows (SMB/RDP present)", &[445, 3389, 139], 2);
    signature("Linux/Unix (SSH present)", &[22], 1);
    signature("Network appliance (router services)", &[23, 161, 1900], 1);
    signature("Print appliance (IPP/LPR)", &[631, 515, 9100], 2);
    // Vendor OUI hints.
    if vendor_lower.contains("apple") {
        families.push(("macOS / iOS (Apple vendor OUI)", 2));
    }
    if vendor_lower.contains("raspberry") {
        families.push(("Linux (Raspberry Pi vendor OUI)", 2));
    }
    if vendor_lower.contains("vmware") {
        families.push(("Virtual machine host (VMware OUI)", 1));
    }
    if vendor_lower.contains("synology") || vendor_lower.contains("qnap") {
        families.push(("Linux NAS appliance (vendor OUI)", 2));
    }
    if host_lower.contains("desktop") || host_lower.contains("win") {
        families.push(("Windows (hostname hint)", 1));
    }

    // Collapse to the strongest agreeing family.
    families.sort_by(|a, b| b.1.cmp(&a.1));
    let basis_parts: Vec<String> = [
        (!open_ports.is_empty()).then(|| {
            format!(
                "open TCP ports {}",
                open_ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",")
            )
        }),
        (!vendor.is_empty()).then(|| format!("vendor OUI \"{vendor}\"")),
        (!host_lower.is_empty()).then(|| format!("hostname \"{host_lower}\"")),
    ]
    .into_iter()
    .flatten()
    .collect();

    match families.first() {
        Some((name, weight)) if *weight >= 2 => (
            Some((*name).to_string()),
            Some("inferred · medium confidence"),
            basis_parts.join(" + "),
        ),
        Some((name, _)) => (
            Some((*name).to_string()),
            Some("inferred · low confidence"),
            basis_parts.join(" + "),
        ),
        None => {
            let basis = basis_parts.join(" + ");
            if basis.is_empty() {
                (None, Some("unknown · no fingerprint evidence"), basis)
            } else {
                (None, Some("unknown · no matching signature"), basis)
            }
        }
    }
}

/// Intensity → conservative Scan Buddy request parameters (bounded probe
/// count, gentle 50/s engine pacing is the engine's own, low concurrency).
pub fn scan_request_for(ip: &str, intensity: &str) -> crate::services::scan_buddy::ScanRequest {
    let (ports, profile) = match intensity {
        "common" => (
            "21,22,25,53,80,110,139,143,443,445,3389",
            crate::services::scan_buddy::ScanProfile::Common,
        ),
        "registered" => (
            "1-1024",
            crate::services::scan_buddy::ScanProfile::Registered,
        ),
        // Default light: five probes per host.
        _ => (
            "22,80,443,445,3389",
            crate::services::scan_buddy::ScanProfile::Custom,
        ),
    };
    crate::services::scan_buddy::ScanRequest {
        targets: ip.to_string(),
        ports: ports.into(),
        timeout_ms: 800,
        concurrency: 2,
        authorized: true,
        profile,
    }
}

// ------------------------------------------------------------------
// Persistence
// ------------------------------------------------------------------

const RECORD_COLUMNS: &str = "ip, mac, hostname, vendor, os_guess, os_confidence, os_basis, interface, \
     first_seen, last_seen, packet_count, byte_count, flow_count, last_activity_at, source, origin, label, \
     is_excluded, scan_enabled, scan_authorized_at, open_ports, last_scan_at, scan_failures, last_scan_state, updated_at";

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<WatchtowerIpRecord> {
    Ok(WatchtowerIpRecord {
        ip: row.get(0)?,
        mac: row.get(1)?,
        hostname: row.get(2)?,
        vendor: row.get(3)?,
        os_guess: row.get(4)?,
        os_confidence: row.get(5)?,
        os_basis: row.get(6)?,
        interface: row.get(7)?,
        first_seen: row.get(8)?,
        last_seen: row.get(9)?,
        packet_count: row.get::<_, i64>(10)?.max(0) as u64,
        byte_count: row.get::<_, i64>(11)?.max(0) as u64,
        flow_count: row.get::<_, i64>(12)?.max(0) as u64,
        last_activity_at: row.get(13)?,
        source: row.get(14)?,
        origin: row.get(15)?,
        label: row.get(16)?,
        excluded: row.get::<_, i64>(17)? != 0,
        scan_enabled: row.get::<_, i64>(18)? != 0,
        scan_authorized_at: row.get(19)?,
        open_ports: row.get(20)?,
        last_scan_at: row.get(21)?,
        scan_failures: row.get(22)?,
        last_scan_state: row.get(23)?,
        updated_at: row.get(24)?,
    })
}

fn conn() -> Result<rusqlite::Connection, String> {
    let conn = crate::database::sqlite::open_conn().map_err(|e| e.to_string())?;
    crate::database::sqlite::initialize_watchtower_intel_tables(&conn)
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Upserts passive observations. Existing richer data is never downgraded:
/// a newer observation can fill an unknown field but cannot overwrite a
/// known value, and it never touches manual origin rows' user fields.
pub fn record_observations(observations: &[IpObservation]) {
    let Ok(conn) = conn() else { return };
    for obs in observations {
        let Ok(ip) = validate_inventory_ip(&obs.ip) else { continue };
        let ip_text = ip.to_string();
        let now = now_ms();
        let activity = obs.activity_at.unwrap_or(now).min(now);
        let _ = conn.execute(
            &format!(
                "INSERT INTO watchtower_ips ({RECORD_COLUMNS})
                 VALUES (?1,?2,?3,?4,NULL,NULL,NULL,?5,?6,?7,?8,?9,?10,?11,?12,'observed',NULL,0,0,NULL,NULL,NULL,0,NULL,?13)
                 ON CONFLICT(ip) DO UPDATE SET
                   last_seen = MAX(last_seen, excluded.last_seen),
                   packet_count = packet_count + excluded.packet_count,
                   byte_count = byte_count + excluded.byte_count,
                   flow_count = flow_count + excluded.flow_count,
                   last_activity_at = MAX(COALESCE(last_activity_at, 0), excluded.last_activity_at),
                   updated_at = excluded.updated_at"
            ),
            rusqlite::params![
                ip_text,
                obs.mac,
                obs.hostname,
                obs.vendor,
                obs.interface,
                activity.min(now),
                activity,
                obs.packets as i64,
                obs.bytes as i64,
                obs.flows as i64,
                activity,
                obs.source,
                now,
            ],
        );
        // Fill unknown enrichment fields from later observations without
        // downgrading known values.
        let _ = conn.execute(
            "UPDATE watchtower_ips SET
               mac = COALESCE(mac, ?2),
               hostname = COALESCE(hostname, ?3),
               vendor = COALESCE(vendor, ?4),
               interface = COALESCE(interface, ?5)
             WHERE ip = ?1",
            rusqlite::params![ip_text, obs.mac, obs.hostname, obs.vendor, obs.interface],
        );
        // Track the strongest provenance label without erasing manual origin.
        let _ = conn.execute(
            "UPDATE watchtower_ips SET source = ?2 WHERE ip = ?1 AND source != 'manual'",
            rusqlite::params![ip_text, obs.source],
        );
    }
}

pub fn list_records(limit: usize) -> Vec<WatchtowerIpRecord> {
    let Ok(conn) = conn() else { return vec![] };
    let mut stmt = match conn.prepare(&format!(
        "SELECT {RECORD_COLUMNS} FROM watchtower_ips ORDER BY last_seen DESC LIMIT ?1"
    )) {
        Ok(stmt) => stmt,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map([limit.min(MAX_INVENTORY_ROWS) as i64], row_to_record);
    let Ok(rows) = rows else { return vec![] };
    rows.filter_map(|row| row.ok()).collect()
}

pub fn get_record(ip: &str) -> Option<WatchtowerIpRecord> {
    let Ok(conn) = conn() else { return None };
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {RECORD_COLUMNS} FROM watchtower_ips WHERE ip = ?1"
        ))
        .ok()?;
    stmt.query_row([ip], row_to_record).ok()
}

pub struct ManualEdit {
    pub ip: String,
    pub label: Option<String>,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub excluded: Option<bool>,
    pub scan_enabled: Option<bool>,
}

/// Manual add/update from the user. Manual writes are authoritative for the
/// fields the user provided; `origin` becomes `manual`.
pub fn save_manual(edit: &ManualEdit) -> Result<WatchtowerIpRecord, String> {
    let ip = validate_inventory_ip(&edit.ip)?;
    let ip_text = ip.to_string();
    let conn = conn()?;
    let now = now_ms();
    let existing = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {RECORD_COLUMNS} FROM watchtower_ips WHERE ip = ?1"
            ))
            .map_err(|e| e.to_string())?;
        stmt.query_row([&ip_text], row_to_record)
            .optional()
            .map_err(|e| e.to_string())?
    };
    if let Some(_previous) = existing {
        // User is editing an existing row: apply provided fields only.
        conn.execute(
            "UPDATE watchtower_ips SET
               label = COALESCE(?2, label),
               mac = COALESCE(?3, mac),
               hostname = COALESCE(?4, hostname),
               vendor = COALESCE(?5, vendor),
               is_excluded = COALESCE(?6, is_excluded),
               scan_enabled = COALESCE(?7, scan_enabled),
               scan_authorized_at = CASE
                 WHEN ?7 = 1 AND scan_authorized_at IS NULL THEN ?8 ELSE scan_authorized_at END,
               origin = 'manual',
               updated_at = ?8
             WHERE ip = ?1",
            rusqlite::params![
                ip_text,
                edit.label,
                edit.mac,
                edit.hostname,
                edit.vendor,
                edit.excluded.map(|flag| flag as i64),
                edit.scan_enabled.map(|flag| flag as i64),
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let first_seen = now;
        conn.execute(
            &format!(
                "INSERT INTO watchtower_ips ({RECORD_COLUMNS})
                 VALUES (?1,?2,?3,?4,NULL,NULL,NULL,NULL,?5,?5,0,0,0,NULL,'manual','manual',?6,?7,?8,?9,NULL,NULL,0,NULL,?5)"
            ),
            rusqlite::params![
                ip_text,
                edit.mac,
                edit.hostname,
                edit.vendor,
                first_seen,
                edit.label,
                edit.excluded.unwrap_or(false) as i64,
                edit.scan_enabled.unwrap_or(false) as i64,
                edit.scan_enabled.unwrap_or(false).then_some(first_seen),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    get_record(&ip_text).ok_or_else(|| "Saved record could not be read back".to_string())
}

/// Flags update (exclude / scan authorization). Enabling auto-scan records
/// the explicit user authorization timestamp required for later scans.
pub fn set_flags(
    ip: &str,
    excluded: Option<bool>,
    scan_enabled: Option<bool>,
) -> Result<WatchtowerIpRecord, String> {
    let ip_text = validate_inventory_ip(ip)?.to_string();
    let conn = conn()?;
    let now = now_ms();
    conn.execute(
        "UPDATE watchtower_ips SET
           is_excluded = COALESCE(?2, is_excluded),
           scan_enabled = COALESCE(?3, scan_enabled),
           scan_authorized_at = CASE
             WHEN ?3 = 1 THEN ?4
             WHEN ?3 = 0 THEN NULL
             ELSE scan_authorized_at END,
           scan_failures = CASE WHEN ?3 = 1 THEN 0 ELSE scan_failures END,
           updated_at = ?4
         WHERE ip = ?1",
        rusqlite::params![
            ip_text,
            excluded.map(|flag| flag as i64),
            scan_enabled.map(|flag| flag as i64),
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    get_record(&ip_text).ok_or_else(|| "Updated record could not be read back".to_string())
}

pub fn remove_record(ip: &str) -> Result<(), String> {
    let ip_text = validate_inventory_ip(ip)?.to_string();
    let conn = conn()?;
    conn.execute("DELETE FROM watchtower_ips WHERE ip = ?1", [&ip_text])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM watchtower_notes WHERE ip = ?1", [&ip_text])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM watchtower_scan_history WHERE ip = ?1",
        [&ip_text],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_config() -> ScanConfig {
    let Ok(conn) = conn() else {
        return ScanConfig::default();
    };
    conn.query_row(
        "SELECT enabled, interval_seconds, intensity, max_runs_per_cycle
         FROM watchtower_scan_config WHERE id = 1",
        [],
        |row| {
            Ok(ScanConfig {
                enabled: row.get::<_, i64>(0)? != 0,
                interval_seconds: row.get(1)?,
                intensity: row.get(2)?,
                max_runs_per_cycle: row.get(3)?,
            })
        },
    )
    .unwrap_or_default()
}

pub fn set_config(config: &ScanConfig) -> Result<ScanConfig, String> {
    let mut validated = config.clone();
    validated.interval_seconds = validated.interval_seconds.clamp(300, 86400);
    validated.max_runs_per_cycle = validated.max_runs_per_cycle.clamp(1, 16);
    if !matches!(
        validated.intensity.as_str(),
        "light" | "common" | "registered"
    ) {
        validated.intensity = "light".into();
    }
    let conn = conn()?;
    conn.execute(
        "UPDATE watchtower_scan_config
         SET enabled = ?2, interval_seconds = ?3, intensity = ?4, max_runs_per_cycle = ?5, updated_at = ?6
         WHERE id = 1",
        rusqlite::params![
            1,
            validated.enabled as i64,
            validated.interval_seconds,
            validated.intensity,
            validated.max_runs_per_cycle,
            now_ms(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(get_config())
}

pub fn record_scan_outcome(outcome: &ScanOutcome) {
    // "skipped-busy" means the shared engine was occupied: nothing was
    // probed, so it must not pollute history, last_scan_at, or backoff.
    if outcome.state == "skipped-busy" {
        return;
    }
    let Ok(conn) = conn() else { return };
    let now = now_ms();
    let open_ports_json = if outcome.open_ports.is_empty() {
        None
    } else {
        serde_json::to_string(&outcome.open_ports).ok()
    };
    let _ = conn.execute(
        "INSERT INTO watchtower_scan_history (ip, trigger, started_at, finished_at, state, open_ports, probe_count, error)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![
            outcome.ip,
            outcome.trigger,
            outcome.started_at,
            now,
            outcome.state,
            open_ports_json,
            outcome.probe_count as i64,
            outcome.error,
        ],
    );
    let _ = conn.execute(
        "DELETE FROM watchtower_scan_history WHERE id NOT IN (
            SELECT id FROM watchtower_scan_history ORDER BY id DESC LIMIT ?1)",
        [MAX_SCAN_HISTORY as i64],
    );
    let _ = conn.execute(
        "UPDATE watchtower_ips SET
           last_scan_at = ?2,
           open_ports = COALESCE(?3, open_ports),
           last_scan_state = ?4,
           scan_failures = CASE WHEN ?4 = 'completed' THEN 0 ELSE scan_failures + 1 END,
           updated_at = ?2
         WHERE ip = ?1",
        rusqlite::params![outcome.ip, now, open_ports_json, outcome.state],
    );
    // Refresh the inferred OS family from the newest open-port evidence.
    if !outcome.open_ports.is_empty() {
        let record = get_record(&outcome.ip);
        let (guess, confidence, basis) = os_inference(
            &outcome.open_ports,
            record.as_ref().and_then(|r| r.vendor.as_deref()),
            record.as_ref().and_then(|r| r.hostname.as_deref()),
        );
        let _ = conn.execute(
            "UPDATE watchtower_ips SET os_guess = ?2, os_confidence = ?3, os_basis = ?4 WHERE ip = ?1",
            rusqlite::params![outcome.ip, guess, confidence, basis],
        );
    }
}

pub fn scan_history(ip: Option<&str>, limit: usize) -> Vec<serde_json::Value> {
    let Ok(conn) = conn() else { return vec![] };
    let limit = limit.clamp(1, MAX_SCAN_HISTORY) as i64;
    let prepared = match ip {
        Some(_) => conn.prepare(
            "SELECT id, ip, trigger, started_at, finished_at, state, open_ports, probe_count, error
             FROM watchtower_scan_history WHERE ip = ?1 ORDER BY id DESC LIMIT ?2",
        ),
        None => conn.prepare(
            "SELECT id, ip, trigger, started_at, finished_at, state, open_ports, probe_count, error
             FROM watchtower_scan_history ORDER BY id DESC LIMIT ?1",
        ),
    };
    let mut stmt = match prepared {
        Ok(stmt) => stmt,
        Err(_) => return vec![],
    };
    let mapper = |row: &rusqlite::Row<'_>| -> rusqlite::Result<serde_json::Value> {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "ip": row.get::<_, String>(1)?,
            "trigger": row.get::<_, String>(2)?,
            "started_at": row.get::<_, i64>(3)?,
            "finished_at": row.get::<_, Option<i64>>(4)?,
            "state": row.get::<_, String>(5)?,
            "open_ports": row.get::<_, Option<String>>(6)?
                .and_then(|text| serde_json::from_str::<Vec<u16>>(&text).ok()),
            "probe_count": row.get::<_, Option<i64>>(7)?,
            "error": row.get::<_, Option<String>>(8)?,
        }))
    };
    let rows = match ip {
        Some(ip) => stmt.query_map(rusqlite::params![ip, limit], mapper),
        None => stmt.query_map(rusqlite::params![limit], mapper),
    };
    let Ok(rows) = rows else { return vec![] };
    rows.filter_map(|row| row.ok()).collect()
}

// ------------------------------------------------------------------
// Notes
// ------------------------------------------------------------------

fn note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteRecord> {
    Ok(NoteRecord {
        id: row.get(0)?,
        ip: row.get(1)?,
        body: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn list_notes(ip: Option<&str>, limit: usize) -> Vec<NoteRecord> {
    let Ok(conn) = conn() else { return vec![] };
    let limit = limit.clamp(1, MAX_NOTES) as i64;
    let prepared = match ip {
        Some(_) => conn.prepare(
            "SELECT id, ip, body, created_at, updated_at FROM watchtower_notes
             WHERE ip = ?1 ORDER BY updated_at DESC LIMIT ?2",
        ),
        None => conn.prepare(
            "SELECT id, ip, body, created_at, updated_at FROM watchtower_notes
             ORDER BY updated_at DESC LIMIT ?1",
        ),
    };
    let mut stmt = match prepared {
        Ok(stmt) => stmt,
        Err(_) => return vec![],
    };
    let rows = match ip {
        Some(ip) => stmt.query_map(rusqlite::params![ip, limit], note_from_row),
        None => stmt.query_map(rusqlite::params![limit], note_from_row),
    };
    let Ok(rows) = rows else { return vec![] };
    rows.filter_map(|row| row.ok()).collect()
}

/// Creates or updates a note. Passing `id` updates in place (autosave);
/// the updated_at timestamp is always refreshed server-side.
pub fn save_note(id: Option<i64>, ip: Option<&str>, body: &str) -> Result<NoteRecord, String> {
    let body = body.trim();
    if body.is_empty() {
        return Err("Note text is required".into());
    }
    if body.len() > 32_000 {
        return Err("Note text is too long (32,000 character limit)".into());
    }
    let ip = match ip {
        Some(value) if !value.trim().is_empty() => Some(validate_inventory_ip(value)?.to_string()),
        _ => None,
    };
    let conn = conn()?;
    let now = now_ms();
    let note_id = match id {
        Some(existing) => {
            let changed = conn
                .execute(
                    "UPDATE watchtower_notes SET body = ?2, updated_at = ?3,
                       ip = COALESCE(?4, ip) WHERE id = ?1",
                    rusqlite::params![existing, body, now, ip],
                )
                .map_err(|e| e.to_string())?;
            if changed == 0 {
                return Err("Note no longer exists".into());
            }
            existing
        }
        None => {
            conn.execute(
                "INSERT INTO watchtower_notes (ip, body, created_at, updated_at) VALUES (?1,?2,?3,?3)",
                rusqlite::params![ip, body, now],
            )
            .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
    };
    list_notes(None, MAX_NOTES)
        .into_iter()
        .find(|note| note.id == note_id)
        .ok_or_else(|| "Saved note could not be read back".to_string())
}

pub fn delete_note(id: i64) -> Result<(), String> {
    let conn = conn()?;
    conn.execute("DELETE FROM watchtower_notes WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------------
// Investigation
// ------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct IpInvestigation {
    pub record: WatchtowerIpRecord,
    /// Present only for public addresses resolved via the existing GeoIP
    /// service; local/private addresses carry an explanatory note instead.
    pub geoip: Option<crate::models::GeoIpEntry>,
    pub geoip_note: String,
    pub dns_records: Vec<crate::models::DnsQueryEntry>,
    pub port_scan: Vec<crate::models::PortScanEntry>,
    pub scan_history: Vec<serde_json::Value>,
    pub notes: Vec<NoteRecord>,
    pub scan_eligible: bool,
}

fn is_private(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private(),
        IpAddr::V6(v) => v.is_loopback() || (v.segments()[0] & 0xff00) == 0xfd00,
    }
}

pub fn investigate(ip: &str) -> Result<IpInvestigation, String> {
    let ip_text = validate_inventory_ip(ip)?.to_string();
    let record =
        get_record(&ip_text).ok_or_else(|| "IP is not in the Watchtower inventory".to_string())?;
    let parsed: IpAddr = ip_text.parse().expect("validated address");
    let geoip = crate::database::sqlite::load_geoip(&ip_text);
    let geoip_note = if is_private(parsed) {
        "Local/private address — public geolocation does not apply.".into()
    } else if geoip.is_none() {
        "No geolocation record yet; the Overview enrichment resolves it when the address is seen in traffic.".into()
    } else {
        "Resolved by the existing NET0ZE GeoIP service (passive enrichment).".into()
    };
    let config = get_config();
    let scan_eligible = candidate_next_due(&record, &config).is_some();
    Ok(IpInvestigation {
        record,
        geoip,
        geoip_note,
        dns_records: crate::database::sqlite::load_dns_records_for_ip(&ip_text, 50),
        port_scan: crate::database::sqlite::load_port_scan_for_ip(&ip_text, 100),
        scan_history: scan_history(Some(&ip_text), 25),
        notes: list_notes(Some(&ip_text), 100),
        scan_eligible,
    })
}

// ------------------------------------------------------------------
// Scan execution (reuses the shared Scan Buddy engine)
// ------------------------------------------------------------------

fn outcome_placeholder(ip: &str, trigger: &str) -> ScanOutcome {
    ScanOutcome {
        ip: ip.into(),
        trigger: trigger.into(),
        started_at: now_ms(),
        state: "failed".into(),
        open_ports: vec![],
        probe_count: 0,
        error: None,
    }
}

async fn run_scan_via_buddy(
    buddy: &crate::services::scan_buddy::ScanBuddyState,
    ip: &str,
    trigger: &str,
    intensity: &str,
) -> ScanOutcome {
    let started_at = now_ms();
    let request = scan_request_for(ip, intensity);
    let job = match buddy.start(request) {
        Ok(job) => job,
        Err(error) => {
            let state = if error.contains("already running") {
                "skipped-busy"
            } else {
                "failed"
            };
            return ScanOutcome {
                state: state.into(),
                error: Some(error),
                ..outcome_placeholder(ip, trigger)
            };
        }
    };
    // Bounded wait for the job to settle. Light/common jobs finish in
    // seconds; the deadline only guards against a wedged engine.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    let job_id = job.id.clone();
    let mut latest: Option<crate::services::scan_buddy::ScanJob> = None;
    loop {
        match buddy.status(&job_id) {
            Ok(current) => {
                if matches!(
                    current.state.as_str(),
                    "COMPLETED" | "CANCELLED" | "FAILED"
                ) {
                    latest = Some(current);
                    break;
                }
            }
            Err(error) => {
                return ScanOutcome {
                    error: Some(error),
                    ..outcome_placeholder(ip, trigger)
                };
            }
        }
        if std::time::Instant::now() >= deadline {
            let _ = buddy.cancel(&job_id);
            if let Some(job) = latest.as_mut() {
                job.state = "CANCELLED".into();
            }
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    let Some(finished) = latest else {
        return ScanOutcome {
            error: Some("Scan job disappeared from engine history".into()),
            ..outcome_placeholder(ip, trigger)
        };
    };
    let open_ports: Vec<u16> = finished
        .results
        .iter()
        .filter(|result| result.state == "OPEN")
        .map(|result| result.port)
        .collect();
    let state = match finished.state.as_str() {
        "COMPLETED" if finished.error.is_none() => "completed",
        "COMPLETED" => "partial",
        "CANCELLED" => "cancelled",
        _ => "failed",
    };
    ScanOutcome {
        ip: ip.into(),
        trigger: trigger.into(),
        started_at,
        state: state.into(),
        open_ports,
        probe_count: finished.completed_probes,
        error: finished.error.clone(),
    }
}

/// Runs one scan immediately. Requires the explicit per-IP authorization
/// (scan_enabled); `force` is used by the manual "Scan now" button, which
/// authorizes in the same click.
pub async fn scan_now(
    buddy: &crate::services::scan_buddy::ScanBuddyState,
    ip: &str,
    force: bool,
) -> Result<ScanOutcome, String> {
    let record =
        get_record(ip).ok_or_else(|| "IP is not in the Watchtower inventory".to_string())?;
    if record.excluded {
        return Err("This address is excluded from scanning. Re-enable it first.".into());
    }
    if !record.scan_enabled && !force {
        return Err(
            "Automatic scanning is not enabled for this address; authorize it explicitly first."
                .into(),
        );
    }
    let intensity = get_config().intensity;
    let outcome = run_scan_via_buddy(buddy, &record.ip, "manual", &intensity).await;
    record_scan_outcome(&outcome);
    Ok(outcome)
}

// ------------------------------------------------------------------
// Background scheduler
// ------------------------------------------------------------------

#[derive(Default)]
pub struct IpIntelState {
    pub stop: Arc<AtomicBool>,
}

impl IpIntelState {
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

/// Ticks the scheduler. Candidates are chosen from persisted eligibility
/// rules, prioritized by recent activity, and scanned sequentially through
/// the shared Scan Buddy engine (one host per cycle slot; the loop yields
/// when the engine is busy with a manual scan).
pub fn spawn_worker(app: tauri::AppHandle) {
    let stop = app.state::<IpIntelState>().stop.clone();
    tauri::async_runtime::spawn(async move {
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            if stop.load(Ordering::SeqCst) {
                break;
            }
            tick += 1;
            // Skip the very first tick so startup IO settles first.
            if tick == 1 {
                continue;
            }
            let config = get_config();
            if !config.enabled {
                continue;
            }
            let records = list_records(MAX_INVENTORY_ROWS);
            let candidates = select_scan_candidates(now_ms(), &records, &config);
            if candidates.is_empty() {
                continue;
            }
            let buddy = app.state::<crate::services::scan_buddy::ScanBuddyState>();
            for ip in candidates {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                let outcome = run_scan_via_buddy(&buddy, &ip, "auto", &config.intensity).await;
                if outcome.state == "skipped-busy" {
                    // Engine busy with a manual scan; try again next tick.
                    break;
                }
                record_scan_outcome(&outcome);
            }
        }
    });
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Disposable storage mirroring tests/support/mod.rs; the shared
    /// test_isolation mutex also protects non-isolated default-DB tests
    /// from this test's process-wide environment override.
    use crate::services::test_isolation::isolated_data;

    fn record(ip: &str, last_seen: i64, last_scan: Option<i64>, failures: i64) -> WatchtowerIpRecord {
        WatchtowerIpRecord {
            ip: ip.into(),
            mac: None,
            hostname: None,
            vendor: None,
            os_guess: None,
            os_confidence: None,
            os_basis: None,
            interface: None,
            first_seen: last_seen - 1000,
            last_seen,
            packet_count: 0,
            byte_count: 0,
            flow_count: 0,
            last_activity_at: None,
            source: "passive-discovery".into(),
            origin: "observed".into(),
            label: None,
            excluded: false,
            scan_enabled: true,
            scan_authorized_at: Some(last_seen - 1000),
            open_ports: None,
            last_scan_at: last_scan,
            scan_failures: failures,
            last_scan_state: None,
            updated_at: last_seen,
        }
    }

    #[test]
    fn inventory_ip_validation_rejects_non_investigable_addresses() {
        assert!(validate_inventory_ip("192.168.1.10").is_ok());
        assert!(validate_inventory_ip("::1").is_ok());
        assert!(validate_inventory_ip("224.0.0.1").is_err());
        assert!(validate_inventory_ip("255.255.255.255").is_err());
        assert!(validate_inventory_ip("0.0.0.0").is_err());
        assert!(validate_inventory_ip("fe80::1").is_err());
        assert!(validate_inventory_ip("not-an-ip").is_err());
        // IPv4-mapped IPv6 normalizes to IPv4.
        assert_eq!(
            validate_inventory_ip("::ffff:192.0.2.1").unwrap().to_string(),
            "192.0.2.1"
        );
    }

    #[test]
    fn scan_candidates_respect_enablement_interval_and_backoff() {
        let config = ScanConfig {
            enabled: true,
            interval_seconds: 900,
            intensity: "light".into(),
            max_runs_per_cycle: 4,
        };
        let now = 10_000_000;
        let mut records = vec![
            record("192.168.1.2", now, None, 0), // never scanned → due
            record("192.168.1.3", now - 3_600_000, Some(now - 3_600_000), 0), // interval elapsed → due
            record("192.168.1.4", now, Some(now - 60_000), 0), // scanned recently → not due
        ];
        let candidates = select_scan_candidates(now, &records, &config);
        assert_eq!(candidates, vec!["192.168.1.2", "192.168.1.3"]);

        // Failing host backs off beyond the plain interval.
        records.push(record("192.168.1.5", now - 3_600_000, Some(now - 3_600_000), 3));
        let candidates = select_scan_candidates(now, &records, &config);
        assert!(
            !candidates.contains(&"192.168.1.5".to_string()),
            "failed host must back off"
        );

        // A host at the failure cap leaves the automatic schedule entirely.
        let capped = record("192.168.1.9", now, None, MAX_SCAN_FAILURES);
        assert!(candidate_next_due(&capped, &config).is_none());

        // Excluded or non-authorized hosts are never candidates.
        let mut blocked = record("192.168.1.6", now, None, 0);
        blocked.excluded = true;
        let mut unauthed = record("192.168.1.7", now, None, 0);
        unauthed.scan_authorized_at = None;
        let candidates = select_scan_candidates(now, &[blocked, unauthed], &config);
        assert!(candidates.is_empty());

        // Disabled config → nothing runs even for eligible hosts.
        let disabled = ScanConfig { enabled: false, ..config.clone() };
        assert!(select_scan_candidates(now, &records, &disabled).is_empty());

        let due = candidate_next_due(&record("192.168.1.8", now, None, 0), &config).unwrap();
        assert!(due <= now, "never-scanned host is immediately due");
    }

    #[test]
    fn candidates_are_prioritized_by_recent_activity_and_capped() {
        let config = ScanConfig {
            enabled: true,
            interval_seconds: 300,
            intensity: "light".into(),
            max_runs_per_cycle: 2,
        };
        let now = 20_000_000;
        let records = vec![
            record("10.0.0.1", now - 500, None, 0),
            record("10.0.0.2", now - 900_000, None, 0),
            record("10.0.0.3", now - 100, None, 0),
            record("10.0.0.4", now - 10, None, 0),
        ];
        let candidates = select_scan_candidates(now, &records, &config);
        assert_eq!(
            candidates,
            vec!["10.0.0.4", "10.0.0.3"],
            "most recently active first, capped at max_runs_per_cycle"
        );
    }

    #[test]
    fn os_inference_is_honest_about_confidence_and_unknowns() {
        // Windows signature: two agreeing ports → medium confidence.
        let (guess, confidence, _) = os_inference(&[445, 3389], Some("Microsoft"), None);
        assert_eq!(guess.as_deref(), Some("Windows (SMB/RDP present)"));
        assert_eq!(confidence, Some("inferred · medium confidence"));

        // Single SSH probe → low confidence Linux family.
        let (guess, confidence, _) = os_inference(&[22], None, None);
        assert_eq!(guess.as_deref(), Some("Linux/Unix (SSH present)"));
        assert_eq!(confidence, Some("inferred · low confidence"));

        // Vendor OUI alone (weight 2) → medium confidence, no ports needed.
        let (guess, confidence, basis) = os_inference(&[], Some("Apple, Inc."), None);
        assert!(guess.unwrap().starts_with("macOS"));
        assert_eq!(confidence, Some("inferred · medium confidence"));
        assert!(basis.contains("vendor OUI"));

        // No evidence at all → explicitly unknown.
        let (guess, confidence, _) = os_inference(&[], None, None);
        assert!(guess.is_none());
        assert_eq!(confidence, Some("unknown · no fingerprint evidence"));
    }

    #[test]
    fn scan_request_for_maps_intensity_to_conservative_bounded_probes() {
        let light = scan_request_for("192.168.1.5", "light");
        assert_eq!(light.ports, "22,80,443,445,3389");
        assert!(light.authorized, "engine requires explicit authorization");
        assert_eq!(light.concurrency, 2);
        assert_eq!(light.timeout_ms, 800);
        let common = scan_request_for("192.168.1.5", "common");
        assert_eq!(common.profile, crate::services::scan_buddy::ScanProfile::Common);
        let unknown = scan_request_for("192.168.1.5", "turbo");
        assert_eq!(
            unknown.ports, "22,80,443,445,3389",
            "unknown intensity falls back to light"
        );
    }

    #[test]
    fn observations_persist_dedupe_and_never_downgrade_known_fields() {
        let _guard = isolated_data("ip-intel-ingest");
        record_observations(&[IpObservation {
            ip: "192.168.7.10".into(),
            mac: None,
            hostname: Some("printer".into()),
            vendor: None,
            interface: Some("wlan0".into()),
            source: "passive-discovery",
            packets: 3,
            bytes: 900,
            flows: 2,
            activity_at: None,
        }]);
        let first = get_record("192.168.7.10").expect("observation persisted");
        assert_eq!(first.hostname.as_deref(), Some("printer"));
        assert_eq!(first.origin, "observed");
        assert!(!first.scan_enabled, "passive observations must not self-authorize scans");
        assert_eq!(first.packet_count, 3);

        // Second observation: counters accumulate, first_seen is stable,
        // and a new MAC fills the unknown field without touching hostname.
        let first_seen = first.first_seen;
        record_observations(&[IpObservation {
            ip: "192.168.7.10".into(),
            mac: Some("aa:bb:cc:dd:ee:ff".into()),
            hostname: None,
            vendor: Some("Raspberry Pi Trading Ltd".into()),
            interface: None,
            source: "kernel-neighbors",
            packets: 2,
            bytes: 300,
            flows: 1,
            activity_at: None,
        }]);
        let second = get_record("192.168.7.10").expect("row survives");
        assert_eq!(second.first_seen, first_seen, "first_seen must not drift");
        assert_eq!(second.mac.as_deref(), Some("aa:bb:cc:dd:ee:ff"));
        assert_eq!(second.hostname.as_deref(), Some("printer"), "known hostname is never downgraded");
        assert_eq!(second.vendor.as_deref(), Some("Raspberry Pi Trading Ltd"));
        assert_eq!(second.packet_count, 5);
        assert_eq!(second.byte_count, 1200);
        assert_eq!(second.flow_count, 3);
        assert_eq!(second.source, "kernel-neighbors");
    }

    #[test]
    fn manual_records_win_over_later_passive_observations() {
        let _guard = isolated_data("ip-intel-manual");
        let saved = save_manual(&ManualEdit {
            ip: "192.168.7.20".into(),
            label: Some("File server".into()),
            mac: Some("11:22:33:44:55:66".into()),
            hostname: None,
            vendor: None,
            excluded: Some(false),
            scan_enabled: Some(true),
        })
        .expect("manual save");
        assert_eq!(saved.origin, "manual");
        assert!(saved.scan_enabled);
        assert!(saved.scan_authorized_at.is_some());

        record_observations(&[IpObservation {
            ip: "192.168.7.20".into(),
            mac: Some("aa:aa:aa:aa:aa:aa".into()),
            hostname: Some("noise".into()),
            vendor: None,
            interface: None,
            source: "traffic",
            packets: 1,
            bytes: 10,
            flows: 1,
            activity_at: None,
        }]);
        let after = get_record("192.168.7.20").expect("row survives");
        assert_eq!(after.mac.as_deref(), Some("11:22:33:44:55:66"), "manual field must not be overwritten");
        assert_eq!(after.origin, "manual");
        assert_eq!(after.label.as_deref(), Some("File server"));
        assert_eq!(after.packet_count, 1, "activity counters still accumulate");
    }

    #[test]
    fn flags_updates_and_exclusion_block_scans() {
        let _guard = isolated_data("ip-intel-flags");
        save_manual(&ManualEdit {
            ip: "192.168.7.30".into(),
            label: None,
            mac: None,
            hostname: None,
            vendor: None,
            excluded: None,
            scan_enabled: None,
        })
        .expect("manual add");
        let enabled = set_flags("192.168.7.30", None, Some(true)).expect("enable");
        assert!(enabled.scan_enabled && enabled.scan_authorized_at.is_some());
        let excluded = set_flags("192.168.7.30", Some(true), None).expect("exclude");
        assert!(excluded.excluded);
        let config = ScanConfig {
            enabled: true,
            interval_seconds: 300,
            intensity: "light".into(),
            max_runs_per_cycle: 4,
        };
        assert!(select_scan_candidates(50_000_000, &[excluded], &config).is_empty());
        // Disabling authorization clears the recorded authorization.
        let disabled = set_flags("192.168.7.30", None, Some(false)).expect("disable");
        assert!(!disabled.scan_enabled && disabled.scan_authorized_at.is_none());
    }

    #[test]
    fn remove_record_cleans_inventory_history_and_notes() {
        let _guard = isolated_data("ip-intel-remove");
        save_manual(&ManualEdit {
            ip: "192.168.7.40".into(),
            label: None,
            mac: None,
            hostname: None,
            vendor: None,
            excluded: None,
            scan_enabled: None,
        })
        .expect("manual add");
        save_note(None, Some("192.168.7.40"), "linked note").expect("note");
        remove_record("192.168.7.40").expect("remove");
        assert!(get_record("192.168.7.40").is_none());
        assert!(list_notes(Some("192.168.7.40"), 10).is_empty());
    }

    #[test]
    fn scan_config_is_validated_and_persisted() {
        let _guard = isolated_data("ip-intel-config");
        let default = get_config();
        assert!(!default.enabled, "auto-scan ships disabled");
        assert_eq!(default.interval_seconds, 900);
        let saved = set_config(&ScanConfig {
            enabled: true,
            interval_seconds: 5, // below the 300s floor
            intensity: "turbo".into(), // unknown intensity
            max_runs_per_cycle: 999, // above the cap
        })
        .expect("config save");
        assert_eq!(saved.interval_seconds, 300);
        assert_eq!(saved.intensity, "light");
        assert_eq!(saved.max_runs_per_cycle, 16);
        assert!(saved.enabled);
    }

    #[test]
    fn scan_outcome_persists_history_and_updates_inventory() {
        let _guard = isolated_data("ip-intel-outcome");
        save_manual(&ManualEdit {
            ip: "192.168.7.50".into(),
            label: None,
            mac: None,
            hostname: None,
            vendor: Some("Raspberry Pi Trading Ltd".into()),
            excluded: None,
            scan_enabled: Some(true),
        })
        .expect("manual add");
        record_scan_outcome(&ScanOutcome {
            ip: "192.168.7.50".into(),
            trigger: "auto".into(),
            started_at: now_ms() - 1_000,
            state: "completed".into(),
            open_ports: vec![22, 80],
            probe_count: 5,
            error: None,
        });
        let updated = get_record("192.168.7.50").expect("row survives");
        assert!(updated.last_scan_at.is_some());
        assert_eq!(updated.last_scan_state.as_deref(), Some("completed"));
        assert_eq!(updated.scan_failures, 0);
        assert!(updated.open_ports.is_some(), "open ports JSON stored");
        assert_eq!(
            updated.os_guess.as_deref(),
            Some("Linux (Raspberry Pi vendor OUI)"),
            "OS inference refreshed; the weightier OUI evidence outranks the SSH port signature"
        );
        let history = scan_history(Some("192.168.7.50"), 10);
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["trigger"], "auto");
        assert_eq!(history[0]["state"], "completed");

        // A failed scan increments the backoff counter.
        record_scan_outcome(&ScanOutcome {
            ip: "192.168.7.50".into(),
            trigger: "auto".into(),
            started_at: now_ms(),
            state: "failed".into(),
            open_ports: vec![],
            probe_count: 0,
            error: Some("timeout".into()),
        });
        let failed = get_record("192.168.7.50").expect("row survives");
        assert_eq!(failed.scan_failures, 1);
        assert_eq!(scan_history(Some("192.168.7.50"), 10).len(), 2);
    }

    #[test]
    fn notes_round_trip_with_timestamps_and_autosave_updates() {
        let _guard = isolated_data("ip-intel-notes");
        let created = save_note(None, Some("192.168.7.60"), "First observation: odd ARP behavior.")
            .expect("create");
        assert!(created.id > 0);
        assert_eq!(created.ip.as_deref(), Some("192.168.7.60"));
        assert_eq!(created.created_at, created.updated_at, "fresh note timestamps agree");

        let updated = save_note(Some(created.id), Some("192.168.7.60"), "Follow-up: vendor resolved.")
            .expect("autosave update");
        assert_eq!(updated.id, created.id);
        assert!(updated.updated_at >= created.updated_at);
        assert_eq!(updated.body, "Follow-up: vendor resolved.");

        let general = save_note(None, None, "General investigation note for the session.")
            .expect("general note");
        assert!(general.ip.is_none());

        // Filtered listing only returns the requested scope.
        let for_ip = list_notes(Some("192.168.7.60"), 50);
        assert_eq!(for_ip.len(), 1);
        let all = list_notes(None, 50);
        assert_eq!(all.len(), 2);

        delete_note(created.id).expect("delete");
        assert!(list_notes(Some("192.168.7.60"), 50).is_empty());
        assert!(save_note(None, None, "   ").is_err(), "blank notes are rejected");
    }

    #[test]
    fn investigation_combines_all_persisted_evidence() {
        let _guard = isolated_data("ip-intel-investigate");
        save_manual(&ManualEdit {
            ip: "192.168.7.70".into(),
            label: Some("Investigation target".into()),
            mac: None,
            hostname: None,
            vendor: None,
            excluded: None,
            scan_enabled: Some(true),
        })
        .expect("manual add");
        crate::database::sqlite::upsert_port_scan(&crate::models::PortScanEntry {
            ip: "192.168.7.70".into(),
            port: 22,
            protocol: "TCP".into(),
            state: "OPEN".into(),
            service: "SSH".into(),
            first_seen: 1,
            last_seen: 2,
        });
        save_note(None, Some("192.168.7.70"), "Port 22 open in last sweep.").expect("note");
        // scan_eligible requires the global auto-scan schedule to be on.
        set_config(&ScanConfig {
            enabled: true,
            interval_seconds: 900,
            intensity: "light".into(),
            max_runs_per_cycle: 4,
        })
        .expect("enable schedule");
        let investigation = investigate("192.168.7.70").expect("investigation");
        assert_eq!(investigation.record.label.as_deref(), Some("Investigation target"));
        assert_eq!(investigation.port_scan.len(), 1);
        assert_eq!(investigation.notes.len(), 1);
        assert!(investigation.geoip.is_none(), "private addresses carry no geoip");
        assert!(investigation.geoip_note.contains("Local/private"));
        assert!(investigation.scan_eligible, "authorized + enabled host is schedulable");

        // Unknown addresses are rejected with a clear error.
        assert!(investigate("192.168.7.99").is_err());
    }
}

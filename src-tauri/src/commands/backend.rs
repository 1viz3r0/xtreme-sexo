use crate::{models::*, state::BackendState};
use tauri::{command, State};

/// Explicit API actions. No worker is scheduled and no interface is opened.
#[command]
pub async fn refresh_public_ip(state: State<'_, BackendState>) -> Result<String, String> {
    let result = state.geoip.resolve_public_ip_checked().await;
    tracing::info!(success = result.is_ok(), provider = "ipify", "Public IP refresh completed");
    result
}

#[command]
pub async fn refresh_geoip_lookup(ip: String, state: State<'_, BackendState>) -> Result<GeoIpEntry, String> {
    let result = state.geoip.lookup_checked(&ip).await;
    tracing::info!(success = result.is_ok(), provider = "ipwho.is", "GeoIP lookup completed");
    result
}

#[command]
pub async fn check_connectivity(state: State<'_, BackendState>) -> Result<ConnectivityStatus, String> {
    let (ok, source, latency, detail) = crate::services::connectivity_monitor::probe().await;
    let timestamp = crate::services::logging::india_timestamp(chrono::Utc::now());
    let mut current = state.connectivity.lock().map_err(|_| "Connectivity state unavailable")?;
    *current = ConnectivityStatus {
        state: if ok { "ONLINE" } else { "OFFLINE" }.into(), source, last_checked: timestamp.clone(),
        last_success: if ok { Some(timestamp) } else { current.last_success.clone() },
        latency_ms: if ok { Some(latency) } else { None }, detail,
    };
    tracing::info!(success = ok, "Connectivity check completed");
    Ok(current.clone())
}

#[command]
pub async fn refresh_threat_intel(state: State<'_, BackendState>) -> Result<ThreatIntelStatus, String> {
    let _refresh = state.intel_refresh.try_lock().map_err(|_| "A threat-feed refresh is already running")?;
    match crate::services::threat_intel::fetch_feeds_detailed().await {
        Ok(result) => {
            let mut map = state.threats.iocs.lock().map_err(|_| "Threat state unavailable")?;
            map.clear();
            for entry in result.entries { map.insert(entry.ip.clone(), entry); }
            drop(map);
            *state.threats.loaded_sources.lock().map_err(|_| "Threat state unavailable")? = result.sources;
            *state.threats.last_fetched.lock().map_err(|_| "Threat state unavailable")? = Some(crate::services::logging::india_timestamp(chrono::Utc::now()));
            *state.threats.fetch_error.lock().map_err(|_| "Threat state unavailable")? = if result.errors.is_empty() { None } else { Some(result.errors.join("; ")) };
            let status = state.threats.status();
            tracing::info!(state = status.feed_state, indicators = status.ioc_count, "Threat-feed refresh completed");
            Ok(status)
        }
        Err(error) => {
            *state.threats.fetch_error.lock().map_err(|_| "Threat state unavailable")? = Some(error.clone());
            tracing::warn!("Threat-feed refresh failed");
            Err(error)
        }
    }
}

#[command]
pub fn get_attack_graph(state: State<'_, BackendState>) -> Result<AttackGraph, String> {
    Ok(state.graph.lock().map_err(|_| "Graph engine unavailable")?.get_graph())
}
#[command]
pub fn get_storylines(state: State<'_, BackendState>) -> Result<Vec<AttackStoryline>, String> {
    Ok(state.storylines.lock().map_err(|_| "Storyline engine unavailable")?.get_storylines())
}
#[command]
pub fn get_ja4_observations(state: State<'_, BackendState>, limit: Option<usize>) -> Result<Vec<Ja4Observation>, String> {
    Ok(state.ja4.lock().map_err(|_| "JA4 engine unavailable")?.get_observations(limit.unwrap_or(100).clamp(1, 500)))
}
#[command]
pub fn get_ja4_stats(state: State<'_, BackendState>) -> Result<Ja4Stats, String> {
    Ok(state.ja4.lock().map_err(|_| "JA4 engine unavailable")?.get_stats())
}
#[command]
pub fn list_rules(state: State<'_, BackendState>) -> Result<Vec<DetectionRule>, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.list_rules())
}
#[command]
pub fn enable_disable_rule(state: State<'_, BackendState>, rule_id: String, enabled: bool) -> Result<bool, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.toggle_rule(&rule_id, enabled))
}
#[command]
pub fn acknowledge_detection(state: State<'_, BackendState>, finding_id: String) -> Result<bool, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.update_finding_status(&finding_id, "ACKNOWLEDGED"))
}
#[command]
pub fn resolve_detection(state: State<'_, BackendState>, finding_id: String) -> Result<bool, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.update_finding_status(&finding_id, "RESOLVED"))
}
#[command]
pub fn get_network_interfaces() -> Vec<NetworkAdapterInfo> { crate::platform::get_network_adapters() }
#[command]
pub fn get_detailed_network_interfaces() -> Vec<DetailedAdapterInfo> { crate::platform::get_detailed_network_adapters() }
#[command]
pub fn get_dns_records(limit: Option<usize>) -> Vec<DnsQueryEntry> { crate::database::sqlite::load_dns_records(limit.unwrap_or(100).clamp(1, 500)) }
#[command]
pub fn execute_forensic_query(sql_query: String, max_rows: Option<usize>) -> Result<ForensicQueryResult, String> {
    crate::database::execute_forensic_query(&sql_query, Some(max_rows.unwrap_or(100).clamp(1, 500)))
}
#[command]
pub fn validate_forensic_query(sql_query: String) -> QueryValidationResult { crate::services::validate_sql_query(&sql_query) }
#[command]
pub fn get_forensic_schema() -> Vec<ForensicTableSchema> { crate::services::get_schema_metadata() }
#[command]
pub fn get_forensic_templates() -> Vec<ForensicTemplate> { crate::services::get_prebuilt_templates() }

#[command]
pub fn get_saved_queries() -> Result<Vec<SavedForensicQuery>, String> {
    crate::database::forensic_db::get_saved_queries()
}

#[command]
pub fn save_forensic_query(name: String, description: String, sql: String) -> Result<bool, String> {
    let validation = crate::services::validate_sql_query(&sql);
    if !validation.is_valid || !validation.is_read_only {
        return Err(validation.error_message.unwrap_or_else(|| "Only validated read-only queries may be saved".into()));
    }
    crate::database::forensic_db::save_forensic_query(&name, &description, &sql)
}

#[command]
pub fn get_detection_by_id(finding_id: String, state: State<'_, BackendState>) -> Result<Option<DetectionFinding>, String> {
    Ok(state.detections.lock().map_err(|_| "Detection engine unavailable")?.get_findings(500).into_iter().find(|f| f.finding_id == finding_id))
}

#[command]
pub fn get_field_explanation(field_id: String, current_value: String) -> EduExplanation {
    crate::services::edu_inspector::get_field_explanation(&field_id, &current_value)
}

#[command]
pub fn get_entity_explanation(entity_type: String, entity_id: String) -> EduExplanation {
    crate::services::edu_inspector::get_field_explanation(&entity_type, &entity_id)
}

#[command]
pub fn get_detection_explanation(finding_id: String, state: State<'_, BackendState>) -> Result<Option<EduExplanation>, String> {
    let finding = get_detection_by_id(finding_id, state)?;
    Ok(finding.map(|f| crate::services::edu_inspector::get_field_explanation("detection", &f.description)))
}

#[command]
pub fn get_ja4_explanation(fingerprint: String) -> EduExplanation {
    crate::services::edu_inspector::get_field_explanation("ja4", &fingerprint)
}

#[command]
pub fn lookup_ja4(fingerprint: String, state: State<'_, BackendState>) -> Result<Option<Ja4Observation>, String> {
    Ok(state.ja4.lock().map_err(|_| "JA4 engine unavailable")?.get_observations(500).into_iter().find(|o| o.fingerprint == fingerprint))
}

#[command]
pub fn get_storyline_by_id(storyline_id: String, state: State<'_, BackendState>) -> Result<Option<AttackStoryline>, String> {
    Ok(state.storylines.lock().map_err(|_| "Storyline engine unavailable")?.get_storylines().into_iter().find(|s| s.storyline_id == storyline_id))
}

#[command]
pub fn refresh_devices(state: State<'_, BackendState>) -> Result<Vec<DeviceEntry>, String> {
    let adapters = crate::platform::get_detailed_network_adapters();
    let self_ips = adapters.iter().flat_map(|a| a.ipv4_addresses.iter().chain(a.ipv6_addresses.iter())).cloned().collect::<Vec<_>>();
    let interface = adapters.first().map(|a| a.name.clone());
    state.devices.rescan(&self_ips, interface);
    Ok(state.devices.persisted(500))
}

#[command]
pub fn get_port_scan_results(limit: Option<usize>, state: State<'_, BackendState>) -> Vec<PortScanEntry> {
    state.port_scanner.persisted(limit.unwrap_or(100).clamp(1, 500))
}

#[command]
pub async fn scan_host_ports(ip: String, extra_ports: Option<Vec<u16>>, state: State<'_, BackendState>) -> Result<Vec<PortScanEntry>, String> {
    let parsed = ip.parse::<std::net::IpAddr>().map_err(|_| "Invalid IP address")?;
    if !state.port_scanner.is_private(&parsed.to_string()) {
        return Err("Port scans are restricted to private, loopback, and link-local addresses".into());
    }
    if extra_ports.as_ref().is_some_and(|ports| ports.len() > 64) {
        return Err("At most 64 additional ports may be requested".into());
    }
    let scanner = state.port_scanner.clone();
    tokio::task::spawn_blocking(move || scanner.scan(&parsed.to_string(), &extra_ports.unwrap_or_default()))
        .await.map_err(|e| format!("Port scan worker failed: {}", e))
}

#[command]
pub fn flush_flows_to_duckdb(state: State<'_, BackendState>) -> Result<usize, String> {
    let records = state.flows.lock().map_err(|_| "Flow engine unavailable")?.flush_flows();
    if records.is_empty() { return Ok(0); }
    match crate::database::duckdb::persist_flow_records(&records) {
        Ok(count) => Ok(count),
        Err(error) => {
            state.flows.lock().map_err(|_| "Flow engine unavailable")?.reinsert_retry(records);
            Err(error)
        }
    }
}

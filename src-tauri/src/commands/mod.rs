use tauri::command;
use tauri::{AppHandle, State};
use crate::state::BackendState;
pub mod auth;
pub mod global_intel;
pub mod backend;
pub mod readiness;
pub mod capture_buddy;
pub mod capture_investigation;
pub mod runtime_logs;
pub mod scan_buddy;
pub mod scan_inspection;
pub mod lab_runtime;

#[command]
pub fn get_capability_status() -> crate::models::CapabilityStatus {
    crate::platform::get_capabilities()
}

#[command]
pub fn get_system_info() -> crate::models::SystemInfo {
    crate::platform::get_system_information()
}

#[command]
pub fn get_detailed_system_info() -> crate::models::DetailedSystemInfo {
    crate::platform::get_detailed_system_information()
}

#[command]
pub fn get_windows_events(limit: Option<usize>) -> Vec<crate::models::WindowsEventEntry> {
    crate::platform::get_windows_event_logs(limit.unwrap_or(20).clamp(1, 200))
}

#[command]
pub fn get_app_config() -> crate::models::AppConfig {
    let mut values = std::collections::HashMap::new();
    if let Ok(conn) = crate::database::sqlite::open_conn() {
        if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM app_config") {
            if let Ok(rows) = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
                for row in rows.flatten() { values.insert(row.0, row.1); }
            }
        }
    }
    crate::models::AppConfig {
        selected_interface: values.remove("selected_interface").unwrap_or_default(),
        capture_status: values.remove("capture_status").unwrap_or_else(|| "STOPPED".into()),
        app_mode: values.remove("app_mode").unwrap_or_else(|| "LIVE".into()),
        theme: values.remove("theme").unwrap_or_else(|| "dark_glass".into()),
        sqlite_path: crate::database::sqlite::get_app_dir().join("netoze_app.db").display().to_string(),
        duckdb_path: crate::database::sqlite::get_app_dir().join("netoze_flows.duckdb").display().to_string(),
    }
}

#[command]
pub fn get_host_identity() -> crate::models::HostIdentity { crate::services::get_host_identity_info() }

#[command]
pub fn get_system_snapshot() -> crate::models::SystemSnapshot { crate::services::collect_system_snapshot() }

#[command]
pub fn get_tcp_sockets() -> Vec<crate::models::TcpSocketEntry> { crate::services::collect_system_snapshot().tcp_sockets }

#[command]
pub fn get_active_tcp_connections() -> Vec<crate::models::TcpConnectionEntry> { crate::platform::get_active_tcp_connections() }

#[command]
pub fn get_process_inventory() -> Vec<crate::models::ProcessEntry> { crate::services::collect_system_snapshot().processes }

#[command]
pub fn get_socket_correlations(state: State<'_, BackendState>) -> Result<Vec<crate::models::SocketProcessCorrelation>, String> {
    let snapshot = crate::services::collect_system_snapshot();
    let flows = state.flows.lock().map_err(|_| "Flow engine unavailable")?.get_recent_flows(500);
    Ok(flows.iter().map(|flow| crate::services::correlate_flow_with_sockets(flow, &snapshot.tcp_sockets)).collect())
}

use serde::{Deserialize, Serialize};

use crate::models::CaptureMetrics;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    id: i64,
    timestamp: i64,
    actor: String,
    action: String,
    resource: String,
    prev_hash: String,
    curr_hash: String,
}

#[command]
pub fn audit_log(limit: Option<usize>) -> Result<Vec<AuditLogEntry>, String> {
    let limit = limit.unwrap_or(10).min(500);
    let conn = crate::database::sqlite::open_conn()
        .map_err(|e| format!("Failed to open database: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, actor, action, resource, prev_hash, curr_hash
             FROM audit_log ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit as i64], |r| {
            Ok(AuditLogEntry {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                actor: r.get(2)?,
                action: r.get(3)?,
                resource: r.get(4)?,
                prev_hash: r.get(5)?,
                curr_hash: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        if let Ok(entry) = row {
            out.push(entry);
        }
    }
    Ok(out)
}

#[command]
pub fn ping_host(target: String, count: Option<usize>) -> Result<String, String> {
    if !cfg!(any(windows, target_os = "linux")) {
        return Err("Native ping is supported on Windows and Linux".to_string());
    }
    let count = count.unwrap_or(4).clamp(1, 20);
    let target = target.trim();
    if target.is_empty() || target.starts_with('-') || target.chars().any(char::is_whitespace) {
        return Err("Provide a hostname or IP address".to_string());
    }
    // Use system ping command
    let output = std::process::Command::new("ping")
        .arg(if cfg!(windows) { "-n" } else { "-c" })
        .arg(count.to_string())
        .arg(if cfg!(windows) { "-w" } else { "-W" })
        .arg(if cfg!(windows) { "1000" } else { "1" })
        .arg(&target)
        .output()
        .map_err(|e| format!("Failed to execute ping: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout, stderr);

    if output.status.success() {
        Ok(combined)
    } else {
        Err(format!("Ping failed for {}: {}", target, combined))
    }
}

#[command]
pub async fn check_port(host: String, port: u16, timeout: Option<u64>) -> Result<String, String> {
    let host = host.trim();
    if host.is_empty() || host.len() > 253 || host.chars().any(char::is_whitespace) || port == 0 {
        return Err("Provide a hostname/IP and a nonzero port".into());
    }
    let duration = std::time::Duration::from_millis(timeout.unwrap_or(2000).clamp(100, 10_000));
    match tokio::time::timeout(duration, tokio::net::TcpStream::connect((host, port))).await {
        Ok(Ok(_)) => Ok(format!("OPEN {}:{}", host, port)),
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::ConnectionRefused => Ok(format!("CLOSED {}:{}", host, port)),
        Ok(Err(error)) => Err(format!("Port check failed: {}", error)),
        Err(_) => Err("Port check timed out; port state is unknown".into()),
    }
}

#[command]
pub async fn whois_rdap(target: String) -> Result<String, String> {
    let ip = target.trim().parse::<std::net::IpAddr>().map_err(|_| "RDAP lookup currently supports IP addresses")?.to_string();
    if crate::services::geoip_service::is_private_ip(&ip) { return Err("RDAP requires a public IP address".into()); }
    let client = crate::services::http_client::client()?;
    let text = crate::services::http_client::read_text(&client, &format!("https://rdap.org/ip/{}", ip), 1024 * 1024).await?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| "RDAP provider returned malformed JSON")?;
    if json["objectClassName"].as_str() != Some("ip network") { return Err("RDAP response is not an IP network registration".into()); }
    serde_json::to_string_pretty(&json).map_err(|e| e.to_string())
}

#[command]
pub fn traceroute(target: String, max_hops: Option<usize>) -> Result<String, String> {
    let _ = (target, max_hops);
    Err("Traceroute is unavailable in this build".to_string())
}

// === Packet Capture Commands ===

#[command]
pub fn inspect_npcap_availability() -> Result<(String, String), String> {
    // Keep the existing IPC name for compatibility; the implementation is native
    // Npcap on Windows and libpcap on Linux.
    let capability = crate::platform::capture::inspect_packet_capture();
    Ok((if capability.available { "AVAILABLE" } else { "UNAVAILABLE" }.into(), capability.reason))
}

#[command]
pub fn get_pcap_interfaces() -> Result<Vec<crate::models::NpcapInterface>, String> {
    if !cfg!(any(windows, target_os = "linux")) {
        return Err("Native capture is supported on Windows and Linux".to_string());
    }
    use pcap::Device;
    match Device::list() {
        Ok(devs) => {
            Ok(devs.into_iter().map(|d| {
                let description = d.desc.clone().unwrap_or_else(|| d.name.clone());
                let is_loopback = d.name.to_lowercase().contains("loopback")
                    || description.to_lowercase().contains("loopback");
                crate::models::NpcapInterface {
                    id: d.name.clone(),
                    name: description.clone(),
                    description,
                    ipv4_addresses: Vec::new(),
                    ipv6_addresses: Vec::new(),
                    mac_address: String::new(),
                    is_loopback,
                }
            }).collect())
        }
        Err(error) => Err(format!("Cannot enumerate capture interfaces: {}", error)),
    }
}

#[command]
pub fn start_packet_capture(interface_id: String, app_handle: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    if interface_id.trim().is_empty() { return Err("Select a capture interface".to_string()); }
    state.capture.lock().map_err(|_| "Capture state unavailable".to_string())?
        .start_capture(interface_id, app_handle)
}

#[command]
pub fn stop_packet_capture(app_handle: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    state.capture.lock().map_err(|_| "Capture state unavailable".to_string())?.stop_capture(app_handle);
    Ok(())
}

#[command]
pub fn get_capture_metrics(state: State<'_, BackendState>) -> Result<CaptureMetrics, String> {
    Ok(state.capture.lock().map_err(|_| "Capture state unavailable".to_string())?.get_metrics())
}

#[command]
pub fn get_capture_engine_state(state: State<'_, BackendState>) -> Result<crate::models::CaptureEngineDiagnostics, String> {
    let engine = state.capture.lock().map_err(|_| "Capture state unavailable".to_string())?;
    let (status, iface, packets, bytes, duration, handle_open) = engine.get_engine_state();
    Ok(crate::models::CaptureEngineDiagnostics {
        status: format!("{:?}", status), selected_interface: iface.unwrap_or_default(),
        packets_captured: packets, bytes_captured: bytes, duration_secs: duration,
        capture_handle_open: handle_open,
    })
}

#[command]
pub fn get_audit_log(limit: Option<usize>) -> Result<Vec<AuditLogEntry>, String> { audit_log(limit) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_config_reports_distinct_storage_paths() {
        let config = get_app_config();
        assert_ne!(config.sqlite_path, config.duckdb_path);
        assert!(config.sqlite_path.ends_with("netoze_app.db"));
        assert!(config.duckdb_path.ends_with("netoze_flows.duckdb"));
    }

    #[tokio::test]
    async fn port_check_reports_real_loopback_listener_and_rejects_invalid_input() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(check_port("127.0.0.1".into(), port, Some(1000)).await.unwrap().starts_with("OPEN"));
        drop(listener);
        assert!(check_port("127.0.0.1".into(), port, Some(1000)).await.unwrap().starts_with("CLOSED"));
        assert!(check_port(String::new(), port, None).await.is_err());
        assert!(whois_rdap("192.168.1.1".into()).await.is_err());
    }
}

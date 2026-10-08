use crate::models::{
    FlowRecord, HostIdentity, NetworkInterfaceEntry, ProcessEntry, SocketProcessCorrelation,
    SystemSnapshot, TcpSocketEntry, WindowsServiceEntry,
};
use crate::platform::{get_active_tcp_connections, get_detailed_network_adapters};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::System;

pub fn get_host_identity_info() -> HostIdentity {
    let hostname = System::host_name().unwrap_or_else(|| "UNKNOWN".to_string());

    HostIdentity {
        hostname,
        os_family: std::env::consts::OS.to_string(),
        os_version: host_os_version(),
        architecture: std::env::consts::ARCH.to_string(),
        app_version: "2.0.0".to_string(),
    }
}

fn host_os_version() -> String {
    sysinfo::System::os_version().unwrap_or_else(|| "UNKNOWN".to_string())
}

pub fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn collect_system_snapshot() -> SystemSnapshot {
    let now_ms = current_timestamp_ms();

    // 1. Host Identity
    let identity = get_host_identity_info();

    // 2. Active TCP Sockets
    let platform_conns = get_active_tcp_connections();
    let mut sockets = Vec::with_capacity(platform_conns.len());

    for c in platform_conns {
        sockets.push(TcpSocketEntry {
            local_ip: c.local_ip.clone(),
            local_port: c.local_port,
            remote_ip: c.remote_ip.clone(),
            remote_port: c.remote_port,
            state: normalize_tcp_state(&c.tcp_state),
            pid: c.pid,
            process_name: c.process_name.clone(),
            executable_path: socket_executable_path(c.pid),
            address_family: if c.local_ip.contains(':') { "IPv6".to_string() } else { "IPv4".to_string() },
            timestamp: now_ms,
        });
    }

    // 3. Network Interfaces
    let platform_adapters = get_detailed_network_adapters();
    let mut interfaces = Vec::with_capacity(platform_adapters.len());

    for (idx, ad) in platform_adapters.into_iter().enumerate() {
        let link_speed = interface_link_speed(&ad.name);
        interfaces.push(NetworkInterfaceEntry {
            interface_id: format!("if_{}", idx + 1),
            name: ad.name,
            mac_address: ad.mac_address,
            ipv4_addresses: ad.ipv4_addresses,
            ipv6_addresses: ad.ipv6_addresses,
            operational_state: ad.oper_status.to_uppercase(),
            link_speed_mbps: link_speed,
        });
    }

    // 4. Process Inventory
    let mut sys = System::new();
    sys.refresh_processes();
    let mut processes = Vec::new();

    for (pid, proc_) in sys.processes() {
        if processes.len() >= 200 {
            break;
        }
        processes.push(ProcessEntry {
            pid: pid.as_u32(),
            process_name: proc_.name().to_string(),
            executable_path: proc_
                .exe()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "UNKNOWN".to_string()),
            cpu_usage: proc_.cpu_usage(),
            memory_bytes: proc_.memory(),
            start_time: proc_.start_time(),
        });
    }

    // 5. Windows Services are only observable on Windows. Linux has no equivalent
    // service database in this model, so do not report fabricated Windows services.
    let services = windows_services();

    SystemSnapshot {
        timestamp: now_ms,
        host_identity: identity,
        tcp_sockets: sockets,
        processes,
        interfaces,
        services,
        correlations: vec![],
    }
}

#[cfg(windows)]
fn socket_executable_path(pid: u32) -> String {
    let mut system = System::new();
    let pid = sysinfo::Pid::from_u32(pid);
    system.refresh_process(pid);
    system.process(pid).and_then(|process| process.exe())
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|| "UNKNOWN".to_string())
}

#[cfg(not(windows))]
fn socket_executable_path(pid: u32) -> String {
    if pid == 0 { return "UNKNOWN".to_string(); }
    std::fs::read_link(format!("/proc/{pid}/exe")).map(|path| path.to_string_lossy().into_owned()).unwrap_or_else(|_| "UNKNOWN".to_string())
}

#[cfg(windows)]
fn interface_link_speed(_name: &str) -> u64 { 0 } // Model sentinel: speed not observed.

#[cfg(target_os = "linux")]
fn interface_link_speed(name: &str) -> u64 { crate::platform::linux::link_speed_mbps(name) }

#[cfg(not(any(windows, target_os = "linux")))]
fn interface_link_speed(_name: &str) -> u64 { 0 }

/// Selected Windows services, not an exhaustive service inventory. Configuration
/// (start type) is not queried and remains explicitly unknown.
#[cfg(windows)]
fn windows_services() -> Vec<WindowsServiceEntry> {
    ["npcap", "EventLog", "Dhcp", "Dnscache"].into_iter().map(|name| WindowsServiceEntry {
        service_name: name.into(), display_name: name.into(),
        state: crate::platform::windows::service_state(name).unwrap_or_else(|| "UNKNOWN".into()),
        start_type: "UNKNOWN".into(),
    }).collect()
}

#[cfg(not(windows))]
fn windows_services() -> Vec<WindowsServiceEntry> { Vec::new() }

pub fn correlate_flow_with_sockets(
    flow: &FlowRecord,
    sockets: &[TcpSocketEntry],
) -> SocketProcessCorrelation {
    let now_ms = current_timestamp_ms();

    // 1. Exact 5-tuple match search
    if let Some(sock) = sockets.iter().find(|s| {
        (s.local_ip == flow.src_ip && s.local_port == flow.src_port && s.remote_ip == flow.dst_ip && s.remote_port == flow.dst_port)
            || (s.local_ip == flow.dst_ip && s.local_port == flow.dst_port && s.remote_ip == flow.src_ip && s.remote_port == flow.src_port)
    }) {
        let conf = if sock.pid > 0 && sock.process_name != "UNKNOWN" {
            "HIGH".to_string()
        } else {
            "MEDIUM".to_string()
        };

        return SocketProcessCorrelation {
            correlation_id: format!("corr_{}_{}", flow.flow_id, sock.pid),
            flow_id: flow.flow_id.clone(),
            local_endpoint: format!("{}:{}", sock.local_ip, sock.local_port),
            remote_endpoint: format!("{}:{}", sock.remote_ip, sock.remote_port),
            pid: sock.pid,
            process_name: sock.process_name.clone(),
            confidence: conf,
            timestamp: now_ms,
        };
    }

    // 2. Partial endpoint match search (local port & IP match)
    if let Some(sock) = sockets.iter().find(|s| s.local_port == flow.src_port || s.local_port == flow.dst_port) {
        return SocketProcessCorrelation {
            correlation_id: format!("corr_part_{}", flow.flow_id),
            flow_id: flow.flow_id.clone(),
            local_endpoint: format!("{}:{}", sock.local_ip, sock.local_port),
            remote_endpoint: format!("{}:{}", sock.remote_ip, sock.remote_port),
            pid: sock.pid,
            process_name: sock.process_name.clone(),
            confidence: "LOW".to_string(),
            timestamp: now_ms,
        };
    }

    // 3. Fallback: No correlation found
    SocketProcessCorrelation {
        correlation_id: format!("corr_none_{}", flow.flow_id),
        flow_id: flow.flow_id.clone(),
        local_endpoint: format!("{}:{}", flow.src_ip, flow.src_port),
        remote_endpoint: format!("{}:{}", flow.dst_ip, flow.dst_port),
        pid: 0,
        process_name: "UNKNOWN".to_string(),
        confidence: "UNKNOWN".to_string(),
        timestamp: now_ms,
    }
}

pub fn normalize_tcp_state(raw: &str) -> String {
    let upper = raw.to_uppercase();
    if upper.contains("ESTAB") {
        "ESTABLISHED".to_string()
    } else if upper.contains("LISTEN") {
        "LISTEN".to_string()
    } else if upper.contains("SYN_SENT") {
        "SYN_SENT".to_string()
    } else if upper.contains("SYN_RECV") {
        "SYN_RECEIVED".to_string()
    } else if upper.contains("FIN_WAIT1") || upper.contains("FIN_WAIT_1") {
        "FIN_WAIT_1".to_string()
    } else if upper.contains("FIN_WAIT2") || upper.contains("FIN_WAIT_2") {
        "FIN_WAIT_2".to_string()
    } else if upper.contains("CLOSE_WAIT") {
        "CLOSE_WAIT".to_string()
    } else if upper.contains("CLOSING") {
        "CLOSING".to_string()
    } else if upper.contains("LAST_ACK") {
        "LAST_ACK".to_string()
    } else if upper.contains("TIME_WAIT") {
        "TIME_WAIT".to_string()
    } else {
        "CLOSED".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_tcp_state() {
        assert_eq!(normalize_tcp_state("ESTABLISHED"), "ESTABLISHED");
        assert_eq!(normalize_tcp_state("LISTENING"), "LISTEN");
        assert_eq!(normalize_tcp_state("TIME_WAIT"), "TIME_WAIT");
        assert_eq!(normalize_tcp_state("unknown_state"), "CLOSED");
    }

    #[test]
    fn test_correlation_confidence() {
        let flow = FlowRecord {
            flow_id: "flw_001".to_string(),
            src_ip: "192.168.1.100".to_string(),
            dst_ip: "10.0.0.1".to_string(),
            src_port: 50000,
            dst_port: 443,
            protocol: "TCP".to_string(),
            ip_version: 4,
            client_bytes: 100,
            server_bytes: 200,
            total_bytes: 300,
            packet_count: 5,
            tcp_state: "ESTABLISHED".to_string(),
            ja4: "".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: 1000,
            ts_end: 2000,
            duration_ms: 1000,
            rtt_ms: 0,
            dns_qname: None,
        };

        let sockets = vec![TcpSocketEntry {
            local_ip: "192.168.1.100".to_string(),
            local_port: 50000,
            remote_ip: "10.0.0.1".to_string(),
            remote_port: 443,
            state: "ESTABLISHED".to_string(),
            pid: 4216,
            process_name: "chrome.exe".to_string(),
            executable_path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string(),
            address_family: "IPv4".to_string(),
            timestamp: 1500,
        }];

        let corr = correlate_flow_with_sockets(&flow, &sockets);
        assert_eq!(corr.confidence, "HIGH");
        assert_eq!(corr.process_name, "chrome.exe");
        assert_eq!(corr.pid, 4216);
    }
}

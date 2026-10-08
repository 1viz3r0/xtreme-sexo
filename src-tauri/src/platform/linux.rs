//! Linux-only host observations. Missing permissions or kernel fields remain unknown.
use crate::models::{CapabilityStatus, DetailedAdapterInfo, DetailedSystemInfo, NetworkAdapterInfo, NpcapStatus, SystemInfo};
use sysinfo::Networks;

pub fn get_detailed_network_adapters() -> Vec<DetailedAdapterInfo> {
    let networks = Networks::new_with_refreshed_list();
    // Enumeration only: this does not open a capture handle or send traffic.
    let devices = pcap::Device::list().unwrap_or_else(|error| {
        tracing::warn!(%error, "Linux interface address enumeration unavailable");
        Vec::new()
    });
    networks.iter().map(|(name, network)| {
        let oper_status = std::fs::read_to_string(format!("/sys/class/net/{name}/operstate"))
            .map(|s| match s.trim() { "up" => "Up", "down" => "Down", _ => "Unknown" }.to_string())
            .unwrap_or_else(|_| "Unknown".to_string());
        let addresses: Vec<_> = devices.iter().filter(|d| d.name == *name)
            .flat_map(|d| d.addresses.iter().map(|a| a.addr)).collect();
        DetailedAdapterInfo {
            name: name.clone(),
            friendly_name: name.clone(),
            description: format!("Linux network interface ({name})"),
            mac_address: network.mac_address().to_string(),
            ipv4_addresses: addresses.iter().filter(|a| a.is_ipv4()).map(ToString::to_string).collect(),
            ipv6_addresses: addresses.iter().filter(|a| a.is_ipv6()).map(ToString::to_string).collect(),
            oper_status,
            interface_type: if name == "lo" { "Loopback" } else { "Unknown" }.to_string(),
            rx_bytes: network.total_received(),
            tx_bytes: network.total_transmitted(),
            rx_packets: network.total_packets_received(),
            tx_packets: network.total_packets_transmitted(),
        }
    }).collect()
}

pub fn link_speed_mbps(name: &str) -> u64 {
    std::fs::read_to_string(format!("/sys/class/net/{name}/speed"))
        .ok().and_then(|s| s.trim().parse::<i64>().ok()).filter(|speed| *speed >= 0)
        .map(|speed| speed as u64).unwrap_or(0)
}

pub fn get_network_adapters() -> Vec<NetworkAdapterInfo> {
    get_detailed_network_adapters().into_iter().map(|adapter| NetworkAdapterInfo {
        name: adapter.name.clone(),
        description: adapter.description,
        ip_addresses: adapter.ipv4_addresses.into_iter().chain(adapter.ipv6_addresses).collect(),
        mac_address: adapter.mac_address,
        is_up: adapter.oper_status == "Up",
        is_loopback: adapter.name == "lo",
    }).collect()
}

pub fn get_system_information() -> SystemInfo {
    let hostname = hostname();
    let os_version = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|text| text.lines().find_map(|line| line.strip_prefix("PRETTY_NAME=").map(|v| v.trim_matches('"').to_string())))
        .unwrap_or_else(|| "Linux".to_string());
    SystemInfo {
        os_name: "Linux".to_string(), os_version, hostname,
        architecture: std::env::consts::ARCH.to_string(),
        user_name: std::env::var("USER").unwrap_or_else(|_| "unknown".to_string()),
        is_admin: is_root(),
    }
}

pub fn get_detailed_system_information() -> DetailedSystemInfo {
    let info = get_system_information();
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    let total = system.total_memory();
    let available = system.available_memory();
    DetailedSystemInfo {
        hostname: info.hostname, os_name: info.os_name, os_version: info.os_version,
        architecture: info.architecture, cpu_model: system.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "unknown".to_string()),
        cpu_core_count: system.cpus().len(), ram_total_bytes: total, ram_available_bytes: available,
        ram_usage_percent: if total == 0 { 0.0 } else { (total - available) as f64 / total as f64 * 100.0 },
        uptime_seconds: sysinfo::System::uptime(), user_name: info.user_name, is_admin: info.is_admin,
    }
}

pub fn get_capabilities() -> CapabilityStatus {
    let adapters = get_detailed_network_adapters();
    let capture = super::capture::inspect_packet_capture();
    CapabilityStatus {
        administrator: is_root(),
        npcap: NpcapStatus { installed: false, service_available: false, version: None },
        packet_capture: capture, raw_sockets: false, interfaces_count: adapters.len(), platform: "Linux".to_string(),
        active_tcp_available: true, windows_event_log_available: false,
    }
}

fn hostname() -> String {
    std::fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()).ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "NET0ZE-HOST".to_string())
}

fn is_root() -> bool {
    std::fs::read_to_string("/proc/self/status").ok()
        .and_then(|text| text.lines().find_map(|line| line.strip_prefix("Uid:").and_then(|v| v.split_whitespace().next()).map(str::to_string)))
        .map(|uid| uid == "0").unwrap_or(false)
}

#[cfg(test)]
mod tests {
    #[test]
    fn inaccessible_link_speed_is_unknown() {
        assert_eq!(super::link_speed_mbps("interface-that-does-not-exist"), 0);
    }
}

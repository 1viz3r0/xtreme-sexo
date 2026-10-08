use crate::models::{
    CapabilityStatus, DetailedAdapterInfo, DetailedSystemInfo, NetworkAdapterInfo, NpcapStatus,
    PacketCaptureCapability, SystemInfo,
};
use pcap::Device;
use std::path::Path;
use sysinfo::{Networks, System};

/// Checks if current process runs with elevated Administrator privileges on Windows
pub fn check_is_admin() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Security::{CheckTokenMembership, CreateWellKnownSid, WinBuiltinAdministratorsSid};
        let mut sid = [0u32; 17];
        let mut size = std::mem::size_of_val(&sid) as u32;
        let mut member = 0;
        unsafe {
            if CreateWellKnownSid(WinBuiltinAdministratorsSid, std::ptr::null_mut(), sid.as_mut_ptr().cast(), &mut size) != 0 {
                return CheckTokenMembership(0, sid.as_mut_ptr().cast(), &mut member) != 0 && member != 0;
            }
        }
    }
    false
}

/// Inspects Windows system for Npcap driver DLLs across all standard Windows installation paths
pub fn inspect_npcap() -> NpcapStatus {
    if !cfg!(windows) {
        return NpcapStatus { installed: false, service_available: false, version: None };
    }
    let paths = [
        "C:\\Windows\\System32\\Npcap\\wpcap.dll",
        "C:\\Windows\\System32\\Npcap\\Packet.dll",
        "C:\\Windows\\System32\\wpcap.dll",
        "C:\\Windows\\System32\\Packet.dll",
        "C:\\Windows\\SysWOW64\\Npcap\\wpcap.dll",
        "C:\\Windows\\SysWOW64\\Npcap\\Packet.dll",
        "C:\\Windows\\SysWOW64\\wpcap.dll",
        "C:\\Windows\\SysWOW64\\Packet.dll",
        "C:\\Program Files\\Npcap\\wpcap.dll",
        "C:\\Windows\\System32\\drivers\\npcap.sys",
    ];

    let library_paths_ok = paths.iter().any(|p| Path::new(p).exists());
    let device_list_ok = Device::list().is_ok();
    let installed = library_paths_ok && device_list_ok;

    NpcapStatus {
        installed,
        service_available: service_state("npcap").as_deref() == Some("RUNNING"),
        version: None,
    }
}

/// Query the SCM; access denied, absent service and query failures stay unknown.
pub(crate) fn service_state(name: &str) -> Option<String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Services::*;
        let manager = OpenSCManagerW(std::ptr::null(), std::ptr::null(), SC_MANAGER_CONNECT);
        if manager == 0 { return None; }
        let name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let service = OpenServiceW(manager, name.as_ptr(), SERVICE_QUERY_STATUS);
        if service == 0 { CloseServiceHandle(manager); return None; }
        let mut status: SERVICE_STATUS = std::mem::zeroed();
        let ok = QueryServiceStatus(service, &mut status);
        CloseServiceHandle(service);
        CloseServiceHandle(manager);
        if ok == 0 { return None; }
        return Some(match status.dwCurrentState {
            SERVICE_STOPPED => "STOPPED", SERVICE_START_PENDING => "START_PENDING",
            SERVICE_STOP_PENDING => "STOP_PENDING", SERVICE_RUNNING => "RUNNING",
            SERVICE_CONTINUE_PENDING => "CONTINUE_PENDING", SERVICE_PAUSE_PENDING => "PAUSE_PENDING",
            SERVICE_PAUSED => "PAUSED", _ => "UNKNOWN",
        }.to_string());
    }
    #[cfg(not(windows))]
    { let _ = name; None }
}

/// Inspects packet capture capabilities
pub fn inspect_packet_capture() -> PacketCaptureCapability {
    super::capture::inspect_packet_capture()
}

/// Gathers complete Capability Inspector status
pub fn get_capabilities() -> CapabilityStatus {
    let admin = check_is_admin();
    let npcap = inspect_npcap();
    let cap = inspect_packet_capture();
    let adapters = get_network_adapters();

    CapabilityStatus {
        administrator: admin,
        npcap,
        packet_capture: cap,
        raw_sockets: admin,
        interfaces_count: adapters.len(),
        platform: std::env::consts::OS.to_string(),
        active_tcp_available: cfg!(windows),
        windows_event_log_available: cfg!(windows),
    }
}

/// Gathers actual Host System Information
pub fn get_system_information() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| std::env::consts::OS.to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
    let architecture = std::env::consts::ARCH.to_string();
    let user_name = std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string());
    let is_admin = check_is_admin();

    SystemInfo {
        os_name,
        os_version,
        hostname,
        architecture,
        user_name,
        is_admin,
    }
}

/// Gathers native host information on Windows and Linux using sysinfo.
pub fn get_detailed_system_information() -> DetailedSystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
    let os_name = System::name().unwrap_or_else(|| std::env::consts::OS.to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let architecture = std::env::consts::ARCH.to_string();
    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let cpu_core_count = sys.cpus().len();
    let ram_total_bytes = sys.total_memory();
    let ram_available_bytes = sys.available_memory();
    let ram_used = ram_total_bytes.saturating_sub(ram_available_bytes);
    let ram_usage_percent = if ram_total_bytes > 0 {
        (ram_used as f64 / ram_total_bytes as f64) * 100.0
    } else {
        0.0
    };
    let uptime_seconds = System::uptime();
    let user_name = std::env::var(if cfg!(windows) { "USERNAME" } else { "USER" })
        .unwrap_or_else(|_| "Unknown".to_string());
    let is_admin = check_is_admin();

    DetailedSystemInfo {
        hostname,
        os_name,
        os_version,
        architecture,
        cpu_model,
        cpu_core_count,
        ram_total_bytes,
        ram_available_bytes,
        ram_usage_percent,
        uptime_seconds,
        user_name,
        is_admin,
    }
}

/// Retrieves list of actual network adapters on the host
pub fn get_network_adapters() -> Vec<NetworkAdapterInfo> {
    let mut networks = Networks::new_with_refreshed_list();
    networks.refresh();

    let mut adapters = Vec::new();

    for (interface_name, network) in &networks {
        let mac = network.mac_address().to_string();
        let is_loopback = interface_name.to_lowercase().contains("loopback") || mac == "00:00:00:00:00:00";

        adapters.push(NetworkAdapterInfo {
            name: interface_name.clone(),
            description: format!("Network Adapter ({})", interface_name),
            ip_addresses: vec![],
            mac_address: mac,
            is_up: false, // Operational state not collected by sysinfo.
            is_loopback,
        });
    }

    adapters
}

/// Retrieves Detailed Network Adapters with real throughput bytes and packet counts
pub fn get_detailed_network_adapters() -> Vec<DetailedAdapterInfo> {
    let mut networks = Networks::new_with_refreshed_list();
    networks.refresh();

    let mut adapters = Vec::new();

    for (interface_name, network) in &networks {
        let mac = network.mac_address().to_string();
        let rx_bytes = network.total_received();
        let tx_bytes = network.total_transmitted();
        let rx_packets = network.total_packets_received();
        let tx_packets = network.total_packets_transmitted();

        let friendly_name = if interface_name.to_lowercase().contains("wi-fi") || interface_name.to_lowercase().contains("wlan") {
            "Wi-Fi Network Adapter".to_string()
        } else if interface_name.to_lowercase().contains("eth") || interface_name.to_lowercase().contains("ethernet") {
            "Ethernet Network Adapter".to_string()
        } else {
            interface_name.clone()
        };

        let interface_type = if interface_name.to_lowercase().contains("loopback") {
            "Loopback".to_string()
        } else if interface_name.to_lowercase().contains("wi-fi") {
            "Wireless".to_string()
        } else {
            "Unknown".to_string()
        };

        adapters.push(DetailedAdapterInfo {
            name: interface_name.clone(),
            friendly_name,
            description: format!("Network Adapter ({})", interface_name),
            mac_address: mac,
            ipv4_addresses: vec![],
            ipv6_addresses: vec![],
            oper_status: "Unknown".to_string(),
            interface_type,
            rx_bytes,
            tx_bytes,
            rx_packets,
            tx_packets,
        });
    }

    adapters
}

use crate::models::TcpConnectionEntry;

#[cfg(windows)]
use std::collections::HashMap;
#[cfg(windows)]
use sysinfo::System;

#[cfg(windows)]
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPTABLE_OWNER_PID, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
};

/// Maps Windows TCP State integer, and the equivalent Linux state names, to a stable value.
pub fn map_tcp_state(state: u32) -> String {
    match state {
        1 => "CLOSED".to_string(),
        2 => "LISTEN".to_string(),
        3 => "SYN_SENT".to_string(),
        4 => "SYN_RECEIVED".to_string(),
        5 => "ESTABLISHED".to_string(),
        6 => "FIN_WAIT1".to_string(),
        7 => "FIN_WAIT2".to_string(),
        8 => "CLOSE_WAIT".to_string(),
        9 => "CLOSING".to_string(),
        10 => "LAST_ACK".to_string(),
        11 => "TIME_WAIT".to_string(),
        12 => "DELETE_TCB".to_string(),
        _ => format!("UNKNOWN ({})", state),
    }
}

#[cfg(windows)]
fn dword_to_ip(dw: u32) -> String {
    let bytes = dw.to_ne_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

#[cfg(windows)]
fn dword_to_port(dw: u32) -> u16 { u16::from_be(dw as u16) }

/// Fetch active TCP connections from the host's native table.
#[cfg(windows)]
pub fn get_active_tcp_connections() -> Vec<TcpConnectionEntry> {
    let mut entries = Vec::new();
    let mut sys = System::new_all();
    sys.refresh_all();
    let process_map: HashMap<u32, String> = sys.processes().iter()
        .map(|(pid, process)| (pid.as_u32(), process.name().to_string())).collect();

    unsafe {
        let mut size = 0u32;
        GetExtendedTcpTable(std::ptr::null_mut(), &mut size, 0, 2, TCP_TABLE_OWNER_PID_ALL, 0);
        if size == 0 { return entries; }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedTcpTable(buf.as_mut_ptr() as *mut _, &mut size, 0, 2, TCP_TABLE_OWNER_PID_ALL, 0) != 0 { return entries; }
        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let rows = std::slice::from_raw_parts(
            std::ptr::addr_of!(table.table) as *const MIB_TCPROW_OWNER_PID,
            table.dwNumEntries as usize,
        );
        for row in rows {
            let pid = row.dwOwningPid;
            entries.push(TcpConnectionEntry {
                local_ip: dword_to_ip(row.dwLocalAddr), local_port: dword_to_port(row.dwLocalPort),
                remote_ip: dword_to_ip(row.dwRemoteAddr), remote_port: dword_to_port(row.dwRemotePort),
                tcp_state: map_tcp_state(row.dwState), pid,
                process_name: process_map.get(&pid).cloned().unwrap_or_else(|| "UNKNOWN".into()),
            });
        }
    }
    entries
}

#[cfg(target_os = "linux")]
mod linux_proc {
    use super::TcpConnectionEntry;
    use std::{collections::HashMap, fs, net::{Ipv4Addr, Ipv6Addr}, path::Path};

    const STATES: [&str; 13] = ["UNKNOWN", "CLOSED", "LISTEN", "SYN_SENT", "SYN_RECEIVED", "ESTABLISHED", "FIN_WAIT1", "FIN_WAIT2", "CLOSE_WAIT", "CLOSING", "LAST_ACK", "TIME_WAIT", "DELETE_TCB"];

    fn endpoint(value: &str, v6: bool) -> Option<(String, u16)> {
        let (address, port) = value.split_once(':')?;
        let port = u16::from_str_radix(port, 16).ok()?;
        if v6 {
            let bytes = (0..4).map(|i| u32::from_str_radix(&address[i * 8..i * 8 + 8], 16).ok()).collect::<Option<Vec<_>>>()?;
            // /proc/net/tcp6 stores each 32-bit word in host byte order.
            let mut octets = [0u8; 16];
            for (i, word) in bytes.iter().enumerate() { octets[i * 4..i * 4 + 4].copy_from_slice(&word.to_le_bytes()); }
            Some((Ipv6Addr::from(octets).to_string(), port))
        } else {
            let value = u32::from_str_radix(address, 16).ok()?.to_le_bytes();
            Some((Ipv4Addr::from(value).to_string(), port))
        }
    }

    fn socket_processes() -> HashMap<u64, (u32, String)> {
        let mut result = HashMap::new();
        let Ok(entries) = fs::read_dir("/proc") else { return result; };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(pid) = name.to_str().and_then(|s| s.parse::<u32>().ok()) else { continue; };
            let process_name = fs::read_to_string(entry.path().join("comm")).ok()
                .map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "UNKNOWN".into());
            let Ok(fds) = fs::read_dir(entry.path().join("fd")) else { continue; };
            for fd in fds.flatten() {
                let Ok(target) = fs::read_link(fd.path()) else { continue; };
                let target = target.to_string_lossy();
                let Some(inode) = target.strip_prefix("socket:[").and_then(|s| s.strip_suffix(']')).and_then(|s| s.parse().ok()) else { continue; };
                result.entry(inode).or_insert((pid, process_name.clone()));
            }
        }
        result
    }

    pub fn parse_table(content: &str, v6: bool, processes: &HashMap<u64, (u32, String)>) -> Vec<TcpConnectionEntry> {
        content.lines().skip(1).filter_map(|line| {
            let fields: Vec<_> = line.split_whitespace().collect();
            if fields.len() < 10 { return None; }
            let (local_ip, local_port) = endpoint(fields[1], v6)?;
            let (remote_ip, remote_port) = endpoint(fields[2], v6)?;
            let state = u8::from_str_radix(fields[3], 16).ok().map(|s| linux_state(s).to_string()).unwrap_or_else(|| "UNKNOWN".into());
            let inode = fields[9].parse::<u64>().ok()?;
            let (pid, process_name) = processes.get(&inode).cloned().unwrap_or((0, "UNKNOWN".into()));
            Some(TcpConnectionEntry { local_ip, local_port, remote_ip, remote_port, tcp_state: state, pid, process_name })
        }).collect()
    }

    fn linux_state(state: u8) -> &'static str {
        match state {
            1 => "ESTABLISHED", 2 => "SYN_SENT", 3 => "SYN_RECV", 4 => "FIN_WAIT1",
            5 => "FIN_WAIT2", 6 => "TIME_WAIT", 7 => "CLOSE", 8 => "CLOSE_WAIT",
            9 => "LAST_ACK", 10 => "LISTEN", 11 => "CLOSING", _ => "UNKNOWN",
        }
    }

    pub fn collect() -> Vec<TcpConnectionEntry> {
        let processes = socket_processes();
        [ ("/proc/net/tcp", false), ("/proc/net/tcp6", true) ].into_iter()
            .filter_map(|(path, v6)| fs::read_to_string(path).ok().map(|s| parse_table(&s, v6, &processes)))
            .flatten().collect()
    }

    #[allow(dead_code)]
    fn _path_is_proc(path: &Path) -> bool { path.starts_with("/proc") }
}

#[cfg(target_os = "linux")]
pub fn get_active_tcp_connections() -> Vec<TcpConnectionEntry> { linux_proc::collect() }

#[cfg(not(any(windows, target_os = "linux")))]
pub fn get_active_tcp_connections() -> Vec<TcpConnectionEntry> { Vec::new() }

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::linux_proc;
    use std::collections::HashMap;
    #[test]
    fn parses_proc_tcp_fixture_without_fabricating_processes() {
        let fixture = "sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n 0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 12345\n";
        let entries = linux_proc::parse_table(fixture, false, &HashMap::new());
        assert_eq!(entries[0].local_ip, "127.0.0.1");
        assert_eq!(entries[0].local_port, 8080);
        assert_eq!(entries[0].tcp_state, "LISTEN");
        assert_eq!(entries[0].process_name, "UNKNOWN");
    }
}

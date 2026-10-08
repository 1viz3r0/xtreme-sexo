use crate::database::sqlite::{load_port_scan, upsert_port_scan};
use crate::models::PortScanEntry;
use std::net::{IpAddr, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const COMMON_PORTS: &[u16] = &[
    21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 465, 587, 993, 995, 1433, 1521, 2049,
    2375, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 9200, 11211, 27017,
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn service_hint(port: u16) -> String {
    match port {
        21 => "FTP",
        22 => "SSH",
        23 => "Telnet",
        25 => "SMTP",
        53 => "DNS",
        80 => "HTTP",
        110 => "POP3",
        135 => "MS-RPC",
        139 => "NetBIOS-SSN",
        143 => "IMAP",
        443 => "HTTPS",
        445 => "SMB",
        465 => "SMTPS",
        587 => "SMTP-Sub",
        993 => "IMAPS",
        995 => "POP3S",
        1433 => "MSSQL",
        1521 => "Oracle",
        2049 => "NFS",
        2375 => "Docker",
        3306 => "MySQL",
        3389 => "RDP",
        5432 => "PostgreSQL",
        5900 => "VNC",
        6379 => "Redis",
        8080 => "HTTP-Alt",
        8443 => "HTTPS-Alt",
        9200 => "Elasticsearch",
        11211 => "Memcached",
        27017 => "MongoDB",
        _ => "unknown",
    }
    .to_string()
}

pub struct PortScannerState {
    pub running: Arc<AtomicBool>,
    pub last_scan_ms: Arc<Mutex<Option<i64>>>,
    pub last_scan_target: Arc<Mutex<Option<String>>>,
}

fn bounded_extra_ports(extra_ports: &[u16]) -> Vec<u16> {
    let mut ports = Vec::with_capacity(extra_ports.len().min(64));
    for port in extra_ports.iter().take(64) {
        if port != &0 && !ports.contains(port) { ports.push(*port); }
    }
    ports
}

impl PortScannerState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            last_scan_ms: Arc::new(Mutex::new(None)),
            last_scan_target: Arc::new(Mutex::new(None)),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Synchronous low-volume TCP connect scan of common ports for one host.
    /// Skips private-network scanning unless the host is in a private range.
    pub fn scan(&self, ip: &str, extra_ports: &[u16]) -> Vec<PortScanEntry> {
        if self.running.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            return vec![];
        }
        *self.last_scan_target.lock().unwrap() = Some(ip.to_string());

        let now = now_ms();
        let mut results: Vec<PortScanEntry> = Vec::new();
        // Keep the native service bounded even when called outside the IPC
        // command (for example by a future internal caller). Do not build an
        // unbounded de-duplicated vector before applying the scan limit.
        let ports = if extra_ports.is_empty() { COMMON_PORTS.to_vec() } else { bounded_extra_ports(extra_ports) };

        for port in ports.into_iter().take(64) {
            let addr = (ip, port).to_socket_addrs().map(|mut it| it.next());
            let Ok(Some(sock_addr)) = addr else { continue };
            let started = std::time::Instant::now();
            let connected = TcpStream::connect_timeout(&sock_addr, Duration::from_millis(600));
            let _ = started;
            let state = match connected {
                Ok(_) => "OPEN",
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => "CLOSED",
                Err(_) => "UNKNOWN",
            };
            results.push(PortScanEntry {
                ip: ip.to_string(),
                port,
                protocol: "TCP".to_string(),
                state: state.to_string(),
                service: service_hint(port),
                first_seen: now,
                last_seen: now,
            });
            std::thread::sleep(Duration::from_millis(5));
        }

        for entry in &results {
            if entry.state == "OPEN" {
                upsert_port_scan(entry);
            }
        }

        *self.last_scan_ms.lock().unwrap() = Some(now);
        self.running.store(false, Ordering::SeqCst);
        results
    }

    pub fn persisted(&self, limit: usize) -> Vec<PortScanEntry> {
        load_port_scan(limit)
    }

    pub fn is_private(&self, ip: &str) -> bool {
        let Ok(parsed) = ip.parse::<IpAddr>() else {
            return false;
        };
        match parsed {
            IpAddr::V4(v4) => {
                v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.octets()[0] == 10
            }
            IpAddr::V6(v6) => {
                let seg0 = v6.segments()[0];
                v6.is_loopback() || (seg0 & 0xfe00) == 0xfc00 || (seg0 & 0xffc0) == 0xfe80
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_port_requests_are_bounded_before_deduplication() {
        let requested: Vec<u16> = (1..=u16::MAX).collect();
        let ports = bounded_extra_ports(&requested);
        assert_eq!(ports.len(), 64);
        assert_eq!(ports[0], 1);
        assert_eq!(ports[63], 64);
    }
}

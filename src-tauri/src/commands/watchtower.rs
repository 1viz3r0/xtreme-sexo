use tauri::command;
use serde::Serialize;
use std::net::Ipv4Addr;
#[cfg(target_os = "linux")]
use std::process::Command;
use std::thread;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

static ACTIVE_DISCOVERY_CACHE: OnceLock<Mutex<HashMap<String, ActiveLocalDevice>>> = OnceLock::new();

#[command]
pub fn get_watchtower_snapshot() -> crate::services::watchtower::WatchtowerSnapshot {
    crate::services::watchtower::snapshot()
}

#[command]
pub fn refresh_watchtower_snapshot() -> crate::services::watchtower::WatchtowerSnapshot {
    crate::services::watchtower::snapshot()
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveLocalDevice {
    pub ip: String,
    pub mac: Option<String>,
    pub state: String,
    pub gateway: bool,
    pub method: String,
    pub observed_at: String,
    pub last_seen: String,
    pub seen_count: u32,
    pub present: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveLocalDiscovery {
    pub interface: String,
    pub local_ip: String,
    pub cidr: String,
    pub gateway: Option<String>,
    pub devices: Vec<ActiveLocalDevice>,
    pub warnings: Vec<String>,
}

/// Bounded, explicit local discovery. This is intentionally separate from the
/// passive Watchtower snapshot: it attempts short bounded TCP reachability
/// probes against each host of the selected local /24 (or smaller) and never
/// expands to public/remote ranges.
#[command]
pub async fn watchtower_discover_local() -> Result<ActiveLocalDiscovery, String> {
    tokio::task::spawn_blocking(|| {
        let scope = crate::services::network_scope::discover();
        let iface = scope.interfaces.iter().find(|item| item.gateway.is_some() && item.address.parse::<Ipv4Addr>().map(|ip| !ip.is_loopback() && !ip.is_multicast()).unwrap_or(false)).or_else(|| scope.interfaces.iter().find(|item| {
            item.address.parse::<Ipv4Addr>().map(|ip| !ip.is_loopback() && !ip.is_multicast()).unwrap_or(false)
        })).cloned().ok_or_else(|| "No usable local IPv4 subnet was detected.".to_string())?;
        let local: Ipv4Addr = iface.address.parse().map_err(|_| "Detected local address was invalid.")?;
        let (network, prefix) = iface.scan_cidr.split_once('/').ok_or_else(|| "Detected local CIDR was invalid.".to_string()).and_then(|(n, p)| Ok((n.parse::<Ipv4Addr>().map_err(|_| "Detected network was invalid.")?, p.parse::<u8>().map_err(|_| "Detected prefix was invalid.")?)))?;
        let host_bits = 32u32.saturating_sub(prefix as u32);
        let count = 1u32.checked_shl(host_bits).unwrap_or(0).min(256);
        let base = u32::from(network);
        let gateway = iface.gateway.clone();
        let now = chrono::Utc::now().to_rfc3339();
        let candidates = (0..count).map(|offset| Ipv4Addr::from(base.saturating_add(offset))).filter(|ip| *ip != local && !ip.is_broadcast() && !ip.is_multicast()).collect::<Vec<_>>();
        let mut devices = thread::scope(|scope| {
            // Do not spawn one external ping process per address. That was the
            // main source of the old multi-second sweep. Use bounded native TCP
            // connects; refused/reset is still useful reachability evidence,
            // while timeout/route errors remain inconclusive.
            let workers = candidates.chunks(4).map(|chunk| scope.spawn(|| chunk.iter().filter_map(|ip| {
                let ip_text = ip.to_string();
                let response = [80u16, 443, 22].iter().find_map(|port| {
                    let address = SocketAddr::from((*ip, *port));
                    match TcpStream::connect_timeout(&address, Duration::from_millis(120)) {
                        Ok(_) => Some("tcp-connected"),
                        Err(error) if matches!(error.kind(), std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted) => Some("tcp-responded"),
                        Err(_) => None,
                    }
                });
                response.map(|state| ActiveLocalDevice { ip: ip_text.clone(), mac: None, state: state.into(), gateway: gateway.as_deref() == Some(ip_text.as_str()), method: "bounded TCP reachability".into(), observed_at: now.clone(), last_seen: now.clone(), seen_count: 1, present: true })
            }).collect::<Vec<_>>())).collect::<Vec<_>>();
            workers.into_iter().flat_map(|worker| worker.join().unwrap_or_default()).collect::<Vec<_>>()
        });
        devices.push(ActiveLocalDevice { ip: local.to_string(), mac: None, state: "local-interface".into(), gateway: false, method: "local interface".into(), observed_at: now.clone(), last_seen: now.clone(), seen_count: 1, present: true });
        devices.sort_by(|a, b| a.ip.cmp(&b.ip));
        #[cfg(target_os = "linux")]
        {
            if let Ok(output) = Command::new("ip").args(["neigh", "show", "dev", iface.interface_name.as_str()]).output() {
                for line in String::from_utf8_lossy(&output.stdout).lines() {
                    let fields = line.split_whitespace().collect::<Vec<_>>();
                    let Some(ip_text) = fields.first() else { continue; };
                    let Ok(ip) = ip_text.parse::<Ipv4Addr>() else { continue; };
                    if !candidates.contains(&ip) { continue; }
                    let mac = fields.windows(2).find(|pair| pair[0] == "lladdr").map(|pair| pair[1].to_string());
                    let state = fields.last().copied().unwrap_or("unknown").to_string();
                    if matches!(state.as_str(), "FAILED" | "INCOMPLETE" | "NONE") { continue; }
                    if let Some(existing) = devices.iter_mut().find(|device| device.ip == *ip_text) {
                        existing.mac = mac.or(existing.mac.take());
                        existing.state = state;
                        existing.method = "ARP/neighbour cache + TCP probes".into();
                    } else {
                        devices.push(ActiveLocalDevice { ip: ip_text.to_string(), mac, state, gateway: gateway.as_deref() == Some(ip_text), method: "ARP/neighbour cache".into(), observed_at: now.clone(), last_seen: now.clone(), seen_count: 1, present: true });
                    }
                }
            }
        }
        devices.sort_by(|a, b| a.ip.cmp(&b.ip));
        if let Some(gateway_ip) = gateway.as_ref() {
            if !devices.iter().any(|device| &device.ip == gateway_ip) {
                devices.push(ActiveLocalDevice { ip: gateway_ip.clone(), mac: None, state: "route-known".into(), gateway: true, method: "default route".into(), observed_at: now.clone(), last_seen: now.clone(), seen_count: 1, present: true });
            }
        }
        let cache = ACTIVE_DISCOVERY_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut cache = cache.lock().map_err(|_| "Local discovery cache unavailable")?;
        for device in cache.values_mut() { device.present = false; device.state = "not-seen-this-sweep".into(); }
        for mut device in devices {
            if let Some(previous) = cache.get(&device.ip) {
                device.seen_count = previous.seen_count.saturating_add(1);
                device.mac = device.mac.or_else(|| previous.mac.clone());
            }
            device.last_seen = now.clone();
            device.present = true;
            cache.insert(device.ip.clone(), device);
        }
        let mut devices = cache.values().cloned().collect::<Vec<_>>();
        devices.sort_by(|a, b| a.ip.cmp(&b.ip));
        Ok(ActiveLocalDiscovery { interface: iface.interface_name, local_ip: local.to_string(), cidr: iface.scan_cidr, gateway, devices, warnings: vec!["Fast bounded sweep: short TCP reachability probes run across the detected local subnet, enriched by the kernel neighbour (ARP) cache. Results are retained across refreshes. Present means observed in the latest sweep; not-seen-this-sweep is historical evidence, not proof that a device disconnected.".into()] })
    }).await.map_err(|error| format!("Local discovery worker failed: {error}"))?
}

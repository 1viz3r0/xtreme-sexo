use crate::database::sqlite::{load_devices, upsert_device};
use crate::models::{DeviceEntry, FlowRecord};
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Parses `arp -a` output lines like:
/// `  192.168.1.1            aa-bb-cc-dd-ee-ff     dynamic`
pub fn parse_arp_line(line: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 3 {
        return None;
    }
    let ip = parts[0];
    let mac = parts[1];
    if ip.parse::<IpAddr>().is_err() {
        return None;
    }
    let mac = normalize_mac(mac)?;
    Some((ip.to_string(), mac))
}

fn normalize_mac(mac: &str) -> Option<String> {
    let mac = mac.to_lowercase().replace('-', ":");
    let octets: Vec<_> = mac.split(':').collect();
    if octets.len() != 6 || octets.iter().any(|b| b.len() != 2 || u8::from_str_radix(b, 16).is_err())
        || mac == "ff:ff:ff:ff:ff:ff" || mac == "00:00:00:00:00:00" { return None; }
    Some(mac)
}

/// Linux kernel ARP cache: IP, hardware type, flags, MAC, mask, device.
fn parse_proc_arp_line(line: &str) -> Option<(String, String)> {
    let fields: Vec<_> = line.split_whitespace().collect();
    if fields.len() != 6 { return None; }
    let ip = fields[0].parse::<std::net::Ipv4Addr>().ok()?;
    let flags = u32::from_str_radix(fields[2].trim_start_matches("0x"), 16).ok()?;
    if flags & 0x2 == 0 { return None; } // ATF_COM: ignore unresolved neighbors.
    Some((ip.to_string(), normalize_mac(fields[3])?))
}

#[cfg(target_os = "linux")]
pub fn read_arp_table() -> Vec<(String, String)> {
    use std::io::Read;
    let result = (|| -> std::io::Result<String> {
        let mut text = String::new();
        std::fs::File::open("/proc/net/arp")?.take(1024 * 1024).read_to_string(&mut text)?;
        Ok(text)
    })();
    match result {
        Ok(text) => text.lines().filter_map(parse_proc_arp_line).take(4096).collect(),
        Err(error) => { tracing::warn!(%error, "Kernel ARP cache unavailable"); Vec::new() }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn read_arp_table() -> Vec<(String, String)> {
    let Ok(output) = std::process::Command::new("arp").arg("-a").output() else {
        return vec![];
    };
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .filter_map(parse_arp_line)
        .collect::<Vec<_>>()
}

#[cfg(test)]
mod neighbor_tests {
    use super::*;
    #[test]
    fn kernel_neighbors_require_complete_valid_records() {
        assert_eq!(parse_proc_arp_line("192.168.1.1 0x1 0x2 aa:bb:cc:dd:ee:ff * eth0"),
            Some(("192.168.1.1".into(), "aa:bb:cc:dd:ee:ff".into())));
        for line in ["IP address HW type Flags HW address Mask Device",
            "192.168.1.2 0x1 0x0 00:00:00:00:00:00 * eth0",
            "192.168.1.2 0x1 0x2 invalid * eth0",
            "192.168.1.2 aa-bb-cc-dd-ee-ff dynamic"] {
            assert!(parse_proc_arp_line(line).is_none(), "{line}");
        }
    }
    #[test]
    fn windows_neighbors_validate_mac() {
        assert!(parse_arp_line("192.168.1.1 aa-bb-cc-dd-ee-ff dynamic").is_some());
        assert!(parse_arp_line("192.168.1.1 ff:ff:ff:ff:ff:ff static").is_none());
        assert!(parse_arp_line("192.168.1.1 invalid dynamic").is_none());
    }
}

fn mac_vendor_hint(mac: &str) -> Option<String> {
    let upper = mac.to_uppercase().replace(':', "");
    let oui = upper.get(0..6)?;
    let known: &[(&str, &str)] = &[
        ("3CD92B", "Hewlett Packard"),
        ("BCF685", "Apple"),
        ("F04DA2", "Google"),
        ("4C5E0C", "Google"),
        ("00177F", "Raspberry Pi"),
        ("B827EB", "Raspberry Pi"),
        ("DCA632", "Raspberry Pi"),
        ("3C52A1", "Raspberry Pi"),
        ("282712", "Raspberry Pi"),
        ("48B02C", "Amazon"),
        ("2C48AB", "TP-Link"),
        ("58A2B5", "TP-Link"),
        ("CCA7C1", "Netgear"),
        ("A0481C", "Netgear"),
        ("001DF4", "Samsung"),
        ("A45E60", "OnePlus"),
        ("28FDF6", "Vodafone"),
        ("048D38", "Xiaomi"),
        ("905624", "Huawei"),
        ("F4F26D", "Espressif (ESP32)"),
        ("2462AB", "Espressif (ESP32)"),
        ("7CF9C2", "ESP-32"),
        ("00B3B5", "HP"),
    ];
    known
        .iter()
        .find(|(prefix, _)| oui.starts_with(prefix))
        .map(|(_, name)| name.to_string())
}

pub struct DeviceDiscoveryState {
    pub devices: Arc<Mutex<HashMap<String, DeviceEntry>>>,
    pub last_scan_ms: Arc<AtomicU64>,
}

impl DeviceDiscoveryState {
    pub fn new() -> Self {
        Self {
            devices: Arc::new(Mutex::new(HashMap::new())),
            last_scan_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn snapshot(&self) -> Vec<DeviceEntry> {
        let map = self.devices.lock().unwrap();
        let mut v: Vec<DeviceEntry> = map.values().cloned().collect();
        v.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
        v
    }

    /// Observes remote endpoints from live flows; local hosts (src) become known devices too.
    pub fn observe_flows(&self, flows: &[FlowRecord]) {
        let mut map = self.devices.lock().unwrap();
        let now = now_ms();
        for f in flows {
            for ip in [&f.src_ip, &f.dst_ip] {
                if ip.parse::<IpAddr>().is_err() {
                    continue;
                }
                let key = ip.clone();
                if let Some(dev) = map.get_mut(&key) {
                    dev.last_seen = now;
                    dev.active = true;
                }
            }
        }
    }

    /// Rebuilds the device table from the OS ARP cache; persists entries.
    pub fn rescan(&self, self_ips: &[String], interface: Option<String>) {
        let now = now_ms();
        let mut map = self.devices.lock().unwrap();
        let arp = read_arp_table();
        for (ip, mac) in arp {
            let is_self = self_ips.iter().any(|s| s == &ip);
            let entry = map.entry(ip.clone()).or_insert_with(|| DeviceEntry {
                ip: ip.clone(),
                mac: mac.clone(),
                hostname: None,
                vendor: mac_vendor_hint(&mac),
                interface: interface.clone(),
                first_seen: now,
                last_seen: now,
                active: true,
                is_self,
            });
            entry.mac = mac;
            entry.last_seen = now;
            entry.active = true;
            entry.interface = interface.clone();
            entry.is_self = is_self;
        }
        // Persist (bounded)
        let snapshot: Vec<DeviceEntry> = map.values().take(300).cloned().collect();
        for dev in snapshot {
            upsert_device(&dev);
        }
        drop(map);
        self.last_scan_ms.store(now as u64, Ordering::Relaxed);
    }

    pub fn persisted(&self, limit: usize) -> Vec<DeviceEntry> {
        load_devices(limit)
    }
}

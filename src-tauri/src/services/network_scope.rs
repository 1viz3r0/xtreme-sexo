//! Read-only local network scope discovery for Scan Buddy.
//!
//! This module intentionally only observes addresses and routing metadata. It does
//! not resolve names, send packets, enumerate hosts, or invoke a shell.

use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NetworkScopeInterface {
    pub interface_name: String,
    pub address: String,
    pub prefix: u8,
    pub scan_cidr: String,
    pub gateway: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NetworkScopeDiscovery {
    pub interfaces: Vec<NetworkScopeInterface>,
    pub warnings: Vec<String>,
}

/// Derive a scope that the current bounded scanner can expand safely. A subnet
/// broader than /24 is narrowed to the /24 containing the address; an actually
/// smaller subnet is preserved.
pub fn bounded_scan_cidr(address: Ipv4Addr, prefix: u8) -> Option<String> {
    if prefix > 32 {
        return None;
    }
    let bounded_prefix = prefix.max(24);
    let mask = if bounded_prefix == 0 {
        0
    } else {
        u32::MAX << (32 - bounded_prefix)
    };
    let network = u32::from(address) & mask;
    Some(format!("{}/{}", Ipv4Addr::from(network), bounded_prefix))
}

fn prefix_from_netmask(mask: Ipv4Addr) -> Option<u8> {
    let bits = u32::from(mask);
    let host_bits = !bits;
    if host_bits & host_bits.wrapping_add(1) != 0 {
        return None;
    }
    Some(bits.count_ones() as u8)
}

#[cfg(target_os = "linux")]
fn default_gateways() -> std::collections::HashMap<String, Ipv4Addr> {
    let mut gateways = std::collections::HashMap::new();
    let Ok(text) = std::fs::read_to_string("/proc/net/route") else {
        return gateways;
    };
    for line in text.lines().skip(1) {
        let fields: Vec<_> = line.split_whitespace().collect();
        if fields.len() < 8
            || fields[1] != "00000000"
            || fields[3].parse::<u16>().map_or(true, |f| f & 0x2 == 0)
        {
            continue;
        }
        let Ok(raw) = u32::from_str_radix(fields[2], 16) else {
            continue;
        };
        gateways.insert(fields[0].to_string(), Ipv4Addr::from(raw.to_le_bytes()));
    }
    gateways
}

#[cfg(not(target_os = "linux"))]
fn default_gateways() -> std::collections::HashMap<String, Ipv4Addr> {
    // pcap is the existing cross-platform native interface stack. Gateway
    // metadata is optional and remains unknown where the OS API is unavailable.
    std::collections::HashMap::new()
}

pub fn discover() -> NetworkScopeDiscovery {
    let gateways = default_gateways();
    let mut warnings = Vec::new();
    let devices = match crate::platform::capture::devices() {
        Ok(devices) => devices,
        Err(error) => {
            warnings.push(format!("Local interface enumeration unavailable: {error}"));
            return NetworkScopeDiscovery {
                interfaces: Vec::new(),
                warnings,
            };
        }
    };
    let mut interfaces = Vec::new();
    for device in devices {
        for address in device.addresses.into_iter().filter(|a| a.addr.is_ipv4()) {
            let IpAddr::V4(ip) = address.addr else {
                continue;
            };
            let Some(mask) = address.netmask.and_then(|m| match m {
                IpAddr::V4(v) => Some(v),
                _ => None,
            }) else {
                warnings.push(format!(
                    "No IPv4 netmask reported for {} ({ip})",
                    device.name
                ));
                continue;
            };
            let Some(prefix) = prefix_from_netmask(mask) else {
                warnings.push(format!(
                    "Non-contiguous IPv4 netmask reported for {} ({ip})",
                    device.name
                ));
                continue;
            };
            let Some(scan_cidr) = bounded_scan_cidr(ip, prefix) else {
                continue;
            };
            interfaces.push(NetworkScopeInterface {
                interface_name: device.name.clone(),
                address: ip.to_string(),
                prefix,
                scan_cidr,
                gateway: gateways.get(&device.name).map(ToString::to_string),
                warnings: if gateways.contains_key(&device.name) {
                    Vec::new()
                } else {
                    vec!["Default gateway is unknown for this interface".into()]
                },
            });
        }
    }
    if interfaces.is_empty() {
        warnings.push("No local IPv4 interface scope was available".into());
    }
    NetworkScopeDiscovery {
        interfaces,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broad_subnet_is_bounded_to_address_24() {
        assert_eq!(
            bounded_scan_cidr("10.20.30.44".parse().unwrap(), 16),
            Some("10.20.30.0/24".into())
        );
    }

    #[test]
    fn smaller_subnet_is_preserved() {
        assert_eq!(
            bounded_scan_cidr("192.168.1.6".parse().unwrap(), 28),
            Some("192.168.1.0/28".into())
        );
        assert_eq!(
            bounded_scan_cidr("192.168.1.6".parse().unwrap(), 32),
            Some("192.168.1.6/32".into())
        );
    }

    #[test]
    fn invalid_prefix_and_masks_are_rejected() {
        assert_eq!(bounded_scan_cidr(Ipv4Addr::LOCALHOST, 33), None);
        assert_eq!(prefix_from_netmask("255.255.0.255".parse().unwrap()), None);
        assert_eq!(
            prefix_from_netmask("255.255.255.0".parse().unwrap()),
            Some(24)
        );
    }
}

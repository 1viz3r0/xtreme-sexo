//! Bounded, read-only host network snapshot for Watchtower.
//!
//! This deliberately reads OS tables only. It does not resolve names, probe
//! peers, invoke a shell, or open a capture handle.

use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_INTERFACES: usize = 128;
const MAX_ROUTES: usize = 128;
const MAX_NEIGHBORS: usize = 512;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WatchtowerCounters {
    pub receive_bytes: Option<u64>,
    pub transmit_bytes: Option<u64>,
    pub receive_packets: Option<u64>,
    pub transmit_packets: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WatchtowerInterface {
    pub name: String,
    pub addresses: Vec<String>,
    pub mac_address: Option<String>,
    pub oper_state: Option<String>,
    pub counters: WatchtowerCounters,
    pub wifi_ssid: Option<String>,
    pub wifi_bssid: Option<String>,
    pub wifi_association: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WatchtowerRoute {
    pub interface: String,
    pub destination: String,
    pub gateway: Option<String>,
    pub metric: Option<u32>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WatchtowerNeighbor {
    pub interface: String,
    pub address: String,
    pub mac_address: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WatchtowerSnapshot {
    pub captured_at: String,
    pub captured_at_unix_ms: i64,
    pub interfaces: Vec<WatchtowerInterface>,
    pub routes: Vec<WatchtowerRoute>,
    pub default_gateway: Option<String>,
    pub neighbors: Vec<WatchtowerNeighbor>,
    pub stale: bool,
    pub warnings: Vec<String>,
}

fn now() -> (String, i64) {
    let unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    (
        chrono::DateTime::<chrono::Utc>::from_timestamp_millis(unix_ms)
            .map(|d| d.to_rfc3339())
            .unwrap_or_else(|| "timestamp unavailable".into()),
        unix_ms,
    )
}

#[cfg(target_os = "linux")]
fn is_wireless_interface(name: &str) -> bool {
    std::path::Path::new(&format!("/sys/class/net/{name}/wireless")).exists()
}

#[cfg(not(target_os = "linux"))]
fn is_wireless_interface(_name: &str) -> bool {
    false
}

/// The kernel's wireless sysfs ABI intentionally does not expose the current
/// SSID or BSSID.  Do not try to recover those values from process output or a
/// guessed configuration file.  `carrier` is a read-only kernel indication of
/// whether a wireless link is associated, and is the strongest metadata that
/// is available without depending on NetworkManager's optional D-Bus service.
#[cfg(target_os = "linux")]
fn wifi_association_from_carrier(value: &str) -> Option<&'static str> {
    match value {
        "1" => Some("associated"),
        "0" => Some("disconnected"),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn read_bounded_text(path: &str, max_bytes: u64) -> std::io::Result<String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.take(max_bytes + 1).read_to_end(&mut bytes)?;
    if bytes.len() > max_bytes as usize {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "native metadata exceeded its read bound",
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "native metadata was not UTF-8"))
}

#[cfg(target_os = "linux")]
fn read_wifi_metadata(name: &str) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    let carrier_path = format!("/sys/class/net/{name}/carrier");
    match read_bounded_text(&carrier_path, 64).map(|value| value.trim().to_string()) {
        Ok(value) if wifi_association_from_carrier(&value) == Some("associated") => (
            None,
            None,
            Some("associated".into()),
            vec![
                "SSID and BSSID are unavailable from the Linux wireless sysfs ABI; NetworkManager D-Bus is not used".into(),
            ],
        ),
        Ok(value) if wifi_association_from_carrier(&value) == Some("disconnected") => (
            None,
            None,
            Some("disconnected".into()),
            vec![
                "SSID and BSSID are unavailable from the Linux wireless sysfs ABI; NetworkManager D-Bus is not used".into(),
            ],
        ),
        Ok(_) => (
            None,
            None,
            None,
            vec!["Wireless carrier state contained an unknown value; SSID, BSSID, and association are unavailable".into()],
        ),
        Err(error) => (
            None,
            None,
            None,
            vec![format!(
                "Wireless carrier state is unavailable ({error}); SSID, BSSID, and association are unavailable"
            )],
        ),
    }
}

#[cfg(not(target_os = "linux"))]
fn read_wifi_metadata(_name: &str) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    (
        None,
        None,
        None,
        vec!["Wi-Fi metadata is unavailable through portable native APIs on this platform".into()],
    )
}

#[cfg(target_os = "linux")]
fn linux_routes() -> (Vec<WatchtowerRoute>, Option<String>, Vec<String>) {
    let Ok(text) = std::fs::read_to_string("/proc/net/route") else {
        return (
            Vec::new(),
            None,
            vec![
                "Linux route table /proc/net/route is unavailable; default gateway is unknown"
                    .into(),
            ],
        );
    };
    parse_linux_routes(&text)
}

#[cfg(target_os = "linux")]
fn parse_linux_routes(text: &str) -> (Vec<WatchtowerRoute>, Option<String>, Vec<String>) {
    let mut routes = Vec::new();
    let mut warnings = Vec::new();
    for line in text.lines().skip(1).take(MAX_ROUTES) {
        let f: Vec<_> = line.split_whitespace().collect();
        if f.len() < 8 {
            continue;
        }
        let Ok(destination) = u32::from_str_radix(f[1], 16) else {
            continue;
        };
        let Ok(gateway) = u32::from_str_radix(f[2], 16) else {
            continue;
        };
        let Ok(flags) = u16::from_str_radix(f[3], 16) else {
            continue;
        };
        let Ok(metric) = f[6].parse::<u32>() else {
            continue;
        };
        let Ok(mask) = u32::from_str_radix(f[7], 16) else {
            continue;
        };
        let destination = std::net::Ipv4Addr::from(destination.to_le_bytes()).to_string();
        let prefix = mask.to_be().leading_ones();
        let gateway = std::net::Ipv4Addr::from(gateway.to_le_bytes());
        let gateway = if gateway.is_unspecified() {
            None
        } else {
            Some(gateway.to_string())
        };
        let destination = format!("{destination}/{prefix}");
        routes.push(WatchtowerRoute {
            interface: f[0].to_string(),
            destination,
            gateway,
            metric: Some(metric),
            active: flags & 0x1 != 0,
        });
    }
    // A route table may contain multiple default routes.  The kernel prefers
    // the active route with the lowest metric, rather than the first row.
    let gateway = routes
        .iter()
        .filter(|r| r.destination == "0.0.0.0/0" && r.active)
        .min_by_key(|r| r.metric.unwrap_or(u32::MAX))
        .and_then(|r| r.gateway.clone());
    if gateway.is_none() {
        warnings.push("No active default gateway was reported by the local route table".into());
    }
    (routes, gateway, warnings)
}

#[cfg(not(target_os = "linux"))]
fn linux_routes() -> (Vec<WatchtowerRoute>, Option<String>, Vec<String>) {
    (Vec::new(), None, vec!["Default route inspection is unavailable through the portable native APIs on this platform".into()])
}

#[cfg(target_os = "linux")]
fn linux_neighbors() -> (Vec<WatchtowerNeighbor>, Vec<String>) {
    match netlink_neighbors() {
        Ok(result) => result,
        Err(error) => arp_fallback(&error),
    }
}

#[cfg(target_os = "linux")]
const NEIGHBOR_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
#[cfg(target_os = "linux")]
const MAX_NEIGHBOR_MESSAGES: usize = 4096;

#[cfg(target_os = "linux")]
fn netlink_neighbors() -> Result<(Vec<WatchtowerNeighbor>, Vec<String>), String> {
    // snapshot() is synchronous and can also be called inside a Tokio runtime.
    // Keep this private current-thread runtime off the caller's executor. No
    // blocking workers are spawned; timeout/drop closes the socket and cancels
    // the connection task, including when a dump is cut short by output bounds.
    std::thread::Builder::new()
        .name("watchtower-neighbors".into())
        .spawn(|| {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())?;
            runtime.block_on(async {
                tokio::time::timeout(NEIGHBOR_TIMEOUT, dump_netlink_neighbors())
                    .await
                    .map_err(|_| "native neighbor dump timed out after 1 second".to_string())?
            })
        })
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|_| "native neighbor reader terminated unexpectedly".to_string())?
}

#[cfg(target_os = "linux")]
async fn dump_netlink_neighbors() -> Result<(Vec<WatchtowerNeighbor>, Vec<String>), String> {
    use futures_util::TryStreamExt;
    use netlink_packet_route::link::LinkAttribute;

    let (connection, handle, _) = rtnetlink::new_connection().map_err(|e| e.to_string())?;
    let connection_task = tokio::spawn(connection);
    // Abort on every exit path, including timeout cancellation of this future.
    struct AbortConnection(tokio::task::JoinHandle<()>);
    impl Drop for AbortConnection {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _connection = AbortConnection(connection_task);
    let mut names = std::collections::HashMap::new();
    let mut links = handle.link().get().execute();
    let mut count = 0;
    while let Some(link) = links.try_next().await.map_err(|e| e.to_string())? {
        count += 1;
        if count > 1024 {
            return Err("interface dump exceeded 1024 records".into());
        }
        for attr in link.attributes {
            if let LinkAttribute::IfName(name) = attr {
                names.insert(link.header.index, name);
            }
        }
    }
    // AF_UNSPEC dumps IPv4 and IPv6. Ignore bridge/FDB and other families.
    // GETLINK and GETNEIGH are read-only kernel requests, never NUD probes.
    let mut stream = handle.neighbours().get().execute();
    let mut result = Vec::new();
    let mut warnings = Vec::new();
    for _ in 0..MAX_NEIGHBOR_MESSAGES {
        let Some(message) = stream.try_next().await.map_err(|e| e.to_string())? else {
            return Ok((result, warnings));
        };
        if let Some(neighbor) = normalize_netlink_neighbor(&message, &names) {
            result.push(neighbor);
        }
        if result.len() == MAX_NEIGHBORS {
            warnings.push("Kernel neighbor output was bounded to 512 records; additional records may be omitted".into());
            return Ok((result, warnings));
        }
    }
    warnings.push(
        "Kernel neighbor dump was bounded to 4096 messages; additional records may be omitted"
            .into(),
    );
    Ok((result, warnings))
}

#[cfg(target_os = "linux")]
fn normalize_netlink_neighbor(
    message: &netlink_packet_route::neighbour::NeighbourMessage,
    names: &std::collections::HashMap<u32, String>,
) -> Option<WatchtowerNeighbor> {
    use netlink_packet_route::{
        neighbour::{NeighbourAddress, NeighbourAttribute},
        AddressFamily,
    };
    let mut address = None;
    let mut mac_address = String::new();
    for attr in &message.attributes {
        match attr {
            NeighbourAttribute::Destination(NeighbourAddress::Inet(ip))
                if message.header.family == AddressFamily::Inet =>
            {
                address = Some(ip.to_string())
            }
            NeighbourAttribute::Destination(NeighbourAddress::Inet6(ip))
                if message.header.family == AddressFamily::Inet6 =>
            {
                address = Some(ip.to_string())
            }
            // Link-layer addresses are not necessarily six-byte Ethernet MACs.
            NeighbourAttribute::LinkLocalAddress(bytes) if bytes.len() <= 32 => {
                mac_address = bytes
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<Vec<_>>()
                    .join(":");
            }
            _ => {}
        }
    }
    let index = message.header.ifindex;
    if index == 0 {
        return None;
    }
    Some(WatchtowerNeighbor {
        // Retain identity if an interface disappeared between the two dumps.
        interface: names
            .get(&index)
            .cloned()
            .unwrap_or_else(|| format!("ifindex:{index}")),
        address: address?,
        mac_address,
        state: nud_state(u16::from(message.header.state)),
    })
}

#[cfg(target_os = "linux")]
fn nud_state(bits: u16) -> String {
    if bits == 0 {
        return "none".into();
    }
    let mut states = Vec::new();
    for (bit, label) in [
        (1, "incomplete"),
        (2, "reachable"),
        (4, "stale"),
        (8, "delay"),
        (16, "probe"),
        (32, "failed"),
        (64, "noarp"),
        (128, "permanent"),
    ] {
        if bits & bit != 0 {
            states.push(label.to_string());
        }
    }
    if bits & !0xff != 0 {
        states.push(format!("unknown(0x{:x})", bits & !0xff));
    }
    states.join("|")
}

#[cfg(target_os = "linux")]
fn arp_fallback(error: &str) -> (Vec<WatchtowerNeighbor>, Vec<String>) {
    use std::io::Read;
    const MAX_ARP_BYTES: u64 = 256 * 1024;
    let mut warnings = vec![format!("Native IPv4/IPv6 neighbor inspection failed ({error}); falling back to IPv4-only /proc/net/arp, which does not report NUD reachability states")];
    let mut bytes = Vec::new();
    match std::fs::File::open("/proc/net/arp")
        .and_then(|file| file.take(MAX_ARP_BYTES + 1).read_to_end(&mut bytes))
    {
        Ok(_) => {
            if bytes.len() > MAX_ARP_BYTES as usize {
                warnings.push(
                    "IPv4 ARP fallback exceeded its 256 KiB read bound; no partial table was used"
                        .into(),
                );
                return (Vec::new(), warnings);
            }
            let (neighbors, mut parsing_warnings) =
                parse_linux_neighbors(&String::from_utf8_lossy(&bytes));
            warnings.append(&mut parsing_warnings);
            (neighbors, warnings)
        }
        Err(_) => {
            warnings.push("Linux neighbor table /proc/net/arp is unavailable".into());
            (Vec::new(), warnings)
        }
    }
}

#[cfg(target_os = "linux")]
fn parse_linux_neighbors(text: &str) -> (Vec<WatchtowerNeighbor>, Vec<String>) {
    let mut result = Vec::new();
    for line in text.lines().skip(1).take(MAX_NEIGHBORS) {
        let f: Vec<_> = line.split_whitespace().collect();
        if f.len() != 6 {
            continue;
        }
        let Ok(flags) = u32::from_str_radix(f[2].trim_start_matches("0x"), 16) else {
            continue;
        };
        let Ok(address) = f[0].parse::<std::net::Ipv4Addr>() else {
            continue;
        };
        let mac: Option<Vec<u8>> = f[3]
            .split(':')
            .map(|part| {
                if part.len() != 2 {
                    return None;
                }
                u8::from_str_radix(part, 16).ok()
            })
            .collect();
        let Some(mac) = mac.filter(|m| m.len() == 6) else {
            continue;
        };
        if flags & 0x2 == 0 || mac.iter().all(|b| *b == 0) {
            continue;
        }
        // ARP flags 0x2 is ATF_COM (a completed ARP entry).  "reachable" is
        // an NUD state and is not represented by this legacy table.
        result.push(WatchtowerNeighbor {
            interface: f[5].to_string(),
            address: address.to_string(),
            mac_address: mac
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<Vec<_>>()
                .join(":"),
            state: "complete".into(),
        });
    }
    let warnings = if text.lines().skip(1).count() > MAX_NEIGHBORS {
        vec!["IPv4 ARP fallback was bounded to 512 rows; additional records were omitted".into()]
    } else {
        Vec::new()
    };
    (result, warnings)
}

#[cfg(not(target_os = "linux"))]
fn linux_neighbors() -> (Vec<WatchtowerNeighbor>, Vec<String>) {
    (Vec::new(), vec!["Connected local neighbor inspection is unavailable through portable native APIs on this platform".into()])
}

pub fn snapshot() -> WatchtowerSnapshot {
    let (captured_at, captured_at_unix_ms) = now();
    let adapters = crate::platform::get_detailed_network_adapters();
    let mut warnings = Vec::new();
    let interfaces: Vec<WatchtowerInterface> = adapters.into_iter().take(MAX_INTERFACES).map(|a| {
        let wireless = is_wireless_interface(&a.name);
        let mut iw = Vec::new();
        if a.oper_status == "Unknown" { iw.push("Interface operational state is unavailable".into()); }
        let (wifi_ssid, wifi_bssid, wifi_association, mut wifi_warnings) = if wireless {
            read_wifi_metadata(&a.name)
        } else {
            (None, None, None, Vec::new())
        };
        iw.append(&mut wifi_warnings);
        WatchtowerInterface { name: a.name, addresses: a.ipv4_addresses.into_iter().chain(a.ipv6_addresses).collect(), mac_address: (!a.mac_address.is_empty()).then_some(a.mac_address), oper_state: (!a.oper_status.is_empty()).then_some(a.oper_status), counters: WatchtowerCounters { receive_bytes: Some(a.rx_bytes), transmit_bytes: Some(a.tx_bytes), receive_packets: Some(a.rx_packets), transmit_packets: Some(a.tx_packets) }, wifi_ssid, wifi_bssid, wifi_association, warnings: iw }
    }).collect();
    if interfaces.is_empty() {
        warnings.push("No local interfaces were returned by the native interface API".into());
    }
    let (routes, default_gateway, mut route_warnings) = linux_routes();
    let (neighbors, mut neighbor_warnings) = linux_neighbors();
    warnings.append(&mut route_warnings);
    warnings.append(&mut neighbor_warnings);
    if interfaces.len() == MAX_INTERFACES
        || routes.len() == MAX_ROUTES
        || neighbors.len() == MAX_NEIGHBORS
    {
        warnings.push("Snapshot output was bounded; additional records were omitted".into());
    }
    // Feed kernel neighbour observations into the persistent IP intelligence
    // inventory. Passive only (never scan-authorizing); fields are additive
    // and never downgrade existing knowledge.
    crate::services::ip_intel::record_observations(
        &neighbors
            .iter()
            .filter(|neighbor| neighbor.mac_address != "00:00:00:00:00:00")
            .map(|neighbor| crate::services::ip_intel::IpObservation {
                ip: neighbor.address.clone(),
                mac: (!neighbor.mac_address.is_empty()).then_some(neighbor.mac_address.clone()),
                hostname: None,
                vendor: crate::services::device_discovery::mac_vendor_hint(&neighbor.mac_address),
                interface: Some(neighbor.interface.clone()),
                source: "kernel-neighbors",
                packets: 0,
                bytes: 0,
                flows: 0,
                activity_at: None,
            })
            .collect::<Vec<_>>(),
    );
    WatchtowerSnapshot {
        captured_at,
        captured_at_unix_ms,
        interfaces,
        routes,
        default_gateway,
        neighbors,
        stale: false,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "linux")]
    #[test]
    fn routes_use_prefixes_and_lowest_active_default_metric() {
        let input = "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT\neth0 00000000 0100000A 0003 0 0 50 00000000 0 0 0\neth1 00000000 0200000A 0001 0 0 10 00000000 0 0 0\neth0 0000A8C0 00000000 0001 0 0 20 00FFFFFF 0 0 0\n";
        let (routes, gateway, warnings) = super::parse_linux_routes(input);
        assert_eq!(routes[2].destination, "192.168.0.0/24");
        assert_eq!(gateway.as_deref(), Some("10.0.0.2"));
        assert!(warnings.is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn arp_complete_is_not_reported_as_reachable() {
        let input = "IP address HW type Flags HW address Mask Device\n192.0.2.1 0x1 0x6 aa:bb:cc:dd:ee:ff * eth0\n";
        let (neighbors, warnings) = super::parse_linux_neighbors(input);
        assert_eq!(neighbors[0].state, "complete");
        assert_eq!(neighbors[0].mac_address, "aa:bb:cc:dd:ee:ff");
        assert!(warnings.is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn nud_states_preserve_kernel_bits_and_unknown_values() {
        assert_eq!(super::nud_state(0), "none");
        assert_eq!(super::nud_state(0x02), "reachable");
        assert_eq!(super::nud_state(0x04 | 0x20), "stale|failed");
        assert_eq!(super::nud_state(0x102), "reachable|unknown(0x100)");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn arp_parser_rejects_malformed_addresses_and_zero_macs() {
        let input = "header\nnot-an-ip 0x1 0x6 aa:bb:cc:dd:ee:ff * eth0\n192.0.2.2 0x1 0x6 00:00:00:00:00:00 * eth0\n192.0.2.3 0x1 0x6 01:02:03:04:05:06 * eth0\n";
        let (neighbors, _) = super::parse_linux_neighbors(input);
        assert_eq!(neighbors.len(), 1);
        assert_eq!(neighbors[0].address, "192.0.2.3");
    }

    #[test]
    fn snapshot_is_timestamped_and_wifi_is_explicitly_provenance_bound() {
        let snapshot = super::snapshot();
        assert!(snapshot.captured_at_unix_ms > 0);
        assert!(snapshot
            .interfaces
            .iter()
            .all(|i| i.wifi_ssid.is_none() && i.wifi_bssid.is_none() || i.wifi_association.is_some()));
        assert!(snapshot
            .interfaces
            .iter()
            .filter(|i| i.name.contains("wl") || i.name.contains("wifi") || i.name.contains("wlan"))
            .all(|i| i.warnings.iter().any(|w| w.contains("SSID") || w.contains("carrier"))));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn carrier_values_are_the_only_association_source() {
        // This checks the documented mapping without touching the host's real
        // sysfs state. SSID/BSSID remain absent because sysfs does not provide
        // them.
        assert_eq!(super::wifi_association_from_carrier("1"), Some("associated"));
        assert_eq!(super::wifi_association_from_carrier("0"), Some("disconnected"));
        assert_eq!(super::wifi_association_from_carrier("2"), None);
        assert_eq!(super::wifi_association_from_carrier(""), None);
    }
}

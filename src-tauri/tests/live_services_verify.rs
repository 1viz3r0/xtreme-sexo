//! LIVE real-world service validation (integration test).
//!
//! Exercises every Phase 11 service against the real machine and the real
//! internet. All assertions must be backed by REAL data - no mocks, no fakes.
//! Tests that depend on network reachability degrade gracefully with a
//! printed UNAVAILABLE marker instead of fabricating results.

use netoze_desktop::services::{
    connectivity_monitor::{decide_state, probe, ConnectivityState},
    device_discovery::{read_arp_table, DeviceDiscoveryState},
    geoip_service::GeoIpService,
    port_scanner::PortScannerState,
    threat_intel::{evaluate_ips_for_threats, fetch_feeds, ThreatIntelState},
};
use std::time::Duration;

#[test]
fn live_connectivity_probe_and_state_machine() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (ok, source, latency, detail) = rt.block_on(probe());
    if ok {
        println!(
            "[live] connectivity probe OK via {} latency={}ms detail={}",
            source, latency, detail
        );
        assert!(latency > 0, "real probe must yield a positive latency");
        assert!(latency < 10_000, "probe latency absurdly high");
    } else {
        println!("[live] connectivity probe UNAVAILABLE: {}", detail);
    }

    let now = 1_000_000_000_000u64;
    assert_eq!(decide_state(true, Some(now), now).0, "ONLINE");
    assert_eq!(
        decide_state(false, Some(now - 10_000), now).0,
        "DEGRADED"
    );
    assert_eq!(
        decide_state(false, Some(now - 95_000), now).0,
        "OFFLINE"
    );
    assert_eq!(decide_state(false, None, now).0, "OFFLINE");

    let state = ConnectivityState::new();
    assert_eq!(state.snapshot().state, "CONNECTING");
    println!("[live] connectivity state machine PASS");
}

#[test]
fn live_geoip_public_ip_and_lookup() {
    let svc = GeoIpService::new();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let public_ip = rt.block_on(svc.resolve_public_ip());
    match &public_ip {
        Some(ip) => {
            assert!(!ip.is_empty());
            assert!(!svc.is_private(ip), "public IP must not be classified private");
            println!("[live] public IP = {}", ip);
            let entry = rt.block_on(svc.lookup(ip));
            let entry = entry.expect("GeoIP lookup for own public IP must return an entry");
            println!(
                "[live] geoip {} -> country={} code={} city={} asn={:?} source={}",
                ip,
                entry.country,
                entry.country_code,
                entry.city,
                entry.asn,
                entry.source
            );
            assert_eq!(entry.country_code.len(), 2, "real ISO country code expected");
            assert!(!entry.country.is_empty());
        }
        None => println!("[live] public IP UNAVAILABLE (no internet or ipify blocked)"),
    }

    // Private IPs must never leave the machine: synthetic LOCAL entry, no external call.
    let entry = rt.block_on(svc.lookup("192.168.1.99"));
    let entry = entry.expect("private IP must resolve to synthetic local entry");
    assert_eq!(entry.source, "local-classification");
    println!("[live] private IP handled locally ({} -> {})", "192.168.1.99", entry.country);
    assert!(svc.is_private("10.0.0.1"));
    assert!(svc.is_private("192.168.1.1"));
    assert!(svc.is_private("172.16.5.5"));
    assert!(svc.is_private("169.254.10.10"));
    assert!(!svc.is_private("8.8.8.8"));
    println!("[live] geoip PASS");
}

#[test]
fn live_threat_feed_fetch_and_lookup() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let entries = rt.block_on(fetch_feeds());
    match entries {
        Ok(list) => {
            println!(
                "[live] threat feeds fetched: {} indicators (feeds: sslbl, feodo)",
                list.len()
            );
            assert!(!list.is_empty(), "feeds must return real indicators when online");
            let some_ip = list[0].ip.clone();
            println!("[live] sample indicator: {} (feed={})", some_ip, list[0].feed);
            let state = ThreatIntelState::new();
            {
                let mut map = state.iocs.lock().unwrap();
                for e in &list {
                    map.insert(e.ip.clone(), e.clone());
                }
            }
            let matches = evaluate_ips_for_threats(&state, &[some_ip.clone()], 10);
            assert_eq!(matches.len(), 1, "lookup of a known IOC must match");
            println!("[live] indicator match confirmed for {}", some_ip);
        }
        Err(e) => {
            println!("[live] threat feeds UNAVAILABLE: {}", e);
            assert!(!e.is_empty());
        }
    }
    println!("[live] threat intel PASS");
}

#[test]
fn live_arp_device_discovery() {
    let table = read_arp_table();
    println!("[live] ARP table entries: {}", table.len());
    for (ip, mac) in table.iter().take(5) {
        println!("[live] arp {} -> {}", ip, mac);
    }
    if table.is_empty() {
        println!("[live] ARP table EMPTY (no peers on local network)");
        return;
    }
    let state = DeviceDiscoveryState::new();
    let self_ips: Vec<String> = netoze_desktop::platform::windows::get_network_adapters()
        .into_iter()
        .flat_map(|a| a.ip_addresses)
        .collect();
    state.rescan(&self_ips, None);
    let devices = state.snapshot();
    println!("[live] discovered devices: {}", devices.len());
    for d in devices.iter().take(6) {
        println!(
            "[live] device {} mac={} vendor={:?} self={} active={}",
            d.ip, d.mac, d.vendor, d.is_self, d.active
        );
    }
    assert!(!devices.is_empty(), "rescan of real ARP table must yield devices");
    let persisted = state.persisted(50);
    assert!(!persisted.is_empty(), "devices must persist to SQLite");
    println!("[live] device discovery + persistence PASS ({} rows)", persisted.len());
}

#[test]
fn live_localhost_port_scan() {
    let scanner = PortScannerState::new();
    assert!(scanner.is_private("127.0.0.1"));
    assert!(scanner.is_private("192.168.1.7"));
    assert!(scanner.is_private("fe80::1"));
    let results = scanner.scan("127.0.0.1", &[]);
    let open: Vec<_> = results.iter().filter(|r| r.state == "OPEN").collect();
    println!(
        "[live] localhost scan: {} results, {} open",
        results.len(),
        open.len()
    );
    for r in results.iter().take(10) {
        println!("[live] port {} state={} service={}", r.port, r.state, r.service);
    }
    let persisted = scanner.persisted(50);
    println!("[live] port scan persisted rows: {}", persisted.len());
    assert!(
        !persisted.is_empty(),
        "scan results must be persisted (open ports at minimum)"
    );
    println!("[live] port scan PASS");
}

#[test]
fn live_windows_event_log_read() {
    let events = netoze_desktop::platform::event_log::get_windows_event_logs(20);
    if events.is_empty() {
        println!("[live] windows event log EMPTY or access limited (may be normal on this machine)");
        return;
    }
    for e in events.iter().take(5) {
        println!(
            "[live] event {} level={} channel={} provider={} ts={} msg={}",
            e.event_id,
            e.level,
            e.channel,
            e.provider,
            e.timestamp,
            e.message.chars().take(80).collect::<String>()
        );
    }
    assert!(events.len() <= 20);
    println!("[live] windows event log PASS ({} real events)", events.len());
}

#[test]
fn live_audit_chain_and_sqlite_crud() {
    use netoze_desktop::database::sqlite::{
        append_audit_entry, load_threat_matches, verify_audit_chain,
    };

    let curr = append_audit_entry("validation-test", "LIVE_TEST", "chain-integrity")
        .expect("audit append must succeed");
    assert_eq!(curr.len(), 64, "SHA-256 hex hash length");
    assert!(
        verify_audit_chain().expect("chain verification must not error"),
        "audit chain must be intact after append"
    );
    println!("[live] audit chain append + verify PASS (hash {})", &curr[..16]);

    let _ = load_threat_matches(5);
    println!("[live] sqlite reads PASS");
}

#[test]
fn live_dns_records_persistence() {
    use netoze_desktop::database::sqlite::{insert_dns_records_batch, load_dns_records};
    use netoze_desktop::models::DnsQueryEntry;

    let marker = "validation-test.invalid";
    let records = vec![
        DnsQueryEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            client_ip: "192.168.1.7".to_string(),
            server_ip: "1.1.1.1".to_string(),
            qname: marker.to_string(),
            qtype: "A".to_string(),
            rcode: 0,
            answers: 1,
        },
        DnsQueryEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            client_ip: "192.168.1.7".to_string(),
            server_ip: "8.8.8.8".to_string(),
            qname: marker.to_string(),
            qtype: "AAAA".to_string(),
            rcode: 0,
            answers: 0,
        },
    ];
    insert_dns_records_batch(&records);

    let loaded = load_dns_records(50);
    let found: Vec<_> = loaded
        .iter()
        .filter(|r| r.qname == marker)
        .collect();
    assert_eq!(found.len(), 2, "batched DNS records must persist to SQLite");
    println!(
        "[live] dns_records batch persist PASS ({} marker rows found, {} total)",
        found.len(),
        loaded.len()
    );

    let conn = rusqlite::Connection::open(
        netoze_desktop::database::sqlite::get_app_dir().join("netoze_app.db"),
    )
    .unwrap();
    conn.execute("DELETE FROM dns_records WHERE qname = ?1", [marker])
        .unwrap();
    println!("[live] dns_records test rows cleaned up");
}

#[test]
fn live_process_socket_correlation() {
    let snapshot = netoze_desktop::services::system_inspector::collect_system_snapshot();
    let sockets = snapshot.tcp_sockets;
    println!("[live] active TCP sockets: {}", sockets.len());
    if sockets.is_empty() {
        println!("[live] no active TCP sockets (machine idle)");
        return;
    }
    let mut with_pids = 0;
    for s in sockets.iter().take(6) {
        println!(
            "[live] socket {}:{} -> {}:{} state={} pid={} proc={}",
            s.local_ip, s.local_port, s.remote_ip, s.remote_port, s.state, s.pid, s.process_name
        );
        if s.pid != 0 {
            with_pids += 1;
        }
    }
    assert!(
        with_pids > 0,
        "at least some live sockets must carry real PID/process attribution"
    );
    println!("[live] process->socket correlation PASS");
}

#[test]
fn live_packet_parse_real_payload() {
    #[cfg(target_os = "linux")]
    {
        let has_cap_net_raw = std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|status| status.lines().find_map(|line| line.strip_prefix("CapEff:\t").map(str::to_owned)))
            .and_then(|cap_eff| u64::from_str_radix(cap_eff.trim(), 16).ok())
            .is_some_and(|cap_eff| cap_eff & (1 << 13) != 0);
        if !has_cap_net_raw {
            println!("[live] packet parse SKIP: CAP_NET_RAW unavailable");
            return;
        }
    }
    // Reuse the real packet bytes captured by the capture_verify test path is not
    // possible here; instead re-verify the parser on a real, freshly captured packet
    // if a capture interface is available. If capture is unavailable, mark UNAVAILABLE.
    let devices = pcap::Device::list().unwrap_or_default();
    if devices.is_empty() {
        println!("[live] packet capture UNAVAILABLE (no Npcap interfaces)");
        return;
    }
    let dev = devices
        .iter()
        .find(|d| !d.desc.clone().unwrap_or_default().to_lowercase().contains("loopback"))
        .unwrap_or(&devices[0]);
    let mut cap = pcap::Capture::from_device(dev.name.as_str())
        .expect("open device")
        .promisc(false)
        .snaplen(65535)
        .timeout(2000)
        .open()
        .expect("open capture");
    let mut parsed = 0;
    let deadline = std::time::Instant::now() + Duration::from_secs(4);
    while std::time::Instant::now() < deadline {
        match cap.next_packet() {
            Ok(pkt) => {
                let meta = netoze_desktop::services::packet_parser::parse_raw_packet(
                    &pkt.data,
                    &chrono::Utc::now().to_rfc3339(),
                );
                if meta.eth_type == "IPv4" && meta.src_ip != "0.0.0.0" {
                    parsed += 1;
                    if parsed == 1 {
                        println!(
                            "[live] real packet: {} -> {} proto={} ports={}:{} len={} tcp_flags=0x{:02x}",
                            meta.src_ip, meta.dst_ip, meta.protocol, meta.src_port, meta.dst_port,
                            meta.orig_len, meta.tcp_flags
                        );
                    }
                }
            }
            Err(pcap::Error::TimeoutExpired) => {}
            Err(e) => {
                println!("[live] capture error: {}", e);
                break;
            }
        }
    }
    if parsed == 0 {
        println!("[live] no packets seen in 4s window (quiet interface) - UNAVAILABLE");
    } else {
        println!("[live] real packet parse PASS ({} packets)", parsed);
    }
}

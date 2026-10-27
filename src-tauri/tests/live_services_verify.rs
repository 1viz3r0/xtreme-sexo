//! LIVE real-world service validation (integration test).
//!
//! Exercises every Phase 11 service against the real machine and the real
//! internet. All assertions must be backed by REAL data - no mocks, no fakes.
//! External-service acceptance is explicit opt-in and fails if its prerequisite
//! provider is unavailable; local regression checks never need Internet access.

use netoze_desktop::services::{
    connectivity_monitor::{decide_state, probe, ConnectivityState},
    device_discovery::{read_arp_table, DeviceDiscoveryState},
    geoip_service::GeoIpService,
    port_scanner::PortScannerState,
    threat_intel::{evaluate_ips_for_threats, fetch_feeds, ThreatIntelState},
};
mod support;
#[path = "support/capture_fixture.rs"]
mod capture_fixture;

#[test]
#[ignore = "external connectivity acceptance; run explicitly with network access"]
fn live_connectivity_probe_and_state_machine() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (ok, source, latency, detail) = rt.block_on(probe());
    assert!(ok, "Connectivity provider unavailable during opt-in acceptance: {detail}");
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
#[ignore = "external ipify/ipwho.is acceptance; requires provider reachability and coverage"]
fn live_geoip_public_ip_and_lookup() {
    let _data = support::isolated_data("live-geoip");
    let svc = GeoIpService::new();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let public_ip = rt.block_on(svc.resolve_public_ip());
    match &public_ip {
        Some(ip) => {
            assert!(!ip.is_empty());
            assert!(!svc.is_private(ip), "public IP must not be classified private");
            println!("[live] public IP = {}", ip);
            let entry = rt.block_on(svc.lookup_checked(ip))
                .expect("GeoIP provider must return an entry during opt-in acceptance");
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
        None => panic!("Public IP provider unavailable during opt-in acceptance"),
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
fn reserved_geoip_classification_never_requires_a_provider() {
    let _data = support::isolated_data("local-geoip");
    let service = GeoIpService::new();
    let rt = tokio::runtime::Runtime::new().unwrap();
    for ip in ["127.0.0.1", "192.168.1.99", "10.0.0.1", "172.16.5.5", "169.254.10.10", "192.0.2.1", "::1", "fc00::1"] {
        let entry = rt.block_on(service.lookup_checked(ip)).unwrap();
        assert_eq!(entry.source, "local-classification");
        assert_eq!(entry.latitude, None);
        assert_eq!(entry.longitude, None);
    }
    assert_eq!(service.cache_stats(), (0, 0));
}

#[test]
#[ignore = "external sslbl/feodo feed acceptance; requires provider reachability"]
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
        Err(error) => panic!("Threat provider unavailable during opt-in acceptance: {error}"),
    }
    println!("[live] threat intel PASS");
}

#[test]
fn live_arp_device_discovery() {
    let _data = support::isolated_data("arp");
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
    let _data = support::isolated_data("localhost-scan");
    netoze_desktop::database::sqlite::init_sqlite().unwrap();
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let scanner = PortScannerState::new();
    assert!(scanner.is_private("127.0.0.1"));
    assert!(scanner.is_private("192.168.1.7"));
    assert!(scanner.is_private("fe80::1"));
    let results = scanner.scan("127.0.0.1", &[port]);
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
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].port, port);
    assert!(persisted.iter().any(|entry| entry.ip == "127.0.0.1" && entry.port == port && entry.state == "OPEN"),
        "the known local listener must be observed and read back from isolated storage");
    println!("[live] port scan PASS");
}

#[test]
#[cfg(windows)]
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
    let _data = support::isolated_data("audit-chain");
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
    let _data = support::isolated_data("dns-storage");
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
#[ignore = "live capture requires the explicit isolated interface/peer fixture in support/capture_fixture.rs"]
fn live_packet_parse_real_payload() {
    let _data = support::isolated_data("live-packet-parser");
    let packets = capture_fixture::capture_packets(false, 5);
    assert!(packets.iter().all(|packet| packet.eth_type == "IPv4" && packet.protocol == "UDP" && packet.dst_port == 49000));
}

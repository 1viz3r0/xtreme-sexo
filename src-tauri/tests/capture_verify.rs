//! REAL Npcap capture verification (integration test).
//!
//! Opens a live capture on the first non-loopback interface, generates controlled
//! internet traffic from this machine, and verifies the complete chain:
//!   interface -> Npcap -> packet parse -> flow engine -> SQLite persistence
//!
//! Requires: Npcap runtime installed, elevated privileges (driver restricted to
//! Administrators by default), and internet connectivity for traffic generation.

use netoze_desktop::services::packet_parser::parse_raw_packet;
use netoze_desktop::services::FlowEngine;
use pcap::{Capture, Device};
use std::net::{TcpStream, UdpSocket};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "linux")]
fn has_cap_net_raw() -> bool {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|status| {
            status
                .lines()
                .find_map(|line| line.strip_prefix("CapEff:\t").map(str::to_owned))
        })
        .and_then(|cap_eff| u64::from_str_radix(cap_eff.trim(), 16).ok())
        .is_some_and(|cap_eff| cap_eff & (1 << 13) != 0)
}

#[cfg(not(target_os = "linux"))]
fn has_cap_net_raw() -> bool {
    true
}

fn generate_traffic_worker(seconds: u64) {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(seconds) {
        // HTTPS connects (TLS handshake packets) - IP literals only
        for host in ["1.1.1.1:443", "8.8.8.8:443", "9.9.9.9:443", "1.1.1.1:80"] {
            let addr: std::net::SocketAddr = host.parse().unwrap();
            let _ = TcpStream::connect_timeout(&addr, Duration::from_millis(1500));
        }
        // DNS queries over UDP (raw + system resolver lookups)
        for server in ["8.8.8.8:53", "1.1.1.1:53"] {
            if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
                let query: Vec<u8> = vec![
                    0xAB, 0xCD, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
                    0x07, b'e', b'x', b'a', b'm', b'p', b'l', b'e', 0x03, b'c', b'o', b'm',
                    0x00, 0x00, 0x01, 0x00, 0x01,
                ];
                let _ = sock.send_to(&query, server);
            }
        }
        let _ = ("example.com", 80).to_socket_addrs();
        let _ = ("www.github.com", 443).to_socket_addrs();
        // Plain HTTP GET to an IP-literal host
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &"1.1.1.1:80".parse::<std::net::SocketAddr>().unwrap(),
            Duration::from_millis(1500),
        ) {
            let _ = stream.write_all(b"GET / HTTP/1.0\r\nHost: one.one.one.one\r\n\r\n");
            let _ = stream.read(&mut [0u8; 256]);
        }
        thread::sleep(Duration::from_millis(800));
    }
}

use std::io::{Read, Write};
use std::net::ToSocketAddrs;

fn pick_capture_device<'a>(devices: &'a [Device]) -> &'a Device {
    let virtual_markers = [
        "wan miniport", "loopback", "bluetooth", "vmware", "virtualbox", "hyper-v", "tap-",
        "tap ", "vethernet", "network monitor", "npf_loopback", "microsoft", "ndis",
        "kernel debug", "sstp", "l2tp", "pptp", "pppoe", "wsl", "docker",
    ];
    let preferred_markers = ["wi-fi", "wifi", "ethernet", "wireless", "802.11", "intel", "realtek", "qualcomm", "broadcom", "killer"];
    for dev in devices {
        let name = dev.name.to_lowercase();
        let desc = dev.desc.clone().unwrap_or_default().to_lowercase();
        if preferred_markers.iter().any(|m| name.contains(m) || desc.contains(m)) {
            return dev;
        }
    }
    for dev in devices {
        let name = dev.name.to_lowercase();
        let desc = dev.desc.clone().unwrap_or_default().to_lowercase();
        if !virtual_markers.iter().any(|m| name.contains(m) || desc.contains(m)) {
            return dev;
        }
    }
    &devices[0]
}

#[test]
fn real_capture_flow_pipeline() {
    if !has_cap_net_raw() {
        println!("[capture_verify] SKIP: CAP_NET_RAW is unavailable in this environment");
        return;
    }

    let devices = Device::list().expect("Npcap device enumeration failed");
    assert!(!devices.is_empty(), "no Npcap interfaces found");

    let dev = pick_capture_device(&devices);
    println!("[capture_verify] using interface: {} ({:?})", dev.name, dev.desc);

    let mut cap = Capture::from_device(dev.name.as_str())
        .expect("open device")
        .promisc(true)
        .snaplen(65535)
        .timeout(100)
        .open()
        .expect("start live capture (elevated?)");

    // Spawn controlled traffic generator
    let gen = thread::spawn(|| generate_traffic_worker(14));

    let flow_engine = FlowEngine::new();
    let mut parsed_total = 0u32;
    let mut tcp_pkts = 0u32;
    let mut udp_pkts = 0u32;
    let mut icmp_pkts = 0u32;
    let mut with_ports = 0u32;
    let mut last_report = Instant::now();

    let deadline = Instant::now() + Duration::from_secs(16);
    while Instant::now() < deadline {
        match cap.next_packet() {
            Ok(packet) => {
                let meta = parse_raw_packet(&packet.data, &chrono::Utc::now().to_rfc3339());
                if meta.eth_type == "IPv4" && meta.src_ip != "0.0.0.0" {
                    parsed_total += 1;
                    match meta.protocol.as_str() {
                        "TCP" => tcp_pkts += 1,
                        "UDP" => udp_pkts += 1,
                        "ICMP" => icmp_pkts += 1,
                        _ => {}
                    }
                    if meta.src_port > 0 || meta.dst_port > 0 {
                        with_ports += 1;
                    }
                    flow_engine.ingest_packet(&meta);
                }
            }
            Err(pcap::Error::TimeoutExpired) => {}
            Err(err) => panic!("capture error: {err}"),
        }

        if last_report.elapsed() >= Duration::from_secs(4) {
            println!(
                "[capture_verify] parsed={parsed_total} tcp={tcp_pkts} udp={udp_pkts} icmp={icmp_pkts}"
            );
            last_report = Instant::now();
        }
    }

    let _ = gen.join();

    println!(
        "[capture_verify] FINAL parsed={parsed_total} tcp={tcp_pkts} udp={udp_pkts} icmp={icmp_pkts} with_ports={with_ports}"
    );

    // HARD EVIDENCE: real packets must have been received and parsed
    assert!(
        parsed_total >= 5,
        "no real packets captured within 16s - is Npcap working and traffic flowing?"
    );
    assert!(
        tcp_pkts + udp_pkts >= 3,
        "expected TCP/UDP packet activity but got none"
    );
    assert!(with_ports > 0, "expected parsed packets with ports");

    // Flow aggregation from real packets
    let flows = flow_engine.get_active_flows(1000);
    assert!(!flows.is_empty(), "no flows created from real packets");
    let flow_bytes: u64 = flows.iter().map(|f| f.total_bytes).sum();
    println!(
        "[capture_verify] flows_created={} total_flow_bytes={}",
        flows.len(),
        flow_bytes
    );
    assert!(flow_bytes > 0);

    // SQLite persistence
    let before = sqlite_flow_count();
    let res = netoze_desktop::database::duckdb::persist_flow_records(&flows);
    assert!(res.is_ok(), "flow persistence failed: {:?}", res.err());
    let after = sqlite_flow_count();
    assert!(
        after > before,
        "SQLite flow_records did not grow (before={before} after={after})"
    );
    println!("[capture_verify] sqlite flow_records {before} -> {after}");
}

fn sqlite_flow_count() -> i64 {
    let db_path = netoze_desktop::database::sqlite::get_app_dir().join("netoze_app.db");
    let conn = rusqlite::Connection::open(&db_path).expect("open sqlite");
    conn.query_row("SELECT COUNT(*) FROM flow_records", [], |r| r.get(0))
        .unwrap_or(0)
}

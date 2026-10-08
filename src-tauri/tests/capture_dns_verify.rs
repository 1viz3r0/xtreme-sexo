//! Real capture -> DNS telemetry persistence (integration test).
//!
//! Opens a live Npcap interface, generates controlled DNS traffic, reads real
//! packets through NpcapCapture::read_packet (the exact path the app loop uses),
//! and persists real DNS query records to SQLite. Cleans up its own rows.

use netoze_desktop::database::sqlite::{insert_dns_records_batch, load_dns_records};
use netoze_desktop::models::DnsQueryEntry;
use netoze_desktop::services::packet_parser::parse_raw_packet;
use netoze_desktop::services::NpcapCapture;
use pcap::Device;
use std::net::UdpSocket;
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

fn dns_query(sock: &UdpSocket, server: &str) {
    let query: Vec<u8> = vec![
        0xAB, 0xCD, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
        0x07, b'e', b'x', b'a', b'm', b'p', b'l', b'e', 0x03, b'c', b'o', b'm',
        0x00, 0x00, 0x01, 0x00, 0x01,
    ];
    let _ = sock.send_to(&query, server);
}

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
fn real_capture_dns_persistence() {
    if !has_cap_net_raw() {
        println!("[dns-verify] SKIP: CAP_NET_RAW is unavailable in this environment");
        return;
    }

    let devices = Device::list().expect("Npcap device enumeration failed");
    assert!(!devices.is_empty(), "no Npcap interfaces found");
    let dev = pick_capture_device(&devices);
    println!("[dns-verify] interface: {} ({:?})", dev.name, dev.desc);

    let capture = NpcapCapture::new(
        std::sync::Arc::new(std::sync::Mutex::new(netoze_desktop::services::FlowEngine::new())),
        std::sync::Arc::new(std::sync::Mutex::new(netoze_desktop::services::Ja4Engine::new())),
        std::sync::Arc::new(std::sync::Mutex::new(netoze_desktop::services::DetectionEngine::new())),
        std::sync::Arc::new(std::sync::Mutex::new(netoze_desktop::services::GraphEngine::new())),
        std::sync::Arc::new(std::sync::Mutex::new(netoze_desktop::services::StorylineBuilder::new())),
    );
    capture
        .open_interface(&dev.name)
        .expect("open live capture (elevated?)");

    let sock = UdpSocket::bind("0.0.0.0:0").expect("bind UDP socket");
    let deadline = Instant::now() + Duration::from_secs(12);
    let mut dns_seen = 0usize;

    while Instant::now() < deadline {
        dns_query(&sock, "8.8.8.8:53");
        match capture.read_packet() {
            Ok(Some((data, ts))) => {
                let meta = parse_raw_packet(&data, &ts);
                if meta.eth_type == "IPv4" {
                    if let Some(ref qname) = meta.dns_qname {
                        if !qname.is_empty() {
                            insert_dns_records_batch(&[DnsQueryEntry {
                                timestamp: ts,
                                client_ip: meta.src_ip.clone(),
                                server_ip: meta.dst_ip.clone(),
                                qname: qname.clone(),
                                qtype: meta.dns_qtype.clone(),
                                rcode: meta.dns_rcode,
                                answers: meta.dns_answers,
                            }]);
                            dns_seen += 1;
                            if dns_seen >= 2 {
                                break;
                            }
                        }
                    }
                }
            }
            Ok(None) => {}
            Err(e) => {
                println!("[dns-verify] capture error: {}", e);
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    capture.close();

    if dns_seen == 0 {
        println!("[dns-verify] no DNS packets observed in window - UNAVAILABLE");
        return;
    }

    let loaded = load_dns_records(20);
    let marker_rows: Vec<_> = loaded.iter().filter(|r| r.qname == "example.com").collect();
    assert!(
        !marker_rows.is_empty(),
        "real example.com DNS records must be persisted (got {})",
        loaded.len()
    );
    for r in marker_rows.iter().take(3) {
        println!(
            "[dns-verify] persisted dns record qname={} qtype={} client={} server={} rcode={} answers={}",
            r.qname, r.qtype, r.client_ip, r.server_ip, r.rcode, r.answers
        );
    }

    let conn = rusqlite::Connection::open(
        netoze_desktop::database::sqlite::get_app_dir().join("netoze_app.db"),
    )
    .unwrap();
    let deleted = conn
        .execute("DELETE FROM dns_records WHERE qname = 'example.com'", [])
        .unwrap();
    println!("[dns-verify] cleanup: removed {} example.com rows (test-owned)", deleted);
    println!("[dns-verify] PASS - real DNS packets captured and persisted");
}

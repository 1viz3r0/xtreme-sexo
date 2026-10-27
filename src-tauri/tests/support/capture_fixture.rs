//! Opt-in live fixture: dedicated VM/netns, exact adapter and on-link IPv4 peer.
//! Example environment (set only in the prepared disposable capture host):
//! NETOZE_LIVE_CAPTURE=1 NETOZE_CAPTURE_ISOLATED=1
//! NETOZE_CAPTURE_INTERFACE=captest0 NETOZE_CAPTURE_LOCAL_IP=192.0.2.1
//! NETOZE_CAPTURE_PEER_IP=192.0.2.2
//! The peer must drain UDP ports 53 and 49000 (a local sink, not a resolver),
//! and both addresses must be on the fixture link with no unrelated traffic.
//! Run the selected test with --ignored --exact --test-threads=1. The ordinary
//! Linux GUI/test executable needs no capture capability; the installed helper does.
use netoze_desktop::{models::PacketMetadata, services::{NpcapCapture, FlowEngine, Ja4Engine, DetectionEngine, GraphEngine, StorylineBuilder, packet_parser::parse_raw_packet}};
use std::{net::{IpAddr, Ipv4Addr, UdpSocket}, sync::{Arc, Mutex}, time::{Duration, Instant}};

pub fn capture_packets(dns: bool, minimum: usize) -> Vec<PacketMetadata> {
    assert_eq!(std::env::var("NETOZE_LIVE_CAPTURE").as_deref(), Ok("1"), "explicit NETOZE_LIVE_CAPTURE=1 is required");
    assert_eq!(std::env::var("NETOZE_CAPTURE_ISOLATED").as_deref(), Ok("1"), "requires a dedicated disposable VM or network namespace containing synthetic traffic only");
    let interface = std::env::var("NETOZE_CAPTURE_INTERFACE").expect("set the exact NETOZE_CAPTURE_INTERFACE; automatic interface selection is forbidden");
    let local: Ipv4Addr = std::env::var("NETOZE_CAPTURE_LOCAL_IP").expect("set NETOZE_CAPTURE_LOCAL_IP").parse().expect("numeric local IPv4 required");
    let peer: Ipv4Addr = std::env::var("NETOZE_CAPTURE_PEER_IP").expect("set NETOZE_CAPTURE_PEER_IP").parse().expect("numeric on-link fixture peer required");
    assert!(peer.is_private() || peer.is_loopback() || peer.is_link_local() || peer.is_documentation(), "public Internet peers are forbidden");
    let device = netoze_desktop::platform::capture::devices().expect("enumerate capture devices").into_iter().find(|device| device.name == interface).expect("explicit interface does not exist");
    let address = device.addresses.iter().find(|address| address.addr == IpAddr::V4(local)).expect("local IP must belong to the exact interface");
    let mask = match address.netmask { Some(IpAddr::V4(mask)) => u32::from(mask), _ => panic!("fixture interface must supply an IPv4 subnet mask") };
    assert_ne!(mask, 0, "an unrestricted/default-route mask is not an isolated fixture");
    assert_eq!(u32::from(local) & mask, u32::from(peer) & mask, "fixture peer must be directly on-link");
    assert!(!peer.is_unspecified() && !peer.is_broadcast() && !peer.is_multicast());
    assert!(u32::from(peer) & !mask != !mask || peer.is_loopback(), "subnet broadcasts are forbidden");
    let socket = UdpSocket::bind((local, 0)).expect("bind fixture sender to the specified local address");
    socket.set_write_timeout(Some(Duration::from_millis(500))).unwrap();
    let port = if dns { 53 } else { 49000 };
    let source_port = socket.local_addr().unwrap().port();
    let filter = format!("udp and src host {local} and dst host {peer} and src port {source_port} and dst port {port}");
    let capture = NpcapCapture::new(Arc::new(Mutex::new(FlowEngine::new())), Arc::new(Mutex::new(Ja4Engine::new())),
        Arc::new(Mutex::new(DetectionEngine::new())), Arc::new(Mutex::new(GraphEngine::new())), Arc::new(Mutex::new(StorylineBuilder::new())));
    capture.open_filtered_interface(&interface, &filter).expect("open the authorized native recorder (Linux helper or Windows Npcap); a failed opt-in check is not a pass");
    let mut nonce = [0u8; 8]; getrandom::fill(&mut nonce).unwrap();
    let label = format!("netoze-{:016x}", u64::from_ne_bytes(nonce));
    let qname = format!("{label}.invalid");
    let mut payload = nonce.to_vec();
    if dns {
        payload = vec![0xab, 0xcd, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
        payload.push(label.len() as u8); payload.extend(label.as_bytes());
        payload.extend(b"\x07invalid\x00\x00\x01\x00\x01");
    }
    let deadline = Instant::now() + Duration::from_secs(12);
    let mut packets = Vec::new();
    while Instant::now() < deadline && packets.len() < minimum {
        socket.send_to(&payload, (peer, port)).expect("send synthetic on-link fixture datagram");
        if let Some((bytes, timestamp)) = capture.read_packet().expect("native fixture read failed") {
            let metadata = parse_raw_packet(&bytes, &timestamp);
            if metadata.src_ip == local.to_string() && metadata.dst_ip == peer.to_string()
                && metadata.src_port == source_port && metadata.dst_port == port
                && bytes.windows(payload.len()).any(|bytes| bytes == payload)
                && (!dns || metadata.dns_qname.as_deref() == Some(qname.as_str())) {
                packets.push(metadata);
            }
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    capture.close();
    assert!(packets.len() >= minimum, "expected at least {minimum} synthetic live packets on the exact fixture interface; got {}", packets.len());
    packets
}

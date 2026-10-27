use crate::models::PacketMetadata;

fn format_mac(bytes: &[u8]) -> String {
    if bytes.len() < 6 {
        return "00:00:00:00:00:00".to_string();
    }
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]
    )
}

fn parse_ipv4_addr(bytes: &[u8]) -> String {
    if bytes.len() < 4 {
        return "0.0.0.0".to_string();
    }
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

fn parse_ipv6_addr(bytes: &[u8]) -> String {
    if bytes.len() < 16 {
        return "::".to_string();
    }
    let mut octets = [0u8; 16];
    octets.copy_from_slice(&bytes[..16]);
    std::net::Ipv6Addr::from(octets).to_string()
}

/// Returns (ethertype, offset of L3 payload), skipping 802.1Q / QinQ tags.
fn l3_offset(payload: &[u8]) -> Option<(u16, usize)> {
    if payload.len() < 14 {
        return None;
    }
    let mut eth_type = u16::from_be_bytes([payload[12], payload[13]]);
    let mut off = 14usize;
    for _ in 0..2 {
        if eth_type != 0x8100 && eth_type != 0x88A8 {
            break;
        }
        if payload.len() < off + 4 {
            return None;
        }
        eth_type = u16::from_be_bytes([payload[off + 2], payload[off + 3]]);
        off += 4;
    }
    Some((eth_type, off))
}

// A transport header must belong to the declared IP packet, never Ethernet
// padding or a non-reassembled fragment. Both metadata and TLS use this slice.
fn transport(payload: &[u8]) -> Option<(u8, &[u8])> {
    let (kind, offset) = l3_offset(payload)?;
    let ip = payload.get(offset..)?;
    let (mut next, mut cursor, end) = match kind {
        0x0800 if ip.len() >= 20 && ip[0] >> 4 == 4 => {
            let ihl = (ip[0] & 15) as usize * 4;
            let length = u16::from_be_bytes([ip[2], ip[3]]) as usize;
            if ihl < 20 || ihl > ip.len() || length < ihl
                || u16::from_be_bytes([ip[6], ip[7]]) & 0x3fff != 0 { return None; }
            (ip[9], ihl, length.min(ip.len()))
        }
        0x86dd if ip.len() >= 40 && ip[0] >> 4 == 6 => {
            let length = u16::from_be_bytes([ip[4], ip[5]]) as usize;
            if length == 0 { return None; }
            (ip[6], 40, (40 + length).min(ip.len()))
        }
        _ => return None,
    };
    for _ in 0..8 {
        if next == 44 { return None; }
        if ![0, 43, 60, 51].contains(&next) { return Some((next, ip.get(cursor..end)?)); }
        let extension = ip.get(cursor..end)?;
        if extension.len() < 2 { return None; }
        let size = if next == 51 { (extension[1] as usize + 2) * 4 } else { (extension[1] as usize + 1) * 8 };
        if size > extension.len() { return None; }
        cursor += size;
        next = extension[0];
    }
    None
}

fn tcp_payload(tcp: &[u8]) -> Option<&[u8]> {
    if tcp.len() < 20 { return None; }
    let size = (tcp[12] >> 4) as usize * 4;
    if size < 20 { return None; }
    tcp.get(size..)
}

fn dns_metadata(data: &[u8], tcp: bool) -> (Option<String>, String, i16, u16) {
    if tcp {
        if data.len() < 2 { return (None, String::new(), -1, 0); }
        let length = u16::from_be_bytes([data[0], data[1]]) as usize;
        match data.get(2..2 + length) {
            Some(message) => parse_dns(message, 0),
            None => (None, String::new(), -1, 0),
        }
    } else { parse_dns(data, 0) }
}

fn dns_qtype_name(qtype: u16) -> String {
    match qtype {
        1 => "A".to_string(),
        2 => "NS".to_string(),
        5 => "CNAME".to_string(),
        6 => "SOA".to_string(),
        12 => "PTR".to_string(),
        15 => "MX".to_string(),
        16 => "TXT".to_string(),
        28 => "AAAA".to_string(),
        33 => "SRV".to_string(),
        255 => "ANY".to_string(),
        other => format!("TYPE_{}", other),
    }
}

/// Parses the DNS section of a DNS packet (UDP payload starting at dns_start).
/// Returns (qname, qtype, rcode, answer_count).
fn parse_dns(payload: &[u8], dns_start: usize) -> (Option<String>, String, i16, u16) {
    let dns = &payload[dns_start..];
    if dns.len() < 12 {
        return (None, "".to_string(), -1, 0);
    }
    let flags = u16::from_be_bytes([dns[2], dns[3]]);
    let qdcount = u16::from_be_bytes([dns[4], dns[5]]);
    let ancount = u16::from_be_bytes([dns[6], dns[7]]);
    let rcode = (flags & 0x000F) as i16;

    if qdcount == 0 {
        return (None, "".to_string(), rcode, ancount);
    }

    // Decode first question name (labels)
    let mut pos = 12;
    let mut qname = String::new();
    let mut ok = true;
    loop {
        if pos >= dns.len() {
            ok = false;
            break;
        }
        let len = dns[pos] as usize;
        if len == 0 {
            pos += 1;
            break;
        }
        if len > 63 || pos + 1 + len > dns.len() {
            ok = false;
            break;
        }
        if !qname.is_empty() {
            qname.push('.');
        }
        match std::str::from_utf8(&dns[pos + 1..pos + 1 + len]) {
            Ok(s) => qname.push_str(s),
            Err(_) => {
                ok = false;
                break;
            }
        }
        pos += 1 + len;
    }

    if !ok || qname.is_empty() || pos + 4 > dns.len() {
        return (None, "".to_string(), rcode, ancount);
    }

    let qtype = u16::from_be_bytes([dns[pos], dns[pos + 1]]);
    (Some(qname.to_lowercase()), dns_qtype_name(qtype), rcode, ancount)
}

pub fn parse_raw_packet(payload: &[u8], timestamp: &str) -> PacketMetadata {
    let captured_len = payload.len() as u32;
    let orig_len = captured_len;

    let default_meta = || PacketMetadata {
        timestamp: timestamp.to_string(),
        captured_len,
        orig_len,
        eth_type: "RAW_FRAME".to_string(),
        src_mac: "00:00:00:00:00:00".to_string(),
        dst_mac: "00:00:00:00:00:00".to_string(),
        src_ip: "0.0.0.0".to_string(),
        dst_ip: "0.0.0.0".to_string(),
        protocol: "RAW".to_string(),
        src_port: 0,
        dst_port: 0,
        tcp_flags: 0,
        arp_sender_ip: "".to_string(),
        arp_sender_mac: "00:00:00:00:00:00".to_string(),
        dns_qname: None,
        dns_qtype: "".to_string(),
        dns_rcode: -1,
        dns_answers: 0,
    };

    let Some((eth_type_num, l3_off)) = l3_offset(payload) else {
        return default_meta();
    };

    let dst_mac = format_mac(&payload[0..6]);
    let src_mac = format_mac(&payload[6..12]);

    let mut eth_type = format!("0x{:04X}", eth_type_num);
    let mut src_ip = "0.0.0.0".to_string();
    let mut dst_ip = "0.0.0.0".to_string();
    let mut protocol = "OTHER".to_string();
    let mut src_port: u16 = 0;
    let mut dst_port: u16 = 0;
    let mut tcp_flags: u8 = 0;
    let mut arp_sender_ip = "".to_string();
    let mut arp_sender_mac = "00:00:00:00:00:00".to_string();
    let mut dns_qname: Option<String> = None;
    let mut dns_qtype = "".to_string();
    let mut dns_rcode: i16 = -1;
    let mut dns_answers: u16 = 0;

    let l3_data = &payload[l3_off..];

    if eth_type_num == 0x0800 && l3_data.len() >= 20 && l3_data[0] >> 4 == 4 {
        eth_type = "IPv4".to_string();
        let proto_num = l3_data[9];
        src_ip = parse_ipv4_addr(&l3_data[12..16]);
        dst_ip = parse_ipv4_addr(&l3_data[16..20]);

        protocol = match proto_num {
            1 => "ICMP".to_string(),
            6 | 17 => "IPv4".to_string(),
            _ => format!("IP_PROTO_{}", proto_num),
        };

    } else if eth_type_num == 0x86DD && l3_data.len() >= 40 && l3_data[0] >> 4 == 6 {
        eth_type = "IPv6".to_string();
        let next_hdr = l3_data[6];
        src_ip = parse_ipv6_addr(&l3_data[8..24]);
        dst_ip = parse_ipv6_addr(&l3_data[24..40]);

        protocol = match next_hdr {
            6 | 17 => "IPv6".to_string(),
            58 => "ICMPv6".to_string(),
            _ => format!("IPV6_NEXT_{}", next_hdr),
        };

    } else if eth_type_num == 0x0806 {
        eth_type = "ARP".to_string();
        protocol = "ARP".to_string();
        // ARP: htype(2) ptype(2) hlen(1) plen(1) opcode(2) sha(6) spa(4) tha(6) tpa(4)
        if l3_data.len() >= 8 {
            let opcode = u16::from_be_bytes([l3_data[6], l3_data[7]]);
            if l3_data.len() >= 20 {
                arp_sender_mac = format_mac(&l3_data[8..14]);
                arp_sender_ip = parse_ipv4_addr(&l3_data[14..18]);
            }
            if opcode == 1 {
                protocol = "ARP_REQUEST".to_string();
            } else if opcode == 2 {
                protocol = "ARP_REPLY".to_string();
            }
        }
    }

    if let Some((next, data)) = transport(payload) {
        let application = match next {
            6 => tcp_payload(data).map(|application| (application, true)),
            17 if data.len() >= 8 => {
                let length = u16::from_be_bytes([data[4], data[5]]) as usize;
                if length < 8 { None } else { data.get(8..length).map(|application| (application, false)) }
            }
            _ => None,
        };
        if let Some((application, tcp)) = application {
            protocol = if tcp { "TCP" } else { "UDP" }.into();
            src_port = u16::from_be_bytes([data[0], data[1]]);
            dst_port = u16::from_be_bytes([data[2], data[3]]);
            if tcp { tcp_flags = data[13]; }
            if src_port == 53 || dst_port == 53 {
                (dns_qname, dns_qtype, dns_rcode, dns_answers) = dns_metadata(application, tcp);
            }
        }
    }

    PacketMetadata {
        timestamp: timestamp.to_string(),
        captured_len,
        orig_len,
        eth_type,
        src_mac,
        dst_mac,
        src_ip,
        dst_ip,
        protocol,
        src_port,
        dst_port,
        tcp_flags,
        arp_sender_ip,
        arp_sender_mac,
        dns_qname,
        dns_qtype,
        dns_rcode,
        dns_answers,
    }
}

/// Returns the TCP payload (after L2/IP/TCP headers) for TLS-layer inspection, if any.
pub fn l4_payload(payload: &[u8]) -> Option<&[u8]> {
    let (next, data) = transport(payload)?;
    if next == 6 { tcp_payload(data) } else { None }
}

#[cfg(test)]
mod l4_payload_tests {
    use super::l4_payload;

    #[test]
    fn test_l4_payload_ipv4_tcp() {
        let mut frame = vec![0u8; 14 + 20 + 20 + 32];
        frame[12] = 0x08;
        frame[13] = 0x00;
        frame[14] = 0x45;
        frame[16..18].copy_from_slice(&72u16.to_be_bytes());
        frame[23] = 6;
        frame[14 + 20 + 12] = 0x50;
        let payload = &frame[14 + 20 + 20..];
        assert_eq!(l4_payload(&frame), Some(payload));
    }

    #[test]
    fn test_l4_payload_non_tcp_returns_none() {
        let mut frame = vec![0u8; 14 + 20 + 20];
        frame[12] = 0x08;
        frame[13] = 0x00;
        frame[14] = 0x45;
        frame[23] = 17;
        assert!(l4_payload(&frame).is_none());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_padding_fragments_bad_lengths_and_segmented_dns() {
        let dns = crate::services::buddy_engine::tests::dns_packet();
        let valid = parse_raw_packet(&dns, "fixture");
        assert_eq!(valid.dns_qname.as_deref(), Some("example.com"));
        for (offset, value) in [(16, 20u16), (20, 1), (20, 0x2000), (38, 65535)] {
            let mut frame = dns.clone();
            frame[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
            let parsed = parse_raw_packet(&frame, "fixture");
            assert_eq!(parsed.src_port, 0, "offset {offset} value {value}");
            assert_eq!(parsed.dst_port, 0);
            assert!(parsed.dns_qname.is_none());
            assert!(l4_payload(&frame).is_none());
        }
        let message = &dns[42..];
        let mut framed = (message.len() as u16).to_be_bytes().to_vec();
        framed.extend(message);
        let mut tcp = crate::services::buddy_engine::tests::tcp_packet(1, 16, &framed);
        tcp[36..38].copy_from_slice(&53u16.to_be_bytes());
        assert_eq!(parse_raw_packet(&tcp, "fixture").dns_qname.as_deref(), Some("example.com"));
        tcp.pop();
        assert!(parse_raw_packet(&tcp, "fixture").dns_qname.is_none());
        let mut padded = crate::services::buddy_engine::tests::tcp_packet(1, 16, &[]);
        padded.extend(b"not a TLS payload");
        assert_eq!(l4_payload(&padded), Some(&[][..]));
    }

    #[test]
    fn test_ipv4_tcp_packet_decoding() {
        let sample = [
            0x52, 0x54, 0x00, 0x12, 0x34, 0x56, // Dst MAC: 52:54:00:12:34:56
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, // Src MAC: 00:11:22:33:44:55
            0x08, 0x00,                         // IPv4
            0x45, 0x00, 0x00, 0x28, 0x1A, 0x2B, 0x00, 0x00, 0x40, 0x06, 0x00, 0x00,
            192, 168, 1, 104,                   // Src IP: 192.168.1.104
            185, 199, 108, 153,                 // Dst IP: 185.199.108.153
            0xD8, 0xF0, 0x01, 0xBB,             // Src Port: 55536, Dst Port: 443
            0x00, 0x00, 0x00, 0x00,             // Sequence Number
            0x00, 0x00, 0x00, 0x00,             // Acknowledgment Number
            0x50, 0x10, 0x20, 0x00,             // Data Offset 5, Flags 0x10 (ACK), Window
            0x00, 0x00, 0x00, 0x00,             // Checksum, urgent pointer
        ];

        let meta = parse_raw_packet(&sample, "2026-08-08T18:25:00Z");
        assert_eq!(meta.eth_type, "IPv4");
        assert_eq!(meta.src_mac, "00:11:22:33:44:55");
        assert_eq!(meta.dst_mac, "52:54:00:12:34:56");
        assert_eq!(meta.src_ip, "192.168.1.104");
        assert_eq!(meta.dst_ip, "185.199.108.153");
        assert_eq!(meta.protocol, "TCP");
        assert_eq!(meta.src_port, 55536);
        assert_eq!(meta.dst_port, 443);
        assert_eq!(meta.tcp_flags, 0x10);
    }

    #[test]
    fn test_dns_query_parsing() {
        // Ethernet + IPv4 + UDP + DNS query for example.com A
        let mut pkt = vec![0u8; 14];
        pkt[12] = 0x08;
        pkt[13] = 0x00;
        let ip: Vec<u8> = vec![
            0x45, 0x00, 0x00, 0x2E, 0x00, 0x00, 0x00, 0x00, 0x40, 0x11, 0x00, 0x00, 192, 168, 1, 5,
            8, 8, 8, 8,
        ];
        let udp: Vec<u8> = vec![
            0xE0, 0x01, // src port 57345
            0x00, 0x35, // dst port 53
            0x00, 0x1A, 0x00, 0x00, // len/checksum
        ];
        let dns: Vec<u8> = vec![
            0xAB, 0xCD, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
            0x07, b'e', b'x', b'a', b'm', b'p', b'l', b'e', 0x03, b'c', b'o', b'm', 0x00,
            0x00, 0x01, 0x00, 0x01,
        ];
        pkt.extend(ip);
        pkt.extend(udp);
        pkt.extend(dns);
        let ip_len = (pkt.len() - 14) as u16;
        pkt[16..18].copy_from_slice(&ip_len.to_be_bytes());
        pkt[38..40].copy_from_slice(&(ip_len - 20).to_be_bytes());

        let meta = parse_raw_packet(&pkt, "2026-08-08T18:25:00Z");
        assert_eq!(meta.protocol, "UDP");
        assert_eq!(meta.src_port, 57345);
        assert_eq!(meta.dst_port, 53);
        assert_eq!(meta.dns_qname.as_deref(), Some("example.com"));
        assert_eq!(meta.dns_qtype, "A");
        assert_eq!(meta.dns_rcode, 0);
        assert_eq!(meta.dns_answers, 0);
    }

    #[test]
    fn test_ipv6_address_is_complete() {
        let mut pkt = vec![0u8; 14 + 40];
        pkt[12] = 0x86;
        pkt[13] = 0xDD;
        pkt[14] = 0x60;
        pkt[14 + 6] = 58; // ICMPv6
        for i in 0..16 {
            pkt[14 + 8 + i] = i as u8;
            pkt[14 + 24 + i] = 0xF0 + (i as u8);
        }
        let meta = parse_raw_packet(&pkt, "2026-08-08T18:25:00Z");
        assert_eq!(meta.eth_type, "IPv6");
        assert_eq!(meta.protocol, "ICMPv6");
        assert_eq!(meta.src_port, 0);
        assert_eq!(meta.dst_port, 0);
        assert!(meta.src_ip.contains(':'));
        assert_ne!(meta.src_ip, "0001:0203:0405:0607");
    }

    #[test]
    fn test_icmp_does_not_invent_ports() {
        let mut pkt = vec![0u8; 14 + 20 + 8];
        pkt[12] = 0x08;
        pkt[13] = 0x00;
        pkt[14] = 0x45;
        pkt[23] = 1; // ICMP
        pkt[26] = 10;
        pkt[27] = 0;
        pkt[28] = 0;
        pkt[29] = 1;
        pkt[30] = 8;
        pkt[31] = 8;
        pkt[32] = 8;
        pkt[33] = 8;
        let meta = parse_raw_packet(&pkt, "2026-08-08T18:25:00Z");
        assert_eq!(meta.protocol, "ICMP");
        assert_eq!(meta.src_port, 0);
        assert_eq!(meta.dst_port, 0);
    }

    #[test]
    fn test_vlan_tagged_ipv4() {
        let mut pkt = vec![0u8; 18 + 20 + 8];
        pkt[12] = 0x81;
        pkt[13] = 0x00;
        pkt[16] = 0x08;
        pkt[17] = 0x00;
        pkt[18] = 0x45;
        pkt[20..22].copy_from_slice(&28u16.to_be_bytes());
        pkt[27] = 17; // UDP
        pkt[30] = 192;
        pkt[31] = 168;
        pkt[32] = 1;
        pkt[33] = 2;
        pkt[34] = 8;
        pkt[35] = 8;
        pkt[36] = 8;
        pkt[37] = 8;
        pkt[38] = 0xC0;
        pkt[39] = 0x00;
        pkt[40] = 0x00;
        pkt[41] = 0x35;
        pkt[42..44].copy_from_slice(&8u16.to_be_bytes());
        let meta = parse_raw_packet(&pkt, "2026-08-08T18:25:00Z");
        assert_eq!(meta.eth_type, "IPv4");
        assert_eq!(meta.protocol, "UDP");
        assert_eq!(meta.src_ip, "192.168.1.2");
        assert_eq!(meta.dst_port, 53);
    }

    #[test]
    fn test_arp_sender_extraction() {
        let mut pkt = vec![0u8; 14];
        pkt[12] = 0x08;
        pkt[13] = 0x06;
        let arp: Vec<u8> = vec![
            0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01, // htype ptype hlen plen op=1
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 192, 168, 1, 20, // sha + spa
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 192, 168, 1, 1, // tha + tpa
        ];
        pkt.extend(arp);
        let meta = parse_raw_packet(&pkt, "2026-08-08T18:25:00Z");
        assert_eq!(meta.protocol, "ARP_REQUEST");
        assert_eq!(meta.arp_sender_ip, "192.168.1.20");
        assert_eq!(meta.arp_sender_mac, "00:11:22:33:44:55");
    }
}

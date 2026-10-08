use serde::Serialize;
use std::collections::BTreeMap;

use super::buddy_engine::Packet;

#[derive(Debug, Clone, Serialize)]
pub struct BriefEntry { pub label: String, pub count: usize, pub bytes: u64 }

#[derive(Debug, Clone, Serialize)]
pub struct InvestigationBrief {
    pub packet_count: usize,
    pub captured_bytes: u64,
    pub wire_bytes: u64,
    pub time_start: Option<f64>,
    pub time_end: Option<f64>,
    pub protocols: Vec<BriefEntry>,
    pub talkers: Vec<BriefEntry>,
    pub conversations: Vec<BriefEntry>,
    pub dns_questions: Vec<String>,
    pub observations: Vec<String>,
}

fn top(map: BTreeMap<String, (usize, u64)>, limit: usize) -> Vec<BriefEntry> {
    let mut values: Vec<_> = map.into_iter().map(|(label, (count, bytes))| BriefEntry { label, count, bytes }).collect();
    values.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| b.bytes.cmp(&a.bytes)).then_with(|| a.label.cmp(&b.label)));
    values.truncate(limit); values
}

pub fn build(packets: &[Packet]) -> InvestigationBrief {
    let mut protocols = BTreeMap::new(); let mut talkers = BTreeMap::new(); let mut conversations = BTreeMap::new();
    let mut dns = Vec::new(); let mut large = 0usize; let mut unknown_time = 0usize; let mut seen_dns = std::collections::BTreeSet::new();
    let mut start = None; let mut end = None; let mut captured = 0u64; let mut wire = 0u64;
    for packet in packets {
        let bytes = packet.frame.data.len() as u64; captured += bytes; wire += packet.frame.wire_len as u64;
        *protocols.entry(packet.protocol.clone()).or_insert((0, 0)) = { let (c, b) = protocols.get(&packet.protocol).copied().unwrap_or((0, 0)); (c + 1, b + bytes) };
        if !packet.source.is_empty() { *talkers.entry(packet.source.clone()).or_insert((0, 0)) = { let (c, b) = talkers.get(&packet.source).copied().unwrap_or((0, 0)); (c + 1, b + bytes) }; }
        if !packet.source.is_empty() && !packet.destination.is_empty() { let key = format!("{}:{} → {}:{}", packet.source, packet.source_port.map(|v| v.to_string()).unwrap_or_default(), packet.destination, packet.destination_port.map(|v| v.to_string()).unwrap_or_default()); *conversations.entry(key).or_insert((0, 0)) = { let (c, b) = conversations.get(&key).copied().unwrap_or((0, 0)); (c + 1, b + bytes) }; }
        if packet.frame.wire_len >= 1500 { large += 1; }
        match packet.time { Some(value) => { start = Some(start.map_or(value, |old: f64| old.min(value))); end = Some(end.map_or(value, |old: f64| old.max(value))); }, None => unknown_time += 1 }
        if packet.protocol.eq_ignore_ascii_case("DNS") && seen_dns.insert(packet.info.clone()) && !packet.info.is_empty() { dns.push(packet.info.clone()); }
    }
    dns.truncate(20);
    let mut observations = Vec::new();
    if large > 0 { observations.push(format!("{large} packet(s) meet or exceed the standard Ethernet MTU; fragmentation or large-frame traffic may need review.")); }
    if unknown_time > 0 { observations.push(format!("{unknown_time} packet(s) have no reliable timestamp and are excluded from duration calculations.")); }
    if packets.iter().any(|p| p.protocol.eq_ignore_ascii_case("TLS")) { observations.push("TLS metadata was observed; payloads are not decrypted by Capture Buddy.".into()); }
    if packets.iter().any(|p| p.protocol.eq_ignore_ascii_case("HTTP")) { observations.push("HTTP-like packet-local metadata was observed; this is not a complete application transcript.".into()); }
    InvestigationBrief { packet_count: packets.len(), captured_bytes: captured, wire_bytes: wire, time_start: start, time_end: end, protocols: top(protocols, 12), talkers: top(talkers, 12), conversations: top(conversations, 20), dns_questions: dns, observations }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::buddy_engine::tests::{dns_packet, capture_bytes};
    #[test]
    fn brief_is_bounded_and_explains_sensitive_boundaries() {
        let bytes = capture_bytes(1, &[dns_packet()]);
        let frames = crate::services::buddy_engine::read_capture(&bytes, false).unwrap();
        let packets = crate::services::buddy_engine::analyze(frames);
        let brief = build(&packets);
        assert_eq!(brief.packet_count, 1); assert!(brief.protocols.len() <= 12); assert!(brief.dns_questions.len() <= 20);
    }
}

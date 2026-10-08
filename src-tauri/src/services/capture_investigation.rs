//! Bounded, deterministic investigation projections for Capture Buddy.
//! This module deliberately exports metadata only; packet bytes are never copied out.
use crate::services::buddy_engine::Packet;
use serde::Serialize;
use std::collections::BTreeMap;

pub const MAX_CONVERSATIONS: usize = 100;
pub const MAX_TIMELINE: usize = 500;
pub const MAX_ANOMALIES: usize = 100;

#[derive(Debug, Clone, Serialize)]
pub struct Conversation { pub id: String, pub source: String, pub destination: String, pub source_port: Option<u16>, pub destination_port: Option<u16>, pub protocol: String, pub packets: usize, pub bytes: u64, pub first_time: Option<f64>, pub last_time: Option<f64>, pub packet_numbers: Vec<u64> }
#[derive(Debug, Clone, Serialize)]
pub struct TimelineEvent { pub packet_number: u64, pub time: Option<f64>, pub kind: String, pub summary: String, pub severity: String }
#[derive(Debug, Clone, Serialize)]
pub struct Anomaly { pub id: String, pub kind: String, pub severity: String, pub confidence: String, pub summary: String, pub evidence_packets: Vec<u64>, pub reason: String }
#[derive(Debug, Clone, Serialize)]
pub struct InvestigationModel { pub conversations: Vec<Conversation>, pub timeline: Vec<TimelineEvent>, pub anomalies: Vec<Anomaly>, pub generated_from_packets: usize, pub limitations: Vec<String> }

fn endpoint(address: &str, port: Option<u16>) -> Option<String> {
    if address.is_empty() { None } else { Some(format!("{}:{}", address, port.map(|p| p.to_string()).unwrap_or_default())) }
}
fn group_key(p: &Packet) -> String {
    match (endpoint(&p.source, p.source_port), endpoint(&p.destination, p.destination_port)) {
        (Some(a), Some(b)) => if a <= b { format!("{a}|{b}") } else { format!("{b}|{a}") },
        _ => format!("packet:{}", p.frame.number),
    }
}
fn event_kind(p: &Packet) -> &'static str {
    let joined = format!("{} {} {}", p.protocol, p.layers.join(" "), p.info).to_ascii_uppercase();
    if joined.contains("DNS") { "DNS" }
    else if joined.contains("TLS") { "TLS" }
    else if joined.contains("HTTP") { "HTTP" }
    else if joined.contains("ERROR") || !p.details.is_empty() && p.info.to_ascii_lowercase().contains("incomplete") { "ERROR" }
    else if joined.contains("TCP") || joined.contains("UDP") || joined.contains("ARP") || joined.contains("ICMP") { "CONNECTION" }
    else { "OTHER" }
}
fn summary(p: &Packet, kind: &str) -> String {
    if kind == "ERROR" { return "Packet decoding reported an incomplete or unsupported condition".into(); }
    if kind == "CONNECTION" { return format!("Observed {} packet", p.protocol); }
    if kind == "OTHER" { return format!("Observed {} packet", p.protocol); }
    format!("Observed {kind} packet")
}
fn decode_warning(p: &Packet) -> bool {
    let text = format!("{} {}", p.info, p.details.join(" ")).to_ascii_lowercase();
    ["incomplete", "unsupported", "undecoded", "truncated", "not supported", "shorter than"].iter().any(|x| text.contains(x))
}

pub fn build(packets: &[Packet]) -> InvestigationModel {
    let mut grouped: BTreeMap<String, Conversation> = BTreeMap::new();
    for p in packets {
        let key = group_key(p);
        if let Some(c) = grouped.get_mut(&key) {
            c.packets += 1; c.bytes += p.frame.wire_len as u64;
            c.first_time = match (c.first_time, p.time) { (Some(a), Some(b)) => Some(a.min(b)), (None, x) => x, (x, None) => x };
            c.last_time = match (c.last_time, p.time) { (Some(a), Some(b)) => Some(a.max(b)), (None, x) => x, (x, None) => x };
            if c.packet_numbers.len() < MAX_TIMELINE { c.packet_numbers.push(p.frame.number); }
            if c.protocol != p.protocol { c.protocol = "MULTIPLE".into(); }
        } else {
            grouped.insert(key, Conversation { id: format!("conversation-{}", grouped.len() + 1), source: p.source.clone(), destination: p.destination.clone(), source_port: p.source_port, destination_port: p.destination_port, protocol: p.protocol.clone(), packets: 1, bytes: p.frame.wire_len as u64, first_time: p.time, last_time: p.time, packet_numbers: vec![p.frame.number] });
        }
    }
    let mut conversations: Vec<_> = grouped.into_values().take(MAX_CONVERSATIONS).collect();
    conversations.sort_by(|a,b| a.id.cmp(&b.id));

    let mut timeline = Vec::new();
    let mut anomalies = Vec::new();
    for p in packets.iter().take(MAX_TIMELINE) {
        let kind = event_kind(p);
        timeline.push(TimelineEvent { packet_number: p.frame.number, time: p.time, kind: kind.into(), summary: summary(p, kind), severity: if kind == "ERROR" { "LOW".into() } else { "INFO".into() } });
    }
    for p in packets {
        let mut add = |kind: &str, severity: &str, confidence: &str, text: &str, reason: &str| {
            if anomalies.len() < MAX_ANOMALIES { let n = anomalies.len() + 1; anomalies.push(Anomaly { id: format!("anomaly-{n}"), kind: kind.into(), severity: severity.into(), confidence: confidence.into(), summary: text.into(), evidence_packets: vec![p.frame.number], reason: reason.into() }); }
        };
        if p.frame.wire_len >= 1500 { add("LARGE_FRAME", "LOW", "observed", "Large captured frame", "Reported wire length is at least 1500 bytes."); }
        if p.time.is_none() { add("MISSING_TIMESTAMP", "LOW", "observed", "Packet has no timestamp", "The capture record did not provide a timestamp."); }
        if decode_warning(p) { add("DECODE_WARNING", "LOW", "observed", "Packet decode warning", "Decoder metadata indicates incomplete, truncated, or unsupported decoding."); }
        if !p.payload.is_empty() && p.protocol == "TCP" { add("TCP_PAYLOAD", "INFO", "observed", "TCP packet carries payload", "Decoded TCP payload is non-empty; contents are intentionally not exported."); }
    }
    InvestigationModel { conversations, timeline, anomalies, generated_from_packets: packets.len(), limitations: vec!["Metadata only; raw payloads and decrypted content are not exported.".into(), "Results are limited to packets decoded by the native Capture Buddy engine.".into(), "Conversation grouping is endpoint-based and may merge reused tuples.".into()] }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::buddy_engine::{analyze, read_capture, tests::{capture_bytes, dns_packet, tcp_packet}};
    #[test] fn groups_events_and_explainable_anomalies() {
        let ps = analyze(read_capture(&capture_bytes(1, &[dns_packet(), tcp_packet(1, 16, b"x")]), false).unwrap());
        let model = build(&ps);
        assert_eq!(model.generated_from_packets, 2); assert!(!model.conversations.is_empty());
        assert!(model.timeline.iter().any(|e| e.kind == "DNS")); assert!(model.anomalies.iter().any(|a| a.kind == "TCP_PAYLOAD"));
    }
    #[test] fn bounds_and_empty_are_safe() {
        let empty = build(&[]); assert!(empty.conversations.is_empty()); assert_eq!(empty.generated_from_packets, 0);
        let mut ps = Vec::new(); for i in 0..600 { let mut p = analyze(vec![crate::services::buddy_engine::Frame { number: i + 1, timestamp: None, link: 999, wire_len: 1500, data: vec![] }]); ps.extend(p); }
        let model = build(&ps); assert!(model.timeline.len() <= MAX_TIMELINE); assert!(model.anomalies.len() <= MAX_ANOMALIES); assert!(model.conversations.len() <= MAX_CONVERSATIONS);
    }
}

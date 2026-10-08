use crate::database::duckdb::persist_flow_records;
use crate::models::{FlowRecord, FlowSummaryStats, PacketMetadata};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// TCP connection state ladder (per flow, monotonic)
const STATE_NEW: u8 = 0;
const STATE_SYN_SENT: u8 = 1;
const STATE_SYN_RCVD: u8 = 2;
const STATE_ESTABLISHED: u8 = 3;
const STATE_CLOSED: u8 = 4;
const STATE_RESET: u8 = 5;

#[derive(Clone)]
struct FlowInternal {
    state: u8,
    syn_ts_ms: Option<u64>,
    rtt_ms: u64,
}

fn state_name(state: u8) -> &'static str {
    match state {
        STATE_SYN_SENT => "SYN_SENT",
        STATE_SYN_RCVD => "SYN_RCVD",
        STATE_ESTABLISHED => "ESTABLISHED",
        STATE_CLOSED => "CLOSED",
        STATE_RESET => "RESET",
        _ => "NEW",
    }
}

pub struct FlowEngine {
    flows: Arc<Mutex<HashMap<String, FlowRecord>>>,
    internal: Arc<Mutex<HashMap<String, FlowInternal>>>,
    retry_buffer: Arc<Mutex<VecDeque<FlowRecord>>>,
    total_processed: Arc<AtomicU64>,
    persistence_failures: Arc<AtomicU64>,
}

impl FlowEngine {
    pub fn new() -> Self {
        Self {
            flows: Arc::new(Mutex::new(HashMap::with_capacity(1000))),
            internal: Arc::new(Mutex::new(HashMap::with_capacity(1000))),
            retry_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(200))),
            total_processed: Arc::new(AtomicU64::new(0)),
            persistence_failures: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Computes canonical 5-tuple flow key and direction
    fn compute_flow_key(packet: &PacketMetadata) -> (String, bool) {
        let (ip_a, port_a, ip_b, port_b) = (
            &packet.src_ip,
            packet.src_port,
            &packet.dst_ip,
            packet.dst_port,
        );

        let endpoint_a = format!("{}:{}", ip_a, port_a);
        let endpoint_b = format!("{}:{}", ip_b, port_b);

        if endpoint_a <= endpoint_b {
            (
                format!("{}-{}-{}", endpoint_a, endpoint_b, packet.protocol),
                true,
            )
        } else {
            (
                format!("{}-{}-{}", endpoint_b, endpoint_a, packet.protocol),
                false,
            )
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    /// Ingests a raw PacketMetadata into the flow aggregation table and returns the active flow record.
    pub fn ingest_packet(&self, packet: &PacketMetadata) -> FlowRecord {
        let (flow_key, is_forward) = Self::compute_flow_key(packet);
        let now_ms = Self::now_ms();

        let mut queue = self.flows.lock().unwrap();
        self.total_processed.fetch_add(1, Ordering::Relaxed);

        // TCP state + RTT bookkeeping
        let mut internal = self.internal.lock().unwrap();
        let entry = internal.entry(flow_key.clone()).or_insert(FlowInternal {
            state: STATE_NEW,
            syn_ts_ms: None,
            rtt_ms: 0,
        });

        let mut flags_seen_tcp = false;
        if packet.protocol == "TCP" {
            flags_seen_tcp = true;
            let flags = packet.tcp_flags;
            let syn = flags & 0x02 != 0;
            let ack = flags & 0x10 != 0;
            let fin = flags & 0x01 != 0;
            let rst = flags & 0x04 != 0;

            if rst {
                entry.state = entry.state.max(STATE_RESET);
            } else if fin {
                entry.state = entry.state.max(STATE_CLOSED);
            } else if syn && ack {
                entry.state = entry.state.max(STATE_SYN_RCVD);
                if let Some(syn_ts) = entry.syn_ts_ms {
                    if entry.rtt_ms == 0 && now_ms >= syn_ts {
                        entry.rtt_ms = now_ms - syn_ts;
                    }
                }
            } else if syn {
                entry.state = entry.state.max(STATE_SYN_SENT);
                if entry.syn_ts_ms.is_none() {
                    entry.syn_ts_ms = Some(now_ms);
                }
            } else if ack {
                entry.state = entry.state.max(STATE_ESTABLISHED);
            }
        }

        let tcp_state = if flags_seen_tcp {
            state_name(entry.state).to_string()
        } else if packet.protocol == "UDP" {
            "UDP_ACTIVE".to_string()
        } else if packet.protocol == "ICMP" {
            "ECHO_ACTIVE".to_string()
        } else {
            "ACTIVE".to_string()
        };
        // End the entry borrow before bounded eviction mutates this map.
        let rtt_ms = entry.rtt_ms;

        if let Some(existing) = queue.get_mut(&flow_key) {
            existing.packet_count += 1;
            existing.total_bytes += packet.captured_len as u64;
            if is_forward {
                existing.client_bytes += packet.captured_len as u64;
            } else {
                existing.server_bytes += packet.captured_len as u64;
            }
            existing.ts_end = now_ms;
            existing.duration_ms = existing.ts_end.saturating_sub(existing.ts_start);
            existing.tcp_state = tcp_state.clone();
            if rtt_ms > 0 {
                existing.rtt_ms = rtt_ms;
            }
            if existing.dns_qname.is_none() {
                existing.dns_qname = packet.dns_qname.clone();
            }
            return existing.clone();
        }

        // Enforce bounded memory (max 1000 active flows)
        if queue.len() >= 1000 {
            let oldest_key = queue
                .iter()
                .min_by_key(|(_, f)| f.ts_end)
                .map(|(k, _)| k.clone());
            if let Some(oldest_key) = oldest_key {
                internal.remove(&oldest_key);
                if let Some(evicted_flow) = queue.remove(&oldest_key) {
                    if let Err(err) = persist_flow_records(&[evicted_flow.clone()]) {
                        tracing::warn!("Evicted flow persistence failed: {}", err);
                        self.persistence_failures.fetch_add(1, Ordering::Relaxed);
                        let mut retries = self.retry_buffer.lock().unwrap();
                        if retries.len() >= 200 {
                            retries.pop_front();
                        }
                        retries.push_back(evicted_flow);
                    }
                }
            }
        }

        let flow_id = format!("flw_{:x}", md5_hash(&flow_key));
        let ip_ver = if packet.eth_type == "IPv6" { 6 } else { 4 };

        let record = FlowRecord {
            flow_id,
            src_ip: packet.src_ip.clone(),
            dst_ip: packet.dst_ip.clone(),
            src_port: packet.src_port,
            dst_port: packet.dst_port,
            protocol: packet.protocol.clone(),
            ip_version: ip_ver,
            client_bytes: if is_forward { packet.captured_len as u64 } else { 0 },
            server_bytes: if !is_forward { packet.captured_len as u64 } else { 0 },
            total_bytes: packet.captured_len as u64,
            packet_count: 1,
            tcp_state,
            ja4: "".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: now_ms,
            ts_end: now_ms,
            duration_ms: 0,
            rtt_ms,
            dns_qname: packet.dns_qname.clone(),
        };

        queue.insert(flow_key, record.clone());
        record
    }

    /// Attaches a JA4 fingerprint to an active flow by flow ID.
    pub fn attach_ja4_to_flow(&self, flow_id: &str, ja4: String) -> Option<FlowRecord> {
        let mut queue = self.flows.lock().unwrap();
        for record in queue.values_mut() {
            if record.flow_id == flow_id {
                if record.ja4.is_empty() {
                    record.ja4 = ja4.clone();
                }
                return Some(record.clone());
            }
        }
        None
    }

    pub fn get_active_flows(&self, limit: usize) -> Vec<FlowRecord> {
        let queue = self.flows.lock().unwrap();
        let limit = limit.min(1000);
        queue.values().take(limit).cloned().collect()
    }

    /// Returns active flows sorted by recency (most recently updated first).
    pub fn get_recent_flows(&self, limit: usize) -> Vec<FlowRecord> {
        let queue = self.flows.lock().unwrap();
        let mut v: Vec<FlowRecord> = queue.values().cloned().collect();
        v.sort_by(|a, b| b.ts_end.cmp(&a.ts_end));
        v.truncate(limit.min(500));
        v
    }

    pub fn get_summary_stats(&self) -> FlowSummaryStats {
        let queue = self.flows.lock().unwrap();
        let retries = self.retry_buffer.lock().unwrap();
        let active_count = queue.len();
        let total_proc = self.total_processed.load(Ordering::Relaxed);
        let failures = self.persistence_failures.load(Ordering::Relaxed);

        let mut tcp_cnt = 0;
        let mut udp_cnt = 0;
        let mut other_cnt = 0;
        let mut total_vol = 0;
        let mut rtt_sum: u64 = 0;
        let mut rtt_samples: u64 = 0;

        for flw in queue.values() {
            total_vol += flw.total_bytes;
            match flw.protocol.as_str() {
                "TCP" => tcp_cnt += 1,
                "UDP" => udp_cnt += 1,
                _ => other_cnt += 1,
            }
            if flw.rtt_ms > 0 && rtt_samples < 200 {
                rtt_sum += flw.rtt_ms;
                rtt_samples += 1;
            }
        }

        FlowSummaryStats {
            active_flows_count: active_count,
            total_flows_processed: total_proc,
            tcp_flows_count: tcp_cnt,
            udp_flows_count: udp_cnt,
            other_flows_count: other_cnt,
            total_volume_bytes: total_vol,
            persistence_failures: failures,
            retry_queue_count: retries.len(),
            avg_rtt_ms: if rtt_samples > 0 {
                rtt_sum as f64 / rtt_samples as f64
            } else {
                0.0
            },
        }
    }

    /// Snapshot cumulative live records without resetting counters, TCP state or JA4.
    /// Active snapshots supersede older failed writes of the same flow.
    pub fn flush_flows(&self) -> Vec<FlowRecord> {
        let queue = self.flows.lock().unwrap();
        let mut retries = self.retry_buffer.lock().unwrap();

        let mut records: HashMap<String, FlowRecord> = retries.drain(..)
            .map(|record| (record.flow_id.clone(), record)).collect();
        records.extend(queue.values().cloned().map(|record| (record.flow_id.clone(), record)));
        records.into_values().collect()
    }

    /// Re-queues a failed persistence batch into the retry buffer.
    pub fn reinsert_retry(&self, records: Vec<FlowRecord>) {
        self.persistence_failures.fetch_add(1, Ordering::Relaxed);
        let queue = self.flows.lock().unwrap();
        let mut retries = self.retry_buffer.lock().unwrap();
        for r in records {
            // Live records are already retained for the next snapshot.
            if queue.values().any(|live| live.flow_id == r.flow_id) {
                continue;
            }
            retries.retain(|old| old.flow_id != r.flow_id);
            if retries.len() >= 500 {
                retries.pop_front();
            }
            retries.push_back(r);
        }
    }
}

fn md5_hash(input: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in input.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(byte as u64);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pkt(src_ip: &str, src_port: u16, dst_ip: &str, dst_port: u16, proto: &str) -> PacketMetadata {
        PacketMetadata {
            timestamp: "2026-08-08T18:41:00Z".to_string(),
            captured_len: 64,
            orig_len: 64,
            eth_type: "IPv4".to_string(),
            src_mac: "00:11:22:33:44:55".to_string(),
            dst_mac: "52:54:00:12:34:56".to_string(),
            src_ip: src_ip.to_string(),
            dst_ip: dst_ip.to_string(),
            protocol: proto.to_string(),
            src_port,
            dst_port,
            tcp_flags: 0,
            arp_sender_ip: "".to_string(),
            arp_sender_mac: "00:00:00:00:00:00".to_string(),
            dns_qname: None,
            dns_qtype: "".to_string(),
            dns_rcode: -1,
            dns_answers: 0,
        }
    }

    #[test]
    fn persistence_snapshot_preserves_counters_state_and_ja4() {
        let engine = FlowEngine::new();
        let mut packet = pkt("10.0.0.1", 1234, "10.0.0.2", 443, "TCP");
        packet.tcp_flags = 0x02;
        let first = engine.ingest_packet(&packet);
        engine.attach_ja4_to_flow(&first.flow_id, "test-ja4".into());
        let snapshot = engine.flush_flows();
        assert_eq!(engine.get_active_flows(10).len(), 1);
        engine.reinsert_retry(snapshot);
        packet.tcp_flags = 0x10;
        let second = engine.ingest_packet(&packet);
        assert_eq!(second.packet_count, 2);
        assert_eq!(second.total_bytes, 128);
        assert_eq!(second.tcp_state, "ESTABLISHED");
        assert_eq!(second.ja4, "test-ja4");
        let snapshot = engine.flush_flows();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].packet_count, 2);
        assert_eq!(engine.internal.lock().unwrap().len(), 1);
        assert_eq!(engine.get_summary_stats().retry_queue_count, 0);
    }

    #[test]
    fn repeated_snapshots_keep_internal_and_live_tables_in_sync() {
        let engine = FlowEngine::new();
        for port in 1..=1000 {
            engine.ingest_packet(&pkt("10.0.0.1", port, "10.0.0.2", 443, "TCP"));
            if port % 100 == 0 {
                engine.flush_flows();
                assert_eq!(engine.internal.lock().unwrap().len(), engine.flows.lock().unwrap().len());
            }
        }
        assert_eq!(engine.internal.lock().unwrap().len(), 1000);
    }

    #[test]
    fn test_flow_engine_ingestion_and_eviction() {
        let engine = FlowEngine::new();
        engine.ingest_packet(&pkt("192.168.1.100", 50000, "1.1.1.1", 443, "TCP"));
        let flows = engine.get_active_flows(10);
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].src_ip, "192.168.1.100");
        assert_eq!(flows[0].dst_ip, "1.1.1.1");

        let stats = engine.get_summary_stats();
        assert_eq!(stats.active_flows_count, 1);
        assert_eq!(stats.persistence_failures, 0);
    }

    #[test]
    fn test_tcp_state_and_rtt_tracking() {
        let engine = FlowEngine::new();
        // SYN
        let mut syn = pkt("192.168.1.100", 50000, "1.1.1.1", 443, "TCP");
        syn.tcp_flags = 0x02;
        engine.ingest_packet(&syn);
        let f = engine.get_active_flows(10).remove(0);
        assert_eq!(f.tcp_state, "SYN_SENT");

        // let RTT clock advance past the same-millisecond boundary
        std::thread::sleep(std::time::Duration::from_millis(2));

        // SYN-ACK (reverse direction, same flow key)
        let mut syn_ack = pkt("1.1.1.1", 443, "192.168.1.100", 50000, "TCP");
        syn_ack.tcp_flags = 0x12;
        engine.ingest_packet(&syn_ack);
        let f = engine.get_active_flows(10).remove(0);
        assert_eq!(f.tcp_state, "SYN_RCVD");
        assert!(f.rtt_ms > 0);

        // ACK → ESTABLISHED
        let mut ack = pkt("192.168.1.100", 50000, "1.1.1.1", 443, "TCP");
        ack.tcp_flags = 0x10;
        engine.ingest_packet(&ack);
        let f = engine.get_active_flows(10).remove(0);
        assert_eq!(f.tcp_state, "ESTABLISHED");
    }

    #[test]
    fn test_dns_qname_attach() {
        let engine = FlowEngine::new();
        let mut d = pkt("192.168.1.100", 57345, "8.8.8.8", 53, "UDP");
        d.dns_qname = Some("example.com".to_string());
        d.dns_qtype = "A".to_string();
        engine.ingest_packet(&d);
        let f = engine.get_active_flows(10).remove(0);
        assert_eq!(f.dns_qname.as_deref(), Some("example.com"));
    }
}

use crate::models::{
    DetectionFinding, DetectionRule, DetectionSummary, FindingEvidenceDetail, FlowRecord,
    RuleCondition, RuleConditionGroup,
};
use crate::services::rule_evaluator::{evaluate_group, RuleEvaluationContext};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const WINDOW: Duration = Duration::from_secs(30);
const MAX_SOURCES: usize = 256;
const MAX_WINDOW_ITEMS: usize = 256;

struct SourceWindow {
    last_seen: Instant,
    ports: HashMap<u16, Instant>,
    hosts: HashMap<String, Instant>,
    flows: HashMap<String, Instant>,
}

fn observe<K: std::hash::Hash + Eq + Clone>(map: &mut HashMap<K, Instant>, key: K, now: Instant) {
    map.retain(|_, time| now.saturating_duration_since(*time) < WINDOW);
    if !map.contains_key(&key) && map.len() >= MAX_WINDOW_ITEMS {
        let oldest = map.iter().min_by_key(|(_, time)| **time).map(|(key, _)| key.clone()).unwrap();
        map.remove(&oldest);
    }
    map.insert(key, now);
}

pub struct DetectionEngine {
    rules: Arc<Mutex<Vec<DetectionRule>>>,
    findings: Arc<Mutex<HashMap<String, DetectionFinding>>>,
    windows: Mutex<HashMap<String, SourceWindow>>,
    total_findings: Arc<AtomicU64>,
    critical_cnt: Arc<AtomicU64>,
    high_cnt: Arc<AtomicU64>,
    med_cnt: Arc<AtomicU64>,
    low_cnt: Arc<AtomicU64>,
    info_cnt: Arc<AtomicU64>,
}

impl DetectionEngine {
    pub fn new() -> Self {
        let initial_rules = vec![
            DetectionRule {
                rule_id: "RULE-001".to_string(),
                name: "Port Scanning Activity Observed".to_string(),
                description: "Detects single source IP contacting unusually high number of unique destination ports within a short time window".to_string(),
                category: "RECONNAISSANCE".to_string(),
                severity: "MEDIUM".to_string(),
                confidence: 85,
                enabled: true,
                rule_version: "1.1.0".to_string(),
                condition_group: RuleConditionGroup {
                    logic: "AND".to_string(),
                    conditions: vec![
                        RuleCondition {
                            field: "unique_dst_ports".to_string(),
                            operator: "GREATER_THAN".to_string(),
                            value: "15".to_string(),
                        },
                        RuleCondition {
                            field: "protocol".to_string(),
                            operator: "EQUALS".to_string(),
                            value: "TCP".to_string(),
                        },
                    ],
                },
            },
            DetectionRule {
                rule_id: "RULE-002".to_string(),
                name: "Host Discovery Activity Observed".to_string(),
                description: "Detects single source IP contacting unusually high number of unique destination hosts within a short time window".to_string(),
                category: "RECONNAISSANCE".to_string(),
                severity: "MEDIUM".to_string(),
                confidence: 85,
                enabled: true,
                rule_version: "1.1.0".to_string(),
                condition_group: RuleConditionGroup {
                    logic: "AND".to_string(),
                    conditions: vec![
                        RuleCondition {
                            field: "unique_dst_hosts".to_string(),
                            operator: "GREATER_THAN".to_string(),
                            value: "15".to_string(),
                        },
                    ],
                },
            },
            DetectionRule {
                rule_id: "RULE-003".to_string(),
                name: "Suspicious SMB Activity Observed".to_string(),
                description: "Detects elevated SMB2/TCP session activity on port 445 requiring further investigation".to_string(),
                category: "LATERAL_MOVEMENT".to_string(),
                severity: "LOW".to_string(),
                confidence: 75,
                enabled: true,
                rule_version: "1.1.0".to_string(),
                condition_group: RuleConditionGroup {
                    logic: "AND".to_string(),
                    conditions: vec![
                        RuleCondition {
                            field: "destination_port".to_string(),
                            operator: "EQUALS".to_string(),
                            value: "445".to_string(),
                        },
                        RuleCondition {
                            field: "packet_count".to_string(),
                            operator: "GREATER_THAN".to_string(),
                            value: "20".to_string(),
                        },
                    ],
                },
            },
            DetectionRule {
                rule_id: "RULE-004".to_string(),
                name: "Configured Suspicious JA4 Fingerprint Match".to_string(),
                description: "Detects TLS ClientHello matching configured suspicious JA4 fingerprint in threat intelligence feed".to_string(),
                category: "C2_INFRASTRUCTURE".to_string(),
                severity: "HIGH".to_string(),
                confidence: 90,
                enabled: true,
                rule_version: "1.1.0".to_string(),
                condition_group: RuleConditionGroup {
                    logic: "AND".to_string(),
                    conditions: vec![
                        RuleCondition {
                            field: "ja4".to_string(),
                            operator: "CONTAINS".to_string(),
                            value: "8daaf6152771".to_string(),
                        },
                    ],
                },
            },
        ];

        Self {
            rules: Arc::new(Mutex::new(initial_rules)),
            findings: Arc::new(Mutex::new(HashMap::with_capacity(500))),
            windows: Mutex::new(HashMap::new()),
            total_findings: Arc::new(AtomicU64::new(0)),
            critical_cnt: Arc::new(AtomicU64::new(0)),
            high_cnt: Arc::new(AtomicU64::new(0)),
            med_cnt: Arc::new(AtomicU64::new(0)),
            low_cnt: Arc::new(AtomicU64::new(0)),
            info_cnt: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Evaluates all active rules against a FlowRecord using sliding window tracking
    pub fn evaluate_flow(&self, flow: &FlowRecord) -> Vec<DetectionFinding> {
        self.evaluate_flow_at(flow, Instant::now())
    }

    pub fn reset_window(&self) {
        self.windows.lock().unwrap().clear();
    }

    fn evaluate_flow_at(&self, flow: &FlowRecord, now: Instant) -> Vec<DetectionFinding> {
        let (unique_dst_ports, unique_dst_hosts, flow_count) = {
            let mut windows = self.windows.lock().unwrap();
            windows.retain(|_, window| now.saturating_duration_since(window.last_seen) < WINDOW);
            if !windows.contains_key(&flow.src_ip) && windows.len() >= MAX_SOURCES {
                let oldest = windows.iter().min_by_key(|(_, window)| window.last_seen)
                    .map(|(key, _)| key.clone()).unwrap();
                windows.remove(&oldest);
            }
            let window = windows.entry(flow.src_ip.clone()).or_insert_with(|| SourceWindow {
                last_seen: now, ports: HashMap::new(), hosts: HashMap::new(), flows: HashMap::new(),
            });
            window.last_seen = now;
            observe(&mut window.ports, flow.dst_port, now);
            observe(&mut window.hosts, flow.dst_ip.clone(), now);
            observe(&mut window.flows, flow.flow_id.clone(), now);
            (window.ports.len(), window.hosts.len(), window.flows.len() as u64)
        };

        let ctx = RuleEvaluationContext {
            flow,
            unique_dst_ports,
            unique_dst_hosts,
            flow_count,
        };

        let active_rules = self.rules.lock().unwrap().clone();
        let mut matched_findings = Vec::new();

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        for rule in active_rules {
            if !rule.enabled {
                continue;
            }

            if evaluate_group(&rule.condition_group, &ctx) {
                // Granular correlation key: rule_id + source_ip + destination_ip
                let correlation_key = if rule.rule_id == "RULE-004" && !flow.ja4.is_empty() {
                    format!("{}-{}-{}", rule.rule_id, flow.src_ip, flow.ja4)
                } else {
                    format!("{}-{}-{}", rule.rule_id, flow.src_ip, flow.dst_ip)
                };

                let mut map = self.findings.lock().unwrap();

                let evidence_detail = FindingEvidenceDetail {
                    observation_count: 1,
                    unique_dst_hosts_count: unique_dst_hosts,
                    unique_dst_ports_count: unique_dst_ports,
                    time_window_secs: 30,
                    packet_count: flow.packet_count,
                    byte_count: flow.total_bytes,
                    flow_count,
                    ja4: if flow.ja4.is_empty() { None } else { Some(flow.ja4.clone()) },
                };

                if let Some(existing) = map.get_mut(&correlation_key) {
                    existing.last_seen = now_ms;
                    existing.occurrence_count += 1;
                    existing.confidence = (existing.confidence + 1).min(100);
                    existing.evidence_detail.observation_count = existing.occurrence_count;
                    existing.evidence_detail.unique_dst_hosts_count = unique_dst_hosts;
                    existing.evidence_detail.unique_dst_ports_count = unique_dst_ports;

                    existing.evidence = match rule.rule_id.as_str() {
                        "RULE-001" => format!(
                            "Source {} contacted {} unique destination ports within 30s window. Triggered {} times.",
                            flow.src_ip, unique_dst_ports, existing.occurrence_count
                        ),
                        "RULE-002" => format!(
                            "Source {} contacted {} unique destination hosts within 30s window. Triggered {} times.",
                            flow.src_ip, unique_dst_hosts, existing.occurrence_count
                        ),
                        "RULE-003" => format!(
                            "Source {} initiated {} SMB session(s) to {}:445.",
                            flow.src_ip, existing.occurrence_count, flow.dst_ip
                        ),
                        "RULE-004" => format!(
                            "TLS ClientHello JA4 fingerprint {} matched configured threat intelligence feed. Triggered {} times.",
                            flow.ja4, existing.occurrence_count
                        ),
                        _ => format!("Rule {} triggered {} times for source {}.", rule.rule_id, existing.occurrence_count, flow.src_ip),
                    };

                    matched_findings.push(existing.clone());
                } else {
                    self.total_findings.fetch_add(1, Ordering::Relaxed);
                    match rule.severity.as_str() {
                        "CRITICAL" => { self.critical_cnt.fetch_add(1, Ordering::Relaxed); }
                        "HIGH" => { self.high_cnt.fetch_add(1, Ordering::Relaxed); }
                        "MEDIUM" => { self.med_cnt.fetch_add(1, Ordering::Relaxed); }
                        "LOW" => { self.low_cnt.fetch_add(1, Ordering::Relaxed); }
                        _ => { self.info_cnt.fetch_add(1, Ordering::Relaxed); }
                    };

                    let finding_id = format!("find_{:x}", md5_hash(&correlation_key));

                    let evidence_text = match rule.rule_id.as_str() {
                        "RULE-001" => format!(
                            "Source {} contacted {} unique destination ports within 30s window.",
                            flow.src_ip, unique_dst_ports
                        ),
                        "RULE-002" => format!(
                            "Source {} contacted {} unique destination hosts within 30s window.",
                            flow.src_ip, unique_dst_hosts
                        ),
                        "RULE-003" => format!(
                            "Source {} initiated SMB session to {}:445 with {} packets.",
                            flow.src_ip, flow.dst_ip, flow.packet_count
                        ),
                        "RULE-004" => format!(
                            "TLS ClientHello JA4 fingerprint {} matched configured threat intelligence feed.",
                            flow.ja4
                        ),
                        _ => format!("Rule {} matched for source {}.", rule.rule_id, flow.src_ip),
                    };

                    let finding = DetectionFinding {
                        finding_id,
                        rule_id: rule.rule_id.clone(),
                        rule_version: rule.rule_version.clone(),
                        timestamp: now_ms,
                        first_seen: now_ms,
                        last_seen: now_ms,
                        source_ip: flow.src_ip.clone(),
                        destination_ip: flow.dst_ip.clone(),
                        source_port: flow.src_port,
                        destination_port: flow.dst_port,
                        protocol: flow.protocol.clone(),
                        flow_id: flow.flow_id.clone(),
                        ja4: flow.ja4.clone(),
                        category: rule.category.clone(),
                        severity: rule.severity.clone(),
                        confidence: rule.confidence,
                        title: rule.name.clone(),
                        description: rule.description.clone(),
                        evidence: evidence_text,
                        evidence_detail,
                        status: "ACTIVE".to_string(),
                        occurrence_count: 1,
                    };

                    if map.len() >= 500 {
                        if let Some(k) = map.keys().next().cloned() {
                            map.remove(&k);
                        }
                    }
                    map.insert(correlation_key, finding.clone());
                    matched_findings.push(finding);
                }
            }
        }

        matched_findings
    }

    pub fn get_findings(&self, limit: usize) -> Vec<DetectionFinding> {
        let map = self.findings.lock().unwrap();
        let limit = limit.min(500);
        map.values().take(limit).cloned().collect()
    }

    pub fn get_summary(&self) -> DetectionSummary {
        let map = self.findings.lock().unwrap();
        let active_cnt = map.values().filter(|f| f.status == "ACTIVE").count() as u64;
        let res_cnt = map.values().filter(|f| f.status == "RESOLVED").count() as u64;

        DetectionSummary {
            total_findings_count: self.total_findings.load(Ordering::Relaxed),
            critical_count: self.critical_cnt.load(Ordering::Relaxed),
            high_count: self.high_cnt.load(Ordering::Relaxed),
            medium_count: self.med_cnt.load(Ordering::Relaxed),
            low_count: self.low_cnt.load(Ordering::Relaxed),
            info_count: self.info_cnt.load(Ordering::Relaxed),
            active_count: active_cnt,
            resolved_count: res_cnt,
        }
    }

    pub fn list_rules(&self) -> Vec<DetectionRule> {
        self.rules.lock().unwrap().clone()
    }

    pub fn toggle_rule(&self, rule_id: &str, enabled: bool) -> bool {
        let mut rules = self.rules.lock().unwrap();
        if let Some(r) = rules.iter_mut().find(|r| r.rule_id == rule_id) {
            r.enabled = enabled;
            true
        } else {
            false
        }
    }

    pub fn update_finding_status(&self, finding_id: &str, new_status: &str) -> bool {
        let mut map = self.findings.lock().unwrap();
        if let Some(f) = map.values_mut().find(|f| f.finding_id == finding_id) {
            f.status = new_status.to_string();
            true
        } else {
            false
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

    #[test]
    fn observation_window_expires_individual_destinations_and_bounds_memory() {
        let engine = DetectionEngine::new();
        let start = Instant::now();
        for port in 1..=15 {
            engine.evaluate_flow_at(&base_flow("192.0.2.1", "198.51.100.1", port, 1, 64), start);
        }
        let flow = base_flow("192.0.2.1", "198.51.100.2", 16, 1, 64);
        assert!(engine.evaluate_flow_at(&flow, start + Duration::from_secs(29)).iter().any(|f| f.rule_id == "RULE-001"));
        assert!(!engine.evaluate_flow_at(&flow, start + WINDOW).iter().any(|f| f.rule_id == "RULE-001"));
        {
            let windows = engine.windows.lock().unwrap();
            let window = &windows["192.0.2.1"];
            assert_eq!(window.ports.len(), 1);
            assert_eq!(window.hosts.len(), 1);
            assert_eq!(window.flows.len(), 1);
        }
        for n in 0..(MAX_WINDOW_ITEMS + 50) {
            engine.evaluate_flow_at(&base_flow("192.0.2.1", &format!("198.51.100.{n}"), n as u16, 1, 64), start + WINDOW);
        }
        {
            let windows = engine.windows.lock().unwrap();
            let window = &windows["192.0.2.1"];
            assert!(window.ports.len() <= MAX_WINDOW_ITEMS);
            assert!(window.hosts.len() <= MAX_WINDOW_ITEMS);
            assert!(window.flows.len() <= MAX_WINDOW_ITEMS);
        }
        for n in 0..(MAX_SOURCES + 50) {
            engine.evaluate_flow_at(&base_flow(&format!("192.0.2.{n}"), "198.51.100.1", 80, 1, 64), start + WINDOW);
        }
        assert_eq!(engine.windows.lock().unwrap().len(), MAX_SOURCES);
        engine.evaluate_flow_at(&flow, start + WINDOW * 2);
        assert_eq!(engine.windows.lock().unwrap().len(), 1);
        engine.reset_window();
        assert!(engine.windows.lock().unwrap().is_empty());
    }

    fn base_flow(src_ip: &str, dst_ip: &str, dst_port: u16, pkts: u64, bytes: u64) -> FlowRecord {
        FlowRecord {
            flow_id: format!("flw_{}_{}", src_ip, dst_port),
            src_ip: src_ip.to_string(),
            dst_ip: dst_ip.to_string(),
            src_port: 50000,
            dst_port,
            protocol: "TCP".to_string(),
            ip_version: 4,
            client_bytes: bytes,
            server_bytes: 0,
            total_bytes: bytes,
            packet_count: pkts,
            tcp_state: "ESTABLISHED".to_string(),
            ja4: "".to_string(),
            threat_score: 0,
            severity: "INFO".to_string(),
            ts_start: 1000,
            ts_end: 2000,
            duration_ms: 1000,
            rtt_ms: 0,
            dns_qname: None,
        }
    }

    #[test]
    fn test_port_scan_positive_and_negative() {
        let engine = DetectionEngine::new();
        let src = "192.168.1.100";

        // Negative: 1 source -> 1 destination port with high packet count (10,000 pkts)
        let flow_neg = base_flow(src, "10.0.0.1", 80, 10000, 500000);
        let findings_neg = engine.evaluate_flow(&flow_neg);
        let port_scan_neg = findings_neg.iter().find(|f| f.rule_id == "RULE-001");
        assert!(port_scan_neg.is_none());

        // Positive: 1 source -> 20 unique destination ports
        let mut triggered = false;
        for port in 1..20 {
            let flow_pos = base_flow(src, "10.0.0.1", port, 2, 100);
            let findings_pos = engine.evaluate_flow(&flow_pos);
            if findings_pos.iter().any(|f| f.rule_id == "RULE-001") {
                triggered = true;
                break;
            }
        }
        assert!(triggered);
    }

    #[test]
    fn test_host_scan_positive_and_negative() {
        let engine = DetectionEngine::new();
        let src = "192.168.1.200";

        // Negative: 1 source -> 1 destination host with 10,000,000 bytes
        let flow_neg = base_flow(src, "10.0.0.1", 80, 100, 10000000);
        let findings_neg = engine.evaluate_flow(&flow_neg);
        let host_scan_neg = findings_neg.iter().find(|f| f.rule_id == "RULE-002");
        assert!(host_scan_neg.is_none());

        // Positive: 1 source -> 20 unique destination hosts
        let mut triggered = false;
        for host_idx in 1..20 {
            let dst_ip = format!("10.0.0.{}", host_idx);
            let flow_pos = base_flow(src, &dst_ip, 80, 2, 100);
            let findings_pos = engine.evaluate_flow(&flow_pos);
            if findings_pos.iter().any(|f| f.rule_id == "RULE-002") {
                triggered = true;
                break;
            }
        }
        assert!(triggered);
    }

    #[test]
    fn test_ja4_positive_and_negative() {
        let engine = DetectionEngine::new();

        // Negative: different JA4 fingerprint
        let mut flow_neg = base_flow("192.168.1.50", "1.1.1.1", 443, 5, 500);
        flow_neg.ja4 = "t13d000000_000000000000_000000000000".to_string();
        let findings_neg = engine.evaluate_flow(&flow_neg);
        assert!(findings_neg.iter().find(|f| f.rule_id == "RULE-004").is_none());

        // Positive: matching JA4 fingerprint
        let mut flow_pos = base_flow("192.168.1.50", "1.1.1.1", 443, 5, 500);
        flow_pos.ja4 = "t13d8daaf6152771_a1b2c3d4e5f6_7a8b9c0d1e2f".to_string();
        let findings_pos = engine.evaluate_flow(&flow_pos);
        assert!(findings_pos.iter().any(|f| f.rule_id == "RULE-004"));
    }
}

#[cfg(test)]
mod tests {
    use crate::database::duckdb::{
        persist_attack_graph_and_storylines, persist_detection_findings, persist_flow_records,
        persist_ja4_observations,
    };
    use crate::database::forensic_db::execute_forensic_query;
    use crate::models::PacketMetadata;
    use crate::services::query_validator::validate_sql_query;
    use crate::services::{
        collect_system_snapshot, get_host_identity_info, DetectionEngine, FlowEngine,
        GraphEngine, Ja4Engine, StorylineBuilder,
    };

    #[test]
    fn test_end_to_end_pipeline_integration() {
        let flow_engine = FlowEngine::new();
        let ja4_engine = Ja4Engine::new();
        let detection_engine = DetectionEngine::new();
        let graph_engine = GraphEngine::new();
        let storyline_builder = StorylineBuilder::new();

        // 1. Raw Packet Frame Input
        let raw_tls_client_hello = [
            0x16, 0x03, 0x01, 0x00, 0x2A, // Record Layer: Handshake, TLS 1.0, Len 42
            0x01, 0x00, 0x00, 0x26, // Handshake Layer: ClientHello, Len 38
            0x03, 0x03, // Version: TLS 1.2
            // 32 Bytes Random
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F,
            0x00, // Session ID Len: 0
            0x00, 0x02, 0x00, 0x2F, // Cipher Suite Len: 2, Suite: TLS_RSA_WITH_AES_128_CBC_SHA
            0x01, 0x00, // Comp Method Len: 1, Method: 0
        ];

        let pkt = PacketMetadata {
            timestamp: "2026-08-08T18:54:00Z".to_string(),
            captured_len: raw_tls_client_hello.len() as u32,
            orig_len: raw_tls_client_hello.len() as u32,
            eth_type: "IPv4".to_string(),
            src_mac: "00:11:22:33:44:55".to_string(),
            dst_mac: "52:54:00:12:34:56".to_string(),
            src_ip: "192.168.1.150".to_string(),
            dst_ip: "10.0.0.99".to_string(),
            protocol: "TCP".to_string(),
            src_port: 52345,
            dst_port: 445,
            tcp_flags: 0x10,
            arp_sender_ip: "".to_string(),
            arp_sender_mac: "00:00:00:00:00:00".to_string(),
            dns_qname: None,
            dns_qtype: "".to_string(),
            dns_rcode: -1,
            dns_answers: 0,
        };

        // 2. Ingest Packet into FlowEngine (repeatedly to build a real SMB session
        //    with enough packets to trigger RULE-003: packet_count > 20)
        for _ in 0..25 {
            flow_engine.ingest_packet(&pkt);
        }
        let active_flows = flow_engine.get_active_flows(10);
        assert_eq!(active_flows.len(), 1);
        let flow_rec = &active_flows[0];

        // 3. Process Packet in Ja4Engine
        let ja4_obs = ja4_engine.process_packet(&pkt, &raw_tls_client_hello, &flow_rec.flow_id);

        // 4. Evaluate Flow in DetectionEngine
        let findings = detection_engine.evaluate_flow(flow_rec);
        assert!(!findings.is_empty());

        // 5. Ingest Flow, JA4, and Findings into GraphEngine
        graph_engine.ingest_flow(flow_rec);
        if let Some(ref ja4) = ja4_obs {
            graph_engine.ingest_ja4(ja4);
        }
        for find in &findings {
            graph_engine.ingest_finding(find);
        }

        let graph = graph_engine.get_graph();
        assert!(!graph.nodes.is_empty());
        assert!(!graph.edges.is_empty());

        // 6. Build AttackStoryline
        let ja4_vec = ja4_obs.into_iter().collect::<Vec<_>>();
        let storyline = storyline_builder.build_storyline_from_finding(&findings[0], &active_flows, &ja4_vec);
        assert_eq!(storyline.involved_hosts.len(), 2);

        // 7. Test Database Persistence across all tables
        let flow_res = persist_flow_records(&active_flows);
        assert!(flow_res.is_ok());

        let ja4_res = persist_ja4_observations(&ja4_vec);
        assert!(ja4_res.is_ok());

        let find_res = persist_detection_findings(&findings);
        assert!(find_res.is_ok());

        let graph_res = persist_attack_graph_and_storylines(&graph, &[storyline]);
        assert!(graph_res.is_ok());
    }

    #[test]
    fn test_forensic_workbench_security_and_execution() {
        // Test 1: Validate SELECT query allowed
        let val_valid = validate_sql_query("SELECT src_ip, dst_ip FROM flow_records");
        assert!(val_valid.is_valid);
        assert!(val_valid.is_read_only);

        // Test 2: Validate INSERT/UPDATE/DELETE/DROP rejected
        assert!(!validate_sql_query("INSERT INTO flow_records VALUES (1)").is_valid);
        assert!(!validate_sql_query("UPDATE flow_records SET src_ip='1'").is_valid);
        assert!(!validate_sql_query("DELETE FROM flow_records").is_valid);
        assert!(!validate_sql_query("DROP TABLE flow_records").is_valid);
        assert!(!validate_sql_query("ATTACH 'evil.db' AS evil").is_valid);
        assert!(!validate_sql_query("SELECT 1; DROP TABLE flow_records;").is_valid);

        // Test 3: Read-Only Query Execution against all telemetry tables that exist
        let tables = [
            "flow_records",
            "ja4_fingerprints",
            "detection_findings",
            "graph_nodes",
            "graph_edges",
            "storylines",
            "storyline_events",
        ];

        for tbl in &tables {
            // Skip tables not yet created by other tests (parallel test order is not guaranteed)
            let exists = crate::database::sqlite::open_conn()
                .and_then(|conn| {
                    conn.query_row(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                        [tbl],
                        |r| r.get::<_, i64>(0),
                    )
                })
                .unwrap_or(0)
                > 0;
            if !exists {
                continue;
            }
            let sql = format!("SELECT COUNT(*) FROM {}", tbl);
            let q_res = execute_forensic_query(&sql, Some(10));
            assert!(q_res.is_ok(), "Failed to query table {}", tbl);
        }
    }

    #[test]
    fn test_phase10_system_auditing_and_correlations() {
        let identity = get_host_identity_info();
        assert!(!identity.hostname.is_empty());

        let snapshot = collect_system_snapshot();
        assert!(!snapshot.interfaces.is_empty());
        #[cfg(windows)]
        assert!(!snapshot.services.is_empty());
        #[cfg(target_os = "linux")]
        assert!(snapshot.services.is_empty(), "Linux service inspection is explicitly unavailable until a native service backend is added");
    }
}

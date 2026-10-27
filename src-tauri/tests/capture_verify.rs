//! Real capture -> parser -> flow -> persistence, opt-in on an isolated local fixture.
mod support;
#[path = "support/capture_fixture.rs"]
mod capture_fixture;

#[test]
#[ignore = "requires NETOZE_LIVE_CAPTURE=1, NETOZE_CAPTURE_ISOLATED=1 and exact INTERFACE/LOCAL_IP/PEER_IP settings; see support/capture_fixture.rs"]
fn real_capture_flow_pipeline() {
    let _data = support::isolated_data("capture-flow");
    let packets = capture_fixture::capture_packets(false, 5);
    let engine = netoze_desktop::services::FlowEngine::new();
    for packet in &packets {
        assert_eq!(packet.protocol, "UDP");
        assert!(packet.src_port > 0 && packet.dst_port == 49000);
        engine.ingest_packet(packet);
    }
    let flows = engine.get_active_flows(1000);
    assert!(!flows.is_empty());
    assert!(flows.iter().map(|flow| flow.packet_count).sum::<u64>() >= 5);
    assert!(flows.iter().map(|flow| flow.total_bytes).sum::<u64>() > 0);
    let stored = netoze_desktop::database::duckdb::persist_flow_records(&flows).expect("persist live fixture flows");
    assert_eq!(stored, flows.len());
    let connection = rusqlite::Connection::open(netoze_desktop::database::sqlite::get_app_dir().join("netoze_app.db")).unwrap();
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM flow_records", [], |row| row.get(0)).unwrap();
    assert_eq!(count as usize, flows.len());
}

//! Real DNS telemetry is opt-in and uses disposable storage and an exact on-link peer.
mod support;
#[path = "support/capture_fixture.rs"]
mod capture_fixture;
use netoze_desktop::{database::sqlite::{insert_dns_records_batch, load_dns_records}, models::DnsQueryEntry};

fn existing_row() -> DnsQueryEntry {
    DnsQueryEntry { timestamp: "2000-01-01T00:00:00Z".into(), client_ip: "192.0.2.100".into(), server_ip: "192.0.2.200".into(), qname: "example.com".into(), qtype: "A".into(), rcode: 0, answers: 0 }
}

fn verify_rows_preserved(rows: &[DnsQueryEntry]) {
    insert_dns_records_batch(&[existing_row()]);
    insert_dns_records_batch(rows);
    let loaded = load_dns_records(100);
    assert!(loaded.iter().any(|row| row.qname == "example.com" && row.timestamp == existing_row().timestamp));
    for expected in rows {
        assert!(loaded.iter().any(|row| row.qname == expected.qname && row.timestamp == expected.timestamp
            && row.client_ip == expected.client_ip && row.server_ip == expected.server_ip));
    }
    // No SQL cleanup by domain: the isolated_data guard removes only its own directory.
}

#[test]
fn dns_fixture_storage_preserves_preexisting_same_domain_rows() {
    let _data = support::isolated_data("capture-dns-storage");
    let row = DnsQueryEntry { timestamp: "2026-10-24T00:00:00Z".into(), ..existing_row() };
    verify_rows_preserved(&[row]);
    assert_eq!(load_dns_records(100).iter().filter(|row| row.qname == "example.com").count(), 2);
}

#[test]
#[ignore = "requires NETOZE_LIVE_CAPTURE=1, NETOZE_CAPTURE_ISOLATED=1 and exact INTERFACE/LOCAL_IP/PEER_IP settings; see support/capture_fixture.rs"]
fn real_capture_dns_persistence() {
    let _data = support::isolated_data("capture-dns");
    let packets = capture_fixture::capture_packets(true, 2);
    let rows: Vec<_> = packets.into_iter().map(|packet| DnsQueryEntry {
        timestamp: packet.timestamp, client_ip: packet.src_ip, server_ip: packet.dst_ip,
        qname: packet.dns_qname.expect("live fixture must contain a decoded DNS question"),
        qtype: packet.dns_qtype, rcode: packet.dns_rcode, answers: packet.dns_answers,
    }).collect();
    assert!(rows.len() >= 2);
    verify_rows_preserved(&rows);
}

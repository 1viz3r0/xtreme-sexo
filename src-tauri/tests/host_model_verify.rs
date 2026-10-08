//! Read-only host check. No packet capture or network probes.
#[test]
#[ignore = "requires a native host with accessible system journal"]
fn live_host_model_reads_real_sources() {
    use netoze_desktop::{commands, platform};
    let host = commands::get_detailed_system_info();
    assert!(host.ram_total_bytes > 0);
    assert!(host.cpu_core_count > 0);
    let adapters = platform::get_detailed_network_adapters();
    assert!(!adapters.is_empty());
    let sockets = commands::get_active_tcp_connections();
    assert!(!sockets.is_empty());
    let events = commands::get_windows_events(Some(20));
    assert!(!events.is_empty(), "system journal inaccessible or empty");
    assert!(events.iter().all(|e| chrono::DateTime::parse_from_rfc3339(&e.timestamp).is_ok()));
    println!("Host data verified: {} interfaces, {} sockets, {} structured log entries", adapters.len(), sockets.len(), events.len());
}

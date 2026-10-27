//! Native loader acceptance only; PE cross-build checks are not Windows execution.
#![cfg(windows)]

#[test]
#[ignore = "requires a native Windows host without Npcap installed"]
fn missing_npcap_keeps_the_application_and_saved_file_engine_available() {
    use netoze_desktop::{commands, platform::capture};
    assert!(capture::ensure_capture_runtime().is_err());
    assert!(!capture::inspect_packet_capture().available);
    assert!(commands::get_pcap_interfaces().is_err());
    assert!(commands::capture_buddy::buddy_interfaces().is_err());
    let status = serde_json::to_value(commands::capture_buddy::buddy_engine_status()).unwrap();
    assert_eq!(status["available"], true);
    assert_eq!(status["live_capture_blocked"], true);
}

#[test]
#[ignore = "requires a native Windows host with an approved compatible Npcap runtime"]
fn installed_system_runtime_loads_and_enumerates_without_opening_capture() {
    use netoze_desktop::platform::capture;
    capture::ensure_capture_runtime().expect("approved runtime must load from the system directory");
    capture::devices().expect("native interface enumeration must succeed");
    assert!(capture::ensure_capture_runtime().is_ok(), "the validated module remains pinned");
}

//! Isolated process integration: tracing -> private ring -> native IPC response.
use netoze_desktop::{commands::runtime_logs, services::logging};

#[test]
fn operational_events_can_be_read_back_without_private_input() {
    // Caller supplies an isolated XDG_DATA_HOME, never the user's application data.
    assert!(std::env::var("XDG_DATA_HOME").unwrap_or_default().contains("improvement-test-data"));
    logging::init_logging();
    {
        let mut operation = logging::OperationAudit::new("import");
        operation.complete(1);
    }
    { let _failed_operation = logging::OperationAudit::new("search"); }
    tracing::info!(operation="refresh", success=true, count=3u64,
        password="fixture-password", path="/private/fixture", payload="fixture-payload",
        "fixture-message-with-secret");
    let result = runtime_logs::get_recent_runtime_logs(Some(65_536));
    assert!(result.status.available, "{:?}", result.status.reason);
    assert_eq!(result.status.timezone, "Asia/Kolkata");
    assert!(result.bytes_read > 0 && result.bytes_read <= 65_536);
    assert!(result.status.retained_bytes <= 5 * 1024 * 1024);
    let text = result.chunks.iter().map(|chunk| chunk.text.as_str()).collect::<String>();
    assert!(text.contains("operation=import success=true count=1"));
    assert!(text.contains("operation=search success=false count=0"));
    assert!(text.contains("operation=refresh success=true count=3"));
    for secret in ["fixture-password", "/private/fixture", "fixture-payload", "fixture-message-with-secret"] {
        assert!(!text.contains(secret));
    }
    let tiny = runtime_logs::get_recent_runtime_logs(Some(1));
    assert_eq!(tiny.byte_limit, 1);
    assert_eq!(tiny.bytes_read, 1);
    assert!(tiny.truncated);
    assert_eq!(runtime_logs::get_runtime_log_status().file_count, result.status.file_count);
}

//! Local, read-only application operational logs. No path or filename input.
use crate::services::logging::{RecentRuntimeLogs, RuntimeLogStatus};

#[tauri::command]
pub fn get_recent_runtime_logs(max_bytes: Option<usize>) -> RecentRuntimeLogs {
    crate::services::logging::recent_runtime_logs(max_bytes)
}

#[tauri::command]
pub fn get_runtime_log_status() -> RuntimeLogStatus {
    crate::services::logging::runtime_log_status()
}

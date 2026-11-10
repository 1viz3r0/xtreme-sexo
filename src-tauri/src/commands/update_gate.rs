//! Tauri IPC surface for the signed-manifest update gate. Thin wrappers;
//! all policy lives in `services::update_gate`.

use tauri::{command, AppHandle};

use crate::services::update_gate;

/// Snapshot for the banner/gate UI and the update settings surface.
#[command]
pub fn update_gate_status(app: AppHandle) -> Result<update_gate::UpdateGateStatus, String> {
    update_gate::status_snapshot(&app)
}

/// Manual refresh (throttled server-side to one request per 60 s).
#[command]
pub async fn update_gate_check_now(app: AppHandle) -> Result<update_gate::UpdateGateStatus, String> {
    update_gate::check_now(&app).await
}

/// Explicit user-driven install of a verified, strictly newer update.
#[command]
pub async fn update_gate_install(app: AppHandle) -> Result<(), String> {
    update_gate::install(&app).await
}

/// Gate-never-blocked recovery surface: open the app data folder so the user
/// can export databases/logs by hand.
#[command]
pub fn update_gate_open_data_folder() -> Result<String, String> {
    update_gate::open_data_folder()
}

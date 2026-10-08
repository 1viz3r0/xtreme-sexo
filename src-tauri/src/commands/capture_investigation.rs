//! Tauri command for the native Capture Buddy investigation projection.
use crate::commands::capture_buddy::BuddyState;
use crate::services::capture_investigation::{build, InvestigationModel};
use tauri::State;

#[tauri::command]
pub async fn buddy_investigation_model(session_id: String, state: State<'_, BuddyState>) -> Result<InvestigationModel, String> {
    // The existing Capture Buddy reader is the sole source of decoded packets.
    let packets = crate::commands::capture_buddy::packets(&state, &session_id).await?;
    Ok(build(&packets))
}

use crate::services::lab_runtime::{LabRuntimeState, LabRuntimeStatus};
use serde_json::Value;
use tauri::{command, State};

#[command]
pub fn lab_runtime_start(lab_id: Option<String>, track: Option<String>, port: Option<u16>, state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> {
    let _ = (track, port); // Deprecated IPC inputs do not select or bind targets.
    state.start(lab_id.unwrap_or_else(|| "web-exposure".into()))
}
#[command]
pub fn lab_runtime_status(state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> { state.status() }
#[command]
pub fn lab_runtime_stop(state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> { state.stop() }
#[command]
pub fn lab_runtime_reset(state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> { state.reset() }
#[command]
pub fn lab_runtime_open(state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> { state.open() }
#[command]
pub fn lab_runtime_action(action: Value, state: State<'_, LabRuntimeState>) -> Result<LabRuntimeStatus, String> { state.action(action) }

use crate::services::lab_runtime::{LabRuntimeState, LabRuntimeStatus};
use serde_json::Value;
use tauri::{command, AppHandle, Manager};

async fn blocking(operation: impl FnOnce() -> Result<LabRuntimeStatus, String> + Send + 'static) -> Result<LabRuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(operation).await.map_err(|_| "Lab runtime worker failed".to_string())?
}

// Every state access, including waiting for a lifecycle lock, stays off the
// desktop event loop. AppHandle keeps managed state alive until work finishes.
#[command]
pub async fn lab_runtime_start(lab_id: Option<String>, track: Option<String>, port: Option<u16>, app: AppHandle) -> Result<LabRuntimeStatus, String> {
    let _ = (track, port);
    blocking(move || app.state::<LabRuntimeState>().start(lab_id.unwrap_or_else(|| "web-exposure".into()))).await
}
#[command]
pub async fn lab_runtime_status(app: AppHandle) -> Result<LabRuntimeStatus, String> {
    blocking(move || app.state::<LabRuntimeState>().status()).await
}
#[command]
pub async fn lab_runtime_stop(app: AppHandle) -> Result<LabRuntimeStatus, String> {
    blocking(move || app.state::<LabRuntimeState>().stop()).await
}
#[command]
pub async fn lab_runtime_reset(app: AppHandle) -> Result<LabRuntimeStatus, String> {
    blocking(move || app.state::<LabRuntimeState>().reset()).await
}
#[command]
pub async fn lab_runtime_open(app: AppHandle) -> Result<LabRuntimeStatus, String> {
    blocking(move || app.state::<LabRuntimeState>().open()).await
}
#[command]
pub async fn lab_runtime_action(action: Value, app: AppHandle) -> Result<LabRuntimeStatus, String> {
    blocking(move || app.state::<LabRuntimeState>().action(action)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "current_thread")]
    async fn lock_waiting_command_work_does_not_block_the_event_executor() {
        let (entered, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let work = tokio::spawn(blocking(move || {
            entered.send(()).unwrap();
            wait.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
            Ok(LabRuntimeStatus::default())
        }));
        ready.await.unwrap();
        tokio::time::timeout(std::time::Duration::from_millis(200), async { tokio::task::yield_now().await }).await.unwrap();
        release.send(()).unwrap();
        assert_eq!(work.await.unwrap().unwrap().phase, "stopped");
    }
}

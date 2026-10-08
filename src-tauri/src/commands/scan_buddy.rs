use crate::services::logging::OperationAudit;
use crate::services::scan_buddy::{self, ScanBuddyState, ScanJob, ScanPlan, ScanRequest};
use tauri::State;

#[tauri::command]
pub fn scan_buddy_storage_status(state: State<'_, ScanBuddyState>) -> scan_buddy::ScanStorageStatus {
    state.storage_status()
}

#[tauri::command]
pub fn scan_buddy_plan(request: ScanRequest) -> Result<ScanPlan, String> {
    let mut audit = OperationAudit::new("scan_buddy_plan");
    let plan = scan_buddy::plan(&request)?;
    audit.complete(plan.total_probes as u64);
    Ok(plan)
}

#[tauri::command]
pub async fn scan_buddy_start(request: ScanRequest, state: State<'_, ScanBuddyState>) -> Result<ScanJob, String> {
    let mut audit = OperationAudit::new("scan_buddy_start");
    let job = state.start(request)?;
    audit.complete(job.plan.total_probes as u64);
    Ok(job)
}

#[tauri::command]
pub fn scan_buddy_status(job_id: String, state: State<'_, ScanBuddyState>) -> Result<ScanJob, String> {
    let mut audit = OperationAudit::new("scan_buddy_status");
    let job = state.status(&job_id)?;
    audit.complete(job.completed_probes as u64);
    Ok(job)
}

#[tauri::command]
pub fn scan_buddy_cancel(job_id: String, state: State<'_, ScanBuddyState>) -> Result<ScanJob, String> {
    let mut audit = OperationAudit::new("scan_buddy_cancel");
    let job = state.cancel(&job_id)?;
    audit.complete(job.completed_probes as u64);
    Ok(job)
}

#[tauri::command]
pub fn scan_buddy_history(state: State<'_, ScanBuddyState>) -> Result<Vec<ScanJob>, String> {
    let mut audit = OperationAudit::new("scan_buddy_history");
    let jobs = state.history()?;
    audit.complete(jobs.len() as u64);
    Ok(jobs)
}

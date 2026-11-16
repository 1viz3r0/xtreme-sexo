//! Watchtower IP intelligence command surface: thin wrappers over
//! `services::ip_intel`. Scanning reuses the shared, explicitly authorized
//! Scan Buddy engine — no second scanner is introduced.
use tauri::{command, State};

use crate::services::ip_intel::{
    self, IpInvestigation, NoteRecord, ScanConfig, ScanOutcome, ScanStatus, WatchtowerIpRecord,
};

#[command]
pub fn watchtower_ips_list(limit: Option<usize>) -> Vec<WatchtowerIpRecord> {
    ip_intel::list_records(limit.unwrap_or(ip_intel::MAX_INVENTORY_ROWS))
}

/// Manual add/edit. `scan_enabled: true` records the explicit user
/// authorization that automatic scans require.
#[command]
#[allow(clippy::too_many_arguments)]
pub fn watchtower_ip_save(
    ip: String,
    label: Option<String>,
    mac: Option<String>,
    hostname: Option<String>,
    vendor: Option<String>,
    excluded: Option<bool>,
    scan_enabled: Option<bool>,
) -> Result<WatchtowerIpRecord, String> {
    ip_intel::save_manual(&ip_intel::ManualEdit {
        ip,
        label,
        mac,
        hostname,
        vendor,
        excluded,
        scan_enabled,
    })
}

#[command]
pub fn watchtower_ip_remove(ip: String) -> Result<(), String> {
    ip_intel::remove_record(&ip)
}

#[command]
pub fn watchtower_ip_set_flags(
    ip: String,
    excluded: Option<bool>,
    scan_enabled: Option<bool>,
) -> Result<WatchtowerIpRecord, String> {
    ip_intel::set_flags(&ip, excluded, scan_enabled)
}

#[command]
pub fn watchtower_scan_config_get() -> ScanConfig {
    ip_intel::get_config()
}

#[command]
pub fn watchtower_scan_config_set(
    enabled: bool,
    interval_seconds: i64,
    intensity: String,
    max_runs_per_cycle: i64,
) -> Result<ScanConfig, String> {
    ip_intel::set_config(&ScanConfig {
        enabled,
        interval_seconds,
        intensity,
        max_runs_per_cycle,
    })
}

/// Scheduler view: whether the shared engine is mid-job, the last job's
/// identity, how many saved IPs are currently due, and the earliest
/// future due time (RFC3339).
#[command]
pub fn watchtower_scan_status(
    buddy: State<'_, crate::services::scan_buddy::ScanBuddyState>,
) -> ScanStatus {
    let config = ip_intel::get_config();
    let records = ip_intel::list_records(ip_intel::MAX_INVENTORY_ROWS);
    let now = chrono::Utc::now().timestamp_millis();
    let mut due_count = 0usize;
    let mut next_due: Option<i64> = None;
    for record in &records {
        let Some(due) = ip_intel::candidate_next_due(record, &config) else {
            continue;
        };
        if due <= now {
            due_count += 1;
        } else {
            next_due = Some(next_due.map_or(due, |current| current.min(due)));
        }
    }
    let last_job = buddy.history().ok().and_then(|jobs| jobs.into_iter().next());
    let running = last_job
        .as_ref()
        .map_or(false, |job| job.state == "RUNNING");
    ScanStatus {
        current_ip: if running {
            last_job
                .as_ref()
                .and_then(|job| job.plan.targets.first().cloned())
        } else {
            None
        },
        running,
        last_job_id: last_job.as_ref().map(|job| job.id.clone()),
        last_job_state: last_job.as_ref().map(|job| job.state.clone()),
        next_due_at: next_due.map(ip_intel::rfc3339),
        due_count,
        config,
    }
}

/// Manual "Scan now" for one saved IP. `force: true` covers the explicit
/// user click that also authorizes a not-yet-enabled address once.
#[command]
pub async fn watchtower_ip_scan_now(
    ip: String,
    force: Option<bool>,
    buddy: State<'_, crate::services::scan_buddy::ScanBuddyState>,
) -> Result<ScanOutcome, String> {
    ip_intel::scan_now(&buddy, &ip, force.unwrap_or(false)).await
}

#[command]
pub fn watchtower_ip_investigate(ip: String) -> Result<IpInvestigation, String> {
    ip_intel::investigate(&ip)
}

/// `ip: None` lists general investigation notes; `ip: Some(...)` lists the
/// notes attached to one address.
#[command]
pub fn watchtower_notes_list(ip: Option<String>, limit: Option<usize>) -> Vec<NoteRecord> {
    ip_intel::list_notes(ip.as_deref(), limit.unwrap_or(ip_intel::MAX_NOTES))
}

/// Create (id omitted) or autosave-update (id present) a note. Timestamps
/// are maintained server-side.
#[command]
pub fn watchtower_note_save(
    id: Option<i64>,
    ip: Option<String>,
    body: String,
) -> Result<NoteRecord, String> {
    ip_intel::save_note(id, ip.as_deref(), &body)
}

#[command]
pub fn watchtower_note_delete(id: i64) -> Result<(), String> {
    ip_intel::delete_note(id)
}

use crate::models::ConnectivityStatus;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const CONNECTIVITY_ENDPOINTS: &[(&str, &str)] = &[
    ("generate_204 (gstatic)", "https://www.gstatic.com/generate_204"),
    ("connectivitycheck (google)", "https://connectivitycheck.gstatic.com/generate_204"),
];

pub struct ConnectivityState {
    pub current: Arc<std::sync::Mutex<ConnectivityStatus>>,
    pub running: Arc<AtomicBool>,
}

impl ConnectivityState {
    pub fn new() -> Self {
        let now = now_rfc3339();
        Self {
            current: Arc::new(std::sync::Mutex::new(ConnectivityStatus {
                state: "CONNECTING".to_string(),
                source: "initialization".to_string(),
                last_checked: now.clone(),
                last_success: None,
                latency_ms: None,
                detail: "Connectivity probe starting".to_string(),
            })),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn snapshot(&self) -> ConnectivityStatus {
        self.current.lock().unwrap().clone()
    }
}

pub fn start_connectivity_monitor(state: Arc<ConnectivityState>, app_handle: tauri::AppHandle) {
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut last_ok: Option<u64> = None;
        loop {
            let (ok, source, latency, detail) = probe().await;
            let now_ms = now_ms();
            let last_checked = now_rfc3339();

            let (state_str, next_interval) = decide_state(ok, last_ok, now_ms);
            if ok {
                last_ok = Some(now_ms);
            }

            let status = ConnectivityStatus {
                state: state_str,
                source,
                last_checked,
                last_success: last_ok.map(|ms| unix_ms_to_rfc3339(ms)),
                latency_ms: if ok { Some(latency) } else { None },
                detail,
            };

            let prev_state = {
                let mut guard = state.current.lock().unwrap();
                let prev = guard.state.clone();
                *guard = status.clone();
                prev
            };

            if prev_state != status.state {
                tracing::info!("🌐 Connectivity state change: {} → {}", prev_state, status.state);
                let _ = app_handle.emit("connectivity-state-change", status.clone());
            }
            let _ = app_handle.emit("connectivity-status", status);

            tokio::time::sleep(next_interval).await;
        }
    });
}

pub async fn probe() -> (bool, String, u64, String) {
    for (name, url) in CONNECTIVITY_ENDPOINTS {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(4))
            .connect_timeout(Duration::from_secs(3))
            .build();
        let Ok(client) = client else { continue };
        let started = Instant::now();
        match client.get(*url).send().await {
            Ok(resp) if resp.status() == reqwest::StatusCode::NO_CONTENT => {
                let latency_ms = started.elapsed().as_millis() as u64;
                return (
                    true,
                    name.to_string(),
                    latency_ms,
                    format!("{} reachable in {} ms", name, latency_ms),
                );
            }
            Ok(resp) => {
                return (
                    false,
                    name.to_string(),
                    0,
                    format!("{} returned HTTP {}", name, resp.status().as_u16()),
                );
            }
            Err(err) => {
                tracing::debug!("Connectivity probe {} failed: {}", name, err);
            }
        }
    }
    (
        false,
        "all-endpoints".to_string(),
        0,
        "All connectivity endpoints unreachable".to_string(),
    )
}

/// Pure state-machine decision: (state, next_probe_interval).
/// ONLINE on success; DEGRADED while last success < 90s old; OFFLINE otherwise.
pub fn decide_state(ok: bool, last_ok: Option<u64>, now_ms: u64) -> (String, Duration) {
    if ok {
        return ("ONLINE".to_string(), Duration::from_secs(15));
    }
    let last_success = last_ok.unwrap_or(0);
    let stale_secs = if last_success == 0 {
        u64::MAX
    } else {
        (now_ms.saturating_sub(last_success)) / 1000
    };
    if last_success == 0 || stale_secs > 90 {
        ("OFFLINE".to_string(), Duration::from_secs(5))
    } else {
        ("DEGRADED".to_string(), Duration::from_secs(5))
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn unix_ms_to_rfc3339(ms: u64) -> String {
    let secs = (ms / 1000) as i64;
    let nanos = ((ms % 1000) * 1_000_000) as u32;
    chrono::DateTime::from_timestamp(secs, nanos)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| now_rfc3339())
}

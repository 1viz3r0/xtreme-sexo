use crate::models::{ConnectivityStatus, GeoIpEntry};
use crate::services::enrichment::{
    bounded_public_ips, stale_entry, EnrichedGeoIpEntry, EnrichmentRefreshResult,
    EnrichmentSourceState, REFRESH_TIMEOUT,
};
use crate::state::BackendState;
use tauri::{command, Manager};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn cached_entry(_state: &BackendState, ip: &str) -> Option<GeoIpEntry> {
    crate::database::sqlite::load_geoip(ip)
}

#[command]
pub async fn refresh_watchtower_enrichment(
    app_handle: tauri::AppHandle,
    token: Option<String>,
) -> Result<EnrichmentRefreshResult, String> {
    // Overview geography is an administrator surface; the session token is
    // validated against the persisted auth store before any work happens.
    crate::commands::global_intel::require_admin_session(&token)?;
    // The refresh is blocking-heavy local work: sequential provider lookups
    // plus synchronous local cache writes. It runs on the dedicated blocking
    // pool so a stalled provider or a slow sqlite write can never starve the
    // async reactor that Overview's polling (and every other command) shares.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<BackendState>();
        tauri::async_runtime::block_on(refresh_watchtower_enrichment_inner(&state))
    })
    .await
    .map_err(|_| "Enrichment worker is unavailable".to_string())?
}

async fn refresh_watchtower_enrichment_inner(
    state: &BackendState,
) -> Result<EnrichmentRefreshResult, String> {
    // Only observed flow endpoints are eligible. This command is explicit; the
    // local snapshot command never calls it and therefore never waits on I/O.
    let started = std::time::Instant::now();
    let observed = state
        .flows
        .lock()
        .map_err(|_| "Flow engine unavailable")?
        .get_recent_flows(500)
        .into_iter()
        .flat_map(|f| [f.src_ip, f.dst_ip])
        .collect::<Vec<_>>();
    let ips = bounded_public_ips(observed);
    tracing::debug!(stage = "collect", elapsed_ms = started.elapsed().as_millis() as u64, ips = ips.len(), "enrichment stage");
    let requested_ips = ips.len();
    let mut geoip = Vec::new();
    let mut errors = Vec::new();
    for ip in &ips {
        let lookup_started = std::time::Instant::now();
        match tokio::time::timeout(REFRESH_TIMEOUT, state.geoip.lookup_checked(ip)).await {
            Ok(Ok(entry)) => {
                tracing::debug!(stage = "geoip", ip = %ip, elapsed_ms = lookup_started.elapsed().as_millis() as u64, outcome = "ok", "enrichment stage");
                geoip.push(EnrichedGeoIpEntry {
                    entry,
                    stale: false,
                })
            },
            Ok(Err(error)) => {
                tracing::debug!(stage = "geoip", ip = %ip, elapsed_ms = lookup_started.elapsed().as_millis() as u64, outcome = "error", "enrichment stage");
                if let Some(entry) = cached_entry(state, ip) {
                    geoip.push(stale_entry(entry));
                }
                errors.push(format!("GeoIP {}: {}", ip, error));
            }
            Err(_) => {
                tracing::debug!(stage = "geoip", ip = %ip, elapsed_ms = lookup_started.elapsed().as_millis() as u64, outcome = "timeout", "enrichment stage");
                if let Some(entry) = cached_entry(state, ip) {
                    geoip.push(stale_entry(entry));
                }
                errors.push(format!("GeoIP {}: refresh timed out", ip));
            }
        }
    }

    let connectivity = match tokio::time::timeout(
        REFRESH_TIMEOUT,
        crate::services::connectivity_monitor::probe(),
    )
    .await
    {
        Ok((ok, source, latency, detail)) => {
            let timestamp = now();
            let mut current = state
                .connectivity
                .lock()
                .map_err(|_| "Connectivity state unavailable")?;
            *current = ConnectivityStatus {
                state: if ok { "ONLINE" } else { "OFFLINE" }.into(),
                source,
                last_checked: timestamp.clone(),
                last_success: if ok {
                    Some(timestamp)
                } else {
                    current.last_success.clone()
                },
                latency_ms: ok.then_some(latency),
                detail,
            };
            current.clone()
        }
        Err(_) => state
            .connectivity
            .lock()
            .map_err(|_| "Connectivity state unavailable")?
            .clone(),
    };

    let connectivity_state = EnrichmentSourceState {
        source: "connectivity".into(),
        state: connectivity.state.clone(),
        refreshed_at: connectivity.last_checked.clone(),
        cache_timestamp: connectivity
            .last_success
            .as_ref()
            .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
            .map(|v| v.timestamp_millis()),
        detail: connectivity.detail.clone(),
    };
    let threat_result = tokio::time::timeout(
        REFRESH_TIMEOUT,
        crate::services::threat_intel::fetch_feeds_detailed(),
    )
    .await;
    tracing::debug!(stage = "feeds", elapsed_ms = started.elapsed().as_millis() as u64, ok = threat_result.is_ok(), "enrichment stage");
    let threat_state = match threat_result {
        Ok(Ok(result)) => {
            let crate::services::threat_intel::FeedRefresh {
                entries,
                sources,
                errors: feed_errors,
            } = result;
            let mut map = state
                .threats
                .iocs
                .lock()
                .map_err(|_| "Threat state unavailable")?;
            map.clear();
            for entry in entries {
                map.insert(entry.ip.clone(), entry);
            }
            *state
                .threats
                .loaded_sources
                .lock()
                .map_err(|_| "Threat state unavailable")? = sources;
            let timestamp = now();
            *state
                .threats
                .last_fetched
                .lock()
                .map_err(|_| "Threat state unavailable")? = Some(timestamp.clone());
            *state
                .threats
                .fetch_error
                .lock()
                .map_err(|_| "Threat state unavailable")? = if feed_errors.is_empty() {
                None
            } else {
                Some(feed_errors.join("; "))
            };
            EnrichmentSourceState {
                source: "abuse.ch feeds".into(),
                state: state.threats.status().feed_state,
                refreshed_at: timestamp,
                cache_timestamp: None,
                detail: "Audited configured threat feeds".into(),
            }
        }
        Ok(Err(error)) => {
            errors.push(format!("Threat intel: {}", error));
            let status = state.threats.status();
            EnrichmentSourceState {
                source: "abuse.ch feeds".into(),
                state: status.feed_state.clone(),
                refreshed_at: now(),
                cache_timestamp: status
                    .last_fetched
                    .as_ref()
                    .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                    .map(|v| v.timestamp_millis()),
                detail: "Refresh failed; last known feed retained".into(),
            }
        }
        Err(_) => {
            errors.push("Threat intel: refresh timed out".into());
            let status = state.threats.status();
            EnrichmentSourceState {
                source: "abuse.ch feeds".into(),
                state: status.feed_state.clone(),
                refreshed_at: now(),
                cache_timestamp: status
                    .last_fetched
                    .as_ref()
                    .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                    .map(|v| v.timestamp_millis()),
                detail: "Refresh timed out; last known feed retained".into(),
            }
        }
    };
    Ok(EnrichmentRefreshResult {
        requested_ips,
        attempted_ips: ips.len(),
        geoip,
        sources: vec![connectivity_state, threat_state],
        errors,
    })
    .map(|result| {
        tracing::debug!(stage = "done", elapsed_ms = started.elapsed().as_millis() as u64, "enrichment complete");
        result
    })
}

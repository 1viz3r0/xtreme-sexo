use crate::database::sqlite::upsert_threat_match;
use crate::models::{ThreatIntelStatus, ThreatMatchEntry};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const FEEDS: &[(&str, &str)] = &[
    (
        "sslbl",
        "https://sslbl.abuse.ch/blacklist/sslipblacklist.csv",
    ),
    (
        "feodo",
        "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt",
    ),
    (
        "feodo-full",
        "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    ),
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct ThreatIntelState {
    pub iocs: Arc<Mutex<HashMap<String, ThreatMatchEntry>>>,
    pub last_fetched: Arc<Mutex<Option<String>>>,
    pub fetch_error: Arc<Mutex<Option<String>>>,
    pub running: Arc<AtomicBool>,
    pub matched_ips: Mutex<HashSet<String>>,
    pub loaded_sources: Mutex<Vec<String>>,
}

impl ThreatIntelState {
    pub fn new() -> Self {
        Self {
            iocs: Arc::new(Mutex::new(HashMap::new())),
            last_fetched: Arc::new(Mutex::new(None)),
            fetch_error: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            matched_ips: Mutex::new(HashSet::new()),
            loaded_sources: Mutex::new(Vec::new()),
        }
    }

    pub fn status(&self) -> ThreatIntelStatus {
        let iocs = self.iocs.lock().unwrap();
        let mut sources: Vec<String> = self.loaded_sources.lock().unwrap().clone();
        sources.extend(iocs.values().map(|m| m.feed.clone()));
        sources.sort();
        sources.dedup();
        let match_count = self.matched_ips.lock().unwrap().len();
        let fetched = self.last_fetched.lock().unwrap().clone();
        ThreatIntelStatus {
            feed_state: if self.fetch_error.lock().unwrap().is_some() {
                if fetched.is_some() { "DEGRADED" } else { "ERROR" }.to_string()
            } else if fetched.is_none() {
                "NOT_STARTED".to_string()
            } else if !iocs.is_empty() {
                "LOADED".to_string()
            } else {
                "EMPTY".to_string()
            },
            last_fetched: fetched,
            ioc_count: iocs.len(),
            match_count,
            sources,
        }
    }

    pub fn lookup_ip(&self, ip: &str) -> Option<ThreatMatchEntry> {
        self.iocs.lock().unwrap().get(ip).cloned()
    }
}

pub fn start_threat_intel_worker(state: Arc<ThreatIntelState>, app_handle: tauri::AppHandle) {
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            match fetch_feeds().await {
                Ok(entries) => {
                    let mut map = state.iocs.lock().unwrap();
                    map.clear();
                    for e in entries {
                        map.insert(e.ip.clone(), e);
                    }
                    drop(map);
                    *state.last_fetched.lock().unwrap() = Some(chrono::Utc::now().to_rfc3339());
                    *state.fetch_error.lock().unwrap() = None;
                    tracing::info!(
                        "🛡️ Threat intel feeds refreshed: {} IOC(s)",
                        state.iocs.lock().unwrap().len()
                    );
                    let _ = app_handle.emit("threatintel-status", state.status());
                }
                Err(err) => {
                    *state.fetch_error.lock().unwrap() = Some(err.clone());
                    tracing::warn!("🛡️ Threat intel fetch failed: {}", err);
                    let _ = app_handle.emit("threatintel-status", state.status());
                }
            }
            tokio::time::sleep(Duration::from_secs(3600)).await;
        }
    });
}

pub async fn fetch_feeds() -> Result<Vec<ThreatMatchEntry>, String> {
    fetch_feeds_detailed().await.map(|result| result.entries)
}

pub struct FeedRefresh {
    pub entries: Vec<ThreatMatchEntry>,
    pub sources: Vec<String>,
    pub errors: Vec<String>,
}

pub async fn fetch_feeds_detailed() -> Result<FeedRefresh, String> {
    let client = crate::services::http_client::client()?;

    let mut collected: HashMap<String, ThreatMatchEntry> = HashMap::new();
    let mut sources = Vec::new();
    let mut errors = Vec::new();

    for (feed, url) in FEEDS {
        match crate::services::http_client::read_text(&client, url, 2 * 1024 * 1024).await {
            Ok(text) if !text.trim_start().starts_with('<') => {
                for entry in parse_feed(feed, &text) {
                    collected.entry(entry.ip.clone()).or_insert(entry);
                }
                sources.push(feed.to_string());
            }
            Ok(_) => errors.push(format!("{} returned HTML instead of feed data", feed)),
            Err(error) => errors.push(format!("{}: {}", feed, error)),
        }
    }

    if sources.is_empty() {
        return Err(errors.join("; "));
    }
    // Feodo explicitly publishes legitimately empty datasets. A successful
    // empty response is EMPTY, not a fabricated IOC or a network failure.
    Ok(FeedRefresh { entries: collected.into_values().collect(), sources, errors })
}

fn parse_feed(feed: &str, text: &str) -> Vec<ThreatMatchEntry> {
    text.lines().take(20_000).filter_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { return None; }
        let (address, first_seen) = if feed == "sslbl" {
            let mut fields = line.split(',');
            let timestamp = fields.next()?.trim().to_string();
            (fields.next()?.trim(), Some(timestamp))
        } else { (line, None) };
        let address = address.parse::<std::net::IpAddr>().ok()?.to_string();
        if crate::services::geoip_service::is_private_ip(&address) { return None; }
        Some(ThreatMatchEntry { ip: address, indicator_type: "IP".into(), feed: feed.into(), severity: "HIGH".into(), feed_first_seen: first_seen, feed_last_seen: None, matched_at: 0 })
    }).collect()
}

/// Scores a batch of IPs against the in-memory IOC set; matches get persisted.
pub fn evaluate_ips_for_threats(
    state: &ThreatIntelState,
    ips: &[String],
    max_matches: usize,
) -> Vec<ThreatMatchEntry> {
    let iocs = state.iocs.lock().unwrap();
    let mut matches = Vec::new();
    for ip in ips {
        if let Some(m) = iocs.get(ip) {
            if matches.len() >= max_matches {
                break;
            }
            let match_entry = ThreatMatchEntry {
                matched_at: now_ms(),
                ..m.clone()
            };
            upsert_threat_match(&match_entry);
            state.matched_ips.lock().unwrap().insert(ip.clone());
            matches.push(match_entry);
        }
    }
    matches
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feed_parser_ignores_headers_and_invalid_indicators() {
        let entries = parse_feed("feodo", "# empty or populated feed\nnot-an-ip\n192.168.1.1\n1.1.1.1\n");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].matched_at, 0);
        assert!(parse_feed("feodo", "# legitimately empty\n").is_empty());
        let ssl = parse_feed("sslbl", "2026-10-04,8.8.8.8,443\n");
        assert_eq!(ssl[0].ip, "8.8.8.8");
    }
}

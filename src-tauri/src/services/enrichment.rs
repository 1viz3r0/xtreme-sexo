use crate::models::GeoIpEntry;
use serde::Serialize;
use std::collections::HashSet;
use std::time::Duration;

pub const MAX_IPS: usize = 25;
pub const REFRESH_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
pub struct EnrichedGeoIpEntry {
    #[serde(flatten)]
    pub entry: GeoIpEntry,
    /// True when this is the last locally cached observation after refresh failed.
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnrichmentSourceState {
    pub source: String,
    pub state: String,
    pub refreshed_at: String,
    pub cache_timestamp: Option<i64>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnrichmentRefreshResult {
    pub requested_ips: usize,
    pub attempted_ips: usize,
    pub geoip: Vec<EnrichedGeoIpEntry>,
    pub sources: Vec<EnrichmentSourceState>,
    pub errors: Vec<String>,
}

pub fn bounded_public_ips<I>(ips: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let mut seen = HashSet::new();
    ips.into_iter()
        .filter_map(|ip| {
            let parsed = ip.parse::<std::net::IpAddr>().ok()?;
            if crate::services::geoip_service::is_private_ip(&parsed.to_string()) {
                return None;
            }
            seen.insert(parsed.to_string())
                .then_some(parsed.to_string())
        })
        .take(MAX_IPS)
        .collect()
}

pub fn stale_entry(entry: GeoIpEntry) -> EnrichedGeoIpEntry {
    EnrichedGeoIpEntry { entry, stale: true }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_ip_batch_is_deduplicated_and_bounded_without_private_payloads() {
        let ips = (0..40)
            .map(|i| format!("203.0.113.{}", (i % 30) + 1))
            .chain(["10.0.0.1".into(), "not-an-ip".into()])
            .collect::<Vec<_>>();
        let result = bounded_public_ips(ips);
        assert_eq!(result.len(), 0, "documentation addresses must not be sent");

        let result = bounded_public_ips((1..40).map(|i| format!("8.8.{}.{}", i / 256, i % 256)));
        assert_eq!(result.len(), MAX_IPS);
    }
}

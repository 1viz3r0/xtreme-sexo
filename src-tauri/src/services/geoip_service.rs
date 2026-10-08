use crate::database::sqlite::{load_geoip, upsert_geoip};
use crate::models::GeoIpEntry;
use crate::services::http_client;
use std::collections::HashSet;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub fn is_private_ip(ip: &str) -> bool {
    let Ok(parsed) = ip.parse::<IpAddr>() else { return true };
    match parsed {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            ip.is_private() || ip.is_loopback() || ip.is_link_local()
                || ip.is_broadcast() || ip.is_documentation() || ip.is_multicast()
                || octets[0] == 0 || octets[0] >= 240
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 198 && (18..=19).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() { return is_private_ip(&v4.to_string()); }
            let segments = ip.segments();
            (segments[0] & 0xe000) != 0x2000
                || (segments[0] == 0x2001 && segments[1] == 0x0db8)
                || (segments[0] == 0x3fff && segments[1] <= 0x0fff)
        }
    }
}

pub struct GeoIpService {
    pub cache_hits: Arc<AtomicU64>,
    pub cache_misses: Arc<AtomicU64>,
    pub last_public_ip: Arc<Mutex<Option<String>>>,
    last_public_ip_at: AtomicU64,
}

impl GeoIpService {
    pub fn new() -> Self {
        Self {
            cache_hits: Arc::new(AtomicU64::new(0)),
            cache_misses: Arc::new(AtomicU64::new(0)),
            last_public_ip: Arc::new(Mutex::new(None)),
            last_public_ip_at: AtomicU64::new(0),
        }
    }

    pub fn is_private(&self, ip: &str) -> bool { is_private_ip(ip) }

    pub async fn resolve_public_ip_checked(&self) -> Result<String, String> {
        let now = chrono::Utc::now().timestamp().max(0) as u64;
        if now.saturating_sub(self.last_public_ip_at.load(Ordering::Relaxed)) < 600 {
            if let Some(ip) = self.last_public_ip.lock().map_err(|_| "Public IP cache unavailable")?.clone() {
                return Ok(ip);
            }
        }
        let text = http_client::read_text(&http_client::client()?, "https://api64.ipify.org", 128).await?;
        let ip = text.trim().parse::<IpAddr>().map_err(|_| "Public IP provider returned an invalid address")?.to_string();
        if is_private_ip(&ip) { return Err("Public IP provider returned a reserved address".into()); }
        *self.last_public_ip.lock().map_err(|_| "Public IP cache unavailable")? = Some(ip.clone());
        self.last_public_ip_at.store(now, Ordering::Relaxed);
        Ok(ip)
    }

    pub async fn resolve_public_ip(&self) -> Option<String> { self.resolve_public_ip_checked().await.ok() }

    /// Explicit, user-triggered enrichment. Private IPs are classified locally;
    /// they never leave the device and never receive invented coordinates.
    pub async fn lookup_checked(&self, ip: &str) -> Result<GeoIpEntry, String> {
        let ip = ip.parse::<IpAddr>().map_err(|_| "Invalid IP address")?.to_string();
        if is_private_ip(&ip) {
            return Ok(GeoIpEntry { ip, country: "Local / reserved network".into(), country_code: "LOCAL".into(), city: String::new(), latitude: None, longitude: None, asn: None, org: None, source: "local-classification".into(), resolved_at: chrono::Utc::now().timestamp_millis() });
        }
        if let Some(cached) = load_geoip(&ip) {
            let age = chrono::Utc::now().timestamp_millis().saturating_sub(cached.resolved_at);
            if (0..30 * 24 * 3600 * 1000).contains(&age) {
                self.cache_hits.fetch_add(1, Ordering::Relaxed);
                return Ok(cached);
            }
        }
        self.cache_misses.fetch_add(1, Ordering::Relaxed);
        let text = http_client::read_text(&http_client::client()?, &format!("https://ipwho.is/{}", ip), 256 * 1024).await?;
        let json = serde_json::from_str(&text).map_err(|_| "GeoIP provider returned malformed JSON")?;
        let entry = parse_geoip(&ip, &json)?;
        upsert_geoip(&entry);
        Ok(entry)
    }

    pub async fn lookup(&self, ip: &str) -> Option<GeoIpEntry> { self.lookup_checked(ip).await.ok() }

    pub async fn enrich_ips(&self, ips: &[String], max: usize) -> Vec<GeoIpEntry> {
        let mut seen = HashSet::new();
        let mut entries = Vec::new();
        // Cap attempted requests, not just successful responses.
        for ip in ips.iter().filter(|ip| seen.insert((*ip).clone())).take(max.min(25)) {
            if let Ok(entry) = self.lookup_checked(ip).await { entries.push(entry); }
        }
        entries
    }

    pub fn cache_stats(&self) -> (u64, u64) {
        (self.cache_hits.load(Ordering::Relaxed), self.cache_misses.load(Ordering::Relaxed))
    }
}

fn parse_geoip(ip: &str, json: &serde_json::Value) -> Result<GeoIpEntry, String> {
    if json["success"].as_bool() != Some(true) { return Err("GeoIP provider could not resolve this address".into()); }
    if json["ip"].as_str().and_then(|v| v.parse::<IpAddr>().ok()) != ip.parse::<IpAddr>().ok() {
        return Err("GeoIP response address does not match request".into());
    }
    let country = json["country"].as_str().filter(|v| !v.is_empty()).ok_or("GeoIP country is unavailable")?;
    let code = json["country_code"].as_str().filter(|v| v.len() == 2 && v.bytes().all(|b| b.is_ascii_alphabetic())).ok_or("GeoIP country code is invalid")?;
    let coordinates = json["latitude"].as_f64().zip(json["longitude"].as_f64())
        .filter(|(lat, lon)| lat.is_finite() && lon.is_finite() && (-90.0..=90.0).contains(lat) && (-180.0..=180.0).contains(lon));
    Ok(GeoIpEntry {
        ip: ip.into(), country: country.into(), country_code: code.to_uppercase(),
        city: json["city"].as_str().unwrap_or_default().into(),
        latitude: coordinates.map(|v| v.0), longitude: coordinates.map(|v| v.1),
        asn: json["connection"]["asn"].as_u64().map(|v| format!("AS{}", v)),
        org: json["connection"]["org"].as_str().map(str::to_owned),
        source: "ipwho.is".into(), resolved_at: chrono::Utc::now().timestamp_millis(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reserved_addresses_never_go_to_geoip_providers() {
        for ip in ["0.0.0.0", "10.1.2.3", "100.64.0.1", "198.18.1.1", "192.0.2.1", "::", "::1", "fc00::1", "2001:db8::1", "::ffff:192.168.1.1"] { assert!(is_private_ip(ip), "{}", ip); }
        assert!(!is_private_ip("1.1.1.1"));
        assert!(!is_private_ip("2606:4700:4700::1111"));
    }
    #[test]
    fn geoip_requires_matching_ip_and_preserves_missing_coordinates() {
        let mut json = serde_json::json!({"success":true,"ip":"1.1.1.1","country":"Australia","country_code":"AU","latitude":999,"longitude":0});
        let entry = parse_geoip("1.1.1.1", &json).unwrap();
        assert_eq!(entry.latitude, None);
        assert_eq!(entry.longitude, None);
        json["ip"] = "8.8.8.8".into();
        assert!(parse_geoip("1.1.1.1", &json).is_err());
    }
}

//! Explicit external API checks. Never run as part of normal startup or tests.
//! Invoke with --ignored; no capture, port scan, or private IP upload occurs.
use netoze_desktop::services::{GeoIpService, threat_intel::fetch_feeds_detailed};

#[tokio::test]
#[ignore = "explicit external API validation"]
async fn verify_keyless_backend_apis() {
    let geoip = GeoIpService::new();
    let public_ip = geoip.resolve_public_ip_checked().await.expect("ipify public IP request");
    assert!(!geoip.is_private(&public_ip));
    println!("PASS: ipify returned a valid public IP (address not logged)");
    let entry = geoip.lookup_checked("1.1.1.1").await.expect("ipwho.is GeoIP request");
    assert_eq!(entry.ip, "1.1.1.1");
    assert_eq!(entry.country_code.len(), 2);
    assert_eq!(entry.source, "ipwho.is");
    println!("PASS: GeoIP returned a validated result for a public test endpoint");
    let rdap = netoze_desktop::commands::whois_rdap("1.1.1.1".into()).await.expect("RDAP lookup");
    let rdap: serde_json::Value = serde_json::from_str(&rdap).unwrap();
    assert_eq!(rdap["objectClassName"], "ip network");
    println!("PASS: RDAP returned a registry IP-network record");
    let feeds = fetch_feeds_detailed().await.expect("public threat feed fetch");
    assert!(!feeds.sources.is_empty());
    assert!(feeds.entries.iter().all(|entry| entry.ip.parse::<std::net::IpAddr>().is_ok()));
    println!("PASS: {} feed sources, {} valid indicators, {} source errors; empty feeds are valid", feeds.sources.len(), feeds.entries.len(), feeds.errors.len());
}

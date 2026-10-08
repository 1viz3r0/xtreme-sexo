pub mod auth_service;
pub mod buddy_search;
pub mod buddy_engine;
pub mod capture_brief;
pub mod capture_investigation;
pub mod capture_service;
pub mod connectivity_monitor;
pub mod detection_engine;
pub mod device_discovery;
pub mod edu_inspector;
pub mod flow_engine;
pub mod geoip_service;
pub mod http_client;
pub mod graph_engine;
pub mod integration_test;
pub mod ja4_canonicalizer;
pub mod ja4_engine;
pub mod logging;
pub mod npcap_capture;
pub mod packet_parser;
pub mod port_scanner;
pub mod lab_runtime;
pub mod scan_buddy;
pub mod scan_buddy_journal;
pub mod scan_inspection;
pub mod query_validator;
pub mod rule_evaluator;
pub mod storyline_builder;
pub mod system_inspector;
pub mod telemetry_worker;
pub mod threat_intel;

pub use capture_service::CaptureEngine;
pub use connectivity_monitor::{start_connectivity_monitor, ConnectivityState};
pub use detection_engine::DetectionEngine;
pub use device_discovery::{read_arp_table, DeviceDiscoveryState};
pub use edu_inspector::get_field_explanation;
pub use flow_engine::FlowEngine;
pub use geoip_service::GeoIpService;
pub use graph_engine::GraphEngine;
pub use ja4_canonicalizer::canonicalize_ja4;
pub use ja4_engine::Ja4Engine;
pub use npcap_capture::NpcapCapture;
pub use port_scanner::PortScannerState;
pub use query_validator::{get_prebuilt_templates, get_schema_metadata, validate_sql_query};
pub use storyline_builder::StorylineBuilder;
pub use system_inspector::{
    collect_system_snapshot, correlate_flow_with_sockets, get_host_identity_info,
};
pub use telemetry_worker::start_telemetry_worker;
pub use threat_intel::{
    evaluate_ips_for_threats, start_threat_intel_worker, ThreatIntelState,
};

use crate::models::AppConfig;
use std::path::PathBuf;

pub fn init_logging() {
    logging::init_logging();
}

pub fn load_app_config(sqlite_path: PathBuf, duckdb_path: PathBuf) -> AppConfig {
    AppConfig {
        selected_interface: "eth0".to_string(),
        capture_status: "STOPPED".to_string(),
        app_mode: "LIVE".to_string(),
        theme: "dark_glass".to_string(),
        sqlite_path: sqlite_path.to_string_lossy().to_string(),
        duckdb_path: duckdb_path.to_string_lossy().to_string(),
    }
}

use crate::services::{CaptureEngine, DetectionEngine, DeviceDiscoveryState, FlowEngine, GraphEngine, Ja4Engine, PortScannerState, StorylineBuilder, GeoIpService, ThreatIntelState};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// One set of engines shared by capture and all read commands. Construction does
/// not open an interface, spawn a worker, probe a host, or fetch an external feed.
pub struct BackendState {
    pub capture: Mutex<CaptureEngine>,
    pub flows: Arc<Mutex<FlowEngine>>,
    pub detections: Arc<Mutex<DetectionEngine>>,
    pub ja4: Arc<Mutex<Ja4Engine>>,
    pub graph: Arc<Mutex<GraphEngine>>,
    pub storylines: Arc<Mutex<StorylineBuilder>>,
    pub geoip: GeoIpService,
    pub threats: ThreatIntelState,
    pub devices: Arc<DeviceDiscoveryState>,
    pub port_scanner: Arc<PortScannerState>,
    pub connectivity: Mutex<crate::models::ConnectivityStatus>,
    pub intel_refresh: tokio::sync::Mutex<()>,
    pub sqlite_path: Option<PathBuf>,
    pub storage_error: Option<String>,
}

impl BackendState {
    pub fn new(storage: Result<PathBuf, String>) -> Self {
        let flows = Arc::new(Mutex::new(FlowEngine::new()));
        let detections = Arc::new(Mutex::new(DetectionEngine::new()));
        let ja4 = Arc::new(Mutex::new(Ja4Engine::new()));
        let graph = Arc::new(Mutex::new(GraphEngine::new()));
        let storylines = Arc::new(Mutex::new(StorylineBuilder::new()));
        let capture = CaptureEngine::new(
            flows.clone(),
            ja4.clone(),
            detections.clone(),
            graph.clone(),
            storylines.clone(),
        );
        let (sqlite_path, storage_error) = match storage {
            Ok(path) => (Some(path), None),
            Err(error) => (None, Some(error)),
        };
        Self {
            capture: Mutex::new(capture), flows, detections, ja4, graph, storylines,
            geoip: GeoIpService::new(), threats: ThreatIntelState::new(),
            devices: Arc::new(DeviceDiscoveryState::new()),
            port_scanner: Arc::new(PortScannerState::new()),
            connectivity: Mutex::new(crate::models::ConnectivityStatus {
                state: "UNAVAILABLE".into(), source: "not_started".into(), last_checked: String::new(), last_success: None, latency_ms: None,
                detail: "Connectivity has not been checked".into(),
            }),
            intel_refresh: tokio::sync::Mutex::new(()), sqlite_path, storage_error,
        }
    }
}

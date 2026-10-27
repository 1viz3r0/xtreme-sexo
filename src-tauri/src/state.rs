use crate::services::{CaptureEngine, DetectionEngine, DeviceDiscoveryState, FlowEngine, GraphEngine, Ja4Engine, PortScannerState, StorylineBuilder, GeoIpService, ThreatIntelState};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// One set of engines shared by capture and all read commands. Construction does
/// not open an interface, spawn a worker, probe a host, or fetch an external feed.
pub struct BackendState {
    pub capture: Mutex<CaptureEngine>,
    capture_worker: Arc<crate::services::NpcapCapture>,
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

#[cfg(test)]
mod capture_shutdown_tests {
    use super::*;

    #[test]
    fn passive_shutdown_is_independent_of_the_capture_command_mutex() {
        let state = Arc::new(BackendState::new(Err("synthetic storage unavailable".into())));
        let command = state.capture.lock().unwrap();
        let worker = state.clone();
        let (done, completed) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || { done.send(worker.shutdown_capture()).unwrap(); });
        let result = completed.recv_timeout(std::time::Duration::from_millis(500));
        drop(command);
        thread.join().unwrap();
        assert!(result.unwrap());
    }
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
        let capture_worker = capture.worker_handle();
        let (sqlite_path, storage_error) = match storage {
            Ok(path) => (Some(path), None),
            Err(error) => (None, Some(error)),
        };
        Self {
            capture: Mutex::new(capture), capture_worker, flows, detections, ja4, graph, storylines,
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

    /// Independent of the command mutex: even an in-flight stop/start cannot
    /// prevent the exit path from requesting worker cancellation and final flush.
    pub fn shutdown_capture(&self) -> bool {
        self.capture_worker.stop_and_wait(std::time::Duration::from_secs(2))
    }
}

use crate::models::{CaptureMetrics, CaptureState, NpcapInterface, PacketMetadata};
use crate::platform::capture::inspect_packet_capture;
use crate::services::NpcapCapture;
use crate::services::StorylineBuilder;
use crate::services::detection_engine::DetectionEngine;
use crate::services::flow_engine::FlowEngine;
use crate::services::graph_engine::GraphEngine;
use crate::services::ja4_engine::Ja4Engine;
use pcap::Device;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct CaptureEngine {
    state: Arc<Mutex<CaptureState>>,
    capture: Arc<NpcapCapture>,
    lifecycle_operation: Arc<Mutex<()>>,
}

impl CaptureEngine {
    pub fn new(
        flow_engine: Arc<Mutex<FlowEngine>>,
        ja4_engine: Arc<Mutex<Ja4Engine>>,
        detection_engine: Arc<Mutex<DetectionEngine>>,
        graph_engine: Arc<Mutex<GraphEngine>>,
        storyline_builder: Arc<Mutex<StorylineBuilder>>,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(CaptureState::STOPPED)),
            capture: Arc::new(NpcapCapture::new(
                flow_engine,
                ja4_engine,
                detection_engine,
                graph_engine,
                storyline_builder,
            )),
            lifecycle_operation: Arc::new(Mutex::new(())),
        }
    }

    pub fn inspect_availability(&self) -> (String, String) {
        let capability = inspect_packet_capture();
        (if capability.available { "AVAILABLE" } else { "UNAVAILABLE" }.into(), capability.reason)
    }

    pub fn get_interfaces(&self) -> Vec<NpcapInterface> {
        match Device::list() {
            Ok(devices) => devices
                .into_iter()
                .map(|dev| {
                    let description = dev
                        .desc
                        .clone()
                        .unwrap_or_else(|| dev.name.clone());
                    let is_loopback = dev.name.to_lowercase().contains("loopback")
                        || description.to_lowercase().contains("loopback");
                    NpcapInterface {
                        id: dev.name.clone(),
                        name: description.clone(),
                        description,
                        ipv4_addresses: Vec::new(),
                        ipv6_addresses: Vec::new(),
                        mac_address: String::new(),
                        is_loopback,
                    }
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn get_state(&self) -> CaptureState {
        self.state.lock().unwrap().clone()
    }

    pub fn active_interface(&self) -> Option<String> {
        self.capture.active_iface.lock().unwrap().clone()
    }

    pub fn start_capture(&self, interface_id: String, app_handle: AppHandle) -> Result<(), String> {
        // Serialize start/stop transitions. In particular, do not allow a
        // restart to race the previous worker's final flush.
        let _operation = self.lifecycle_operation.lock().unwrap();
        {
            let mut st = self.state.lock().unwrap();
            if *st == CaptureState::RUNNING {
                return Ok(());
            }
            if *st == CaptureState::STARTING || *st == CaptureState::STOPPING {
                return Err(format!("Capture is currently {:?}", *st));
            }
            *st = CaptureState::STARTING;
        }

        if self.capture.worker_running() {
            *self.state.lock().unwrap() = CaptureState::ERROR;
            return Err("Previous capture worker is still stopping".into());
        }
        let (avail, msg) = self.inspect_availability();
        if avail != "AVAILABLE" {
            *self.state.lock().unwrap() = CaptureState::ERROR;
            let _ = app_handle.emit("capture-status", "ERROR");
            return Err(msg);
        }

        if let Err(err) = self.capture.open_interface(&interface_id) {
            self.capture.close();
            let mut st = self.state.lock().unwrap();
            *st = CaptureState::ERROR;
            let _ = app_handle.emit("capture-status", "ERROR");
            return Err(format!("Failed to open capture interface: {}", err));
        }

        if !self.capture.run_capture_loop(app_handle.clone()) {
            self.capture.close();
            *self.state.lock().unwrap() = CaptureState::ERROR;
            let _ = app_handle.emit("capture-status", "ERROR");
            return Err("Capture worker is already running".to_string());
        }
        *self.state.lock().unwrap() = CaptureState::RUNNING;
        let _ = app_handle.emit("capture-status", "RUNNING");
        Ok(())
    }

    pub fn stop_capture(&self, app_handle: AppHandle) {
        let _operation = self.lifecycle_operation.lock().unwrap();
        {
            let mut st = self.state.lock().unwrap();
            if *st == CaptureState::STOPPED {
                return;
            }
            *st = CaptureState::STOPPING;
        }

        let stopped = self.capture.stop_and_wait(Duration::from_secs(2));

        {
            let mut st = self.state.lock().unwrap();
            *st = if stopped { CaptureState::STOPPED } else { CaptureState::ERROR };
        }

        let _ = app_handle.emit("capture-status", if stopped { "STOPPED" } else { "ERROR" });
    }

    pub fn get_metrics(&self) -> CaptureMetrics {
        let st = self.get_state();
        self.capture.get_metrics(&format!("{:?}", st))
    }

    pub fn get_recent_packets(&self, limit: usize) -> Vec<PacketMetadata> {
        self.capture.get_recent_packets(limit)
    }

    pub fn get_engine_state(&self) -> (CaptureState, Option<String>, u64, u64, u64, bool) {
        let state = self.get_state();
        let iface = self.active_interface();
        let packets = *self.capture.packets_captured.lock().unwrap();
        let bytes = *self.capture.bytes_captured.lock().unwrap();
        let duration = self
            .capture
            .start_time
            .lock()
            .unwrap()
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0);
        let handle_open = self.capture.worker_running()
            || self.capture.capture_handle.lock().unwrap().is_some();
        (state, iface, packets, bytes, duration, handle_open)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::StorylineBuilder;

    #[test]
    fn test_capture_engine_initialization() {
        let flow_engine = Arc::new(Mutex::new(FlowEngine::new()));
        let ja4_engine = Arc::new(Mutex::new(Ja4Engine::new()));
        let detection_engine = Arc::new(Mutex::new(DetectionEngine::new()));
        let graph_engine = Arc::new(Mutex::new(GraphEngine::new()));
        let storyline_builder = Arc::new(Mutex::new(StorylineBuilder::new()));

        let engine = CaptureEngine::new(
            flow_engine,
            ja4_engine,
            detection_engine,
            graph_engine,
            storyline_builder,
        );

        assert_eq!(engine.get_state(), CaptureState::STOPPED);
        let metrics = engine.get_metrics();
        assert_eq!(metrics.packets_captured, 0);
        assert_eq!(metrics.bytes_captured, 0);
    }
}

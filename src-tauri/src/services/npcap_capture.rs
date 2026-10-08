use crate::models::PacketMetadata;
use crate::models::{DnsQueryEntry};
use crate::services::packet_parser::parse_raw_packet;
use crate::services::{DetectionEngine, FlowEngine, GraphEngine, Ja4Engine, StorylineBuilder};
use pcap::{Active, Capture, Device, Error as PcapError};
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct NpcapCapture {
    pub active_iface: Arc<Mutex<Option<String>>>,
    pub capture_handle: Arc<Mutex<Option<Capture<Active>>>>,
    pub packets_captured: Arc<Mutex<u64>>,
    pub bytes_captured: Arc<Mutex<u64>>,
    pub dropped_packets: Arc<Mutex<u64>>,
    pub last_packet_timestamp: Arc<Mutex<Option<String>>>,
    pub start_time: Arc<Mutex<Option<Instant>>>,
    pub recent_packets: Arc<Mutex<VecDeque<PacketMetadata>>>,
    pub dns_pending: Arc<Mutex<Vec<DnsQueryEntry>>>,
    pub flow_engine: Arc<Mutex<FlowEngine>>,
    pub ja4_engine: Arc<Mutex<Ja4Engine>>,
    pub detection_engine: Arc<Mutex<DetectionEngine>>,
    pub graph_engine: Arc<Mutex<GraphEngine>>,
    pub storyline_builder: Arc<Mutex<StorylineBuilder>>,
    pub persist_interval_ms: u64,
    worker_lifecycle: Arc<(Mutex<WorkerLifecycle>, Condvar)>,
}

#[derive(Debug, Default)]
struct WorkerLifecycle {
    generation: u64,
    running: bool,
    stop_requested: bool,
}

impl NpcapCapture {
    pub fn new(
        flow_engine: Arc<Mutex<FlowEngine>>,
        ja4_engine: Arc<Mutex<Ja4Engine>>,
        detection_engine: Arc<Mutex<DetectionEngine>>,
        graph_engine: Arc<Mutex<GraphEngine>>,
        storyline_builder: Arc<Mutex<StorylineBuilder>>,
    ) -> Self {
        Self {
            active_iface: Arc::new(Mutex::new(None)),
            capture_handle: Arc::new(Mutex::new(None)),
            packets_captured: Arc::new(Mutex::new(0)),
            bytes_captured: Arc::new(Mutex::new(0)),
            dropped_packets: Arc::new(Mutex::new(0)),
            last_packet_timestamp: Arc::new(Mutex::new(None)),
            start_time: Arc::new(Mutex::new(None)),
            recent_packets: Arc::new(Mutex::new(VecDeque::with_capacity(500))),
            dns_pending: Arc::new(Mutex::new(Vec::with_capacity(64))),
            flow_engine,
            ja4_engine,
            detection_engine,
            graph_engine,
            storyline_builder,
            persist_interval_ms: 15_000,
            worker_lifecycle: Arc::new((Mutex::new(WorkerLifecycle::default()), Condvar::new())),
        }
    }

    pub fn list_interfaces(&self) -> Vec<String> {
        match Device::list() {
            Ok(devs) => devs.into_iter().map(|d| d.name).collect(),
            Err(_) => vec![],
        }
    }

    pub fn open_interface(&self, iface_name: &str) -> Result<(), PcapError> {
        // Keep admission closed through opening: a timed-out worker still owns
        // its capture and may still be persisting its final batch.
        let state = self.worker_lifecycle.0.lock().unwrap();
        if state.running {
            return Err(PcapError::PcapError("Previous capture worker has not finished".into()));
        }
        let capture = Capture::from_device(iface_name)?
            .promisc(false)
            .snaplen(65535)
            .timeout(100)
            .open()?
            .setnonblock()?;
        Self::validate_datalink(capture.get_datalink())?;
        let mut lock = self.capture_handle.lock().unwrap();
        *lock = Some(capture);
        let mut active = self.active_iface.lock().unwrap();
        *active = Some(iface_name.to_string());
        *self.start_time.lock().unwrap() = Some(Instant::now());
        Ok(())
    }

    fn validate_datalink(link: pcap::Linktype) -> Result<(), PcapError> {
        if link != pcap::Linktype::ETHERNET {
            return Err(PcapError::PcapError(format!("Unsupported capture datalink {:?}; Ethernet is required", link)));
        }
        Ok(())
    }

    pub fn worker_running(&self) -> bool {
        self.worker_lifecycle.0.lock().unwrap().running
    }

    pub fn read_packet(&self) -> Result<Option<(Vec<u8>, String)>, PcapError> {
        let mut lock = self.capture_handle.lock().unwrap();
        if let Some(ref mut capture) = *lock {
            match capture.next_packet() {
                Ok(packet) => {
                    let ts = chrono::Utc::now().to_rfc3339();
                    Ok(Some((packet.data.to_vec(), ts)))
                }
                Err(PcapError::TimeoutExpired) => Ok(None),
                Err(err) => Err(err),
            }
        } else {
            Ok(None)
        }
    }

    pub fn close(&self) {
        let (lifecycle_lock, _) = &*self.worker_lifecycle;
        let mut state = lifecycle_lock.lock().unwrap();
        state.stop_requested = true;
        let mut lock = self.capture_handle.lock().unwrap();
        *lock = None;
        *self.active_iface.lock().unwrap() = None;
        *self.start_time.lock().unwrap() = None;
    }

    /// Request the worker to stop and wait for it to finish. The timeout is
    /// deliberate: a broken capture backend must not block command handling
    /// forever, and a timed-out worker is prevented from being restarted by
    /// `begin_worker` until it eventually reports completion.
    pub fn stop_and_wait(&self, timeout: Duration) -> bool {
        self.close();
        let (lifecycle_lock, done) = &*self.worker_lifecycle;
        let guard = lifecycle_lock.lock().unwrap();
        if !guard.running {
            return true;
        }
        let (guard, _) = done
            .wait_timeout_while(guard, timeout, |state| state.running)
            .unwrap();
        !guard.running
    }

    fn begin_worker(&self) -> Option<(u64, Capture<Active>)> {
        let (lifecycle_lock, _) = &*self.worker_lifecycle;
        let mut state = lifecycle_lock.lock().unwrap();
        if state.running {
            return None;
        }
        let capture = self.capture_handle.lock().unwrap().take()?;
        state.generation = state.generation.wrapping_add(1);
        state.running = true;
        state.stop_requested = false;
        Some((state.generation, capture))
    }

    fn worker_should_stop(lifecycle: &(Mutex<WorkerLifecycle>, Condvar), generation: u64) -> bool {
        let state = lifecycle.0.lock().unwrap();
        state.generation != generation || state.stop_requested
    }

    fn finish_worker(lifecycle: &(Mutex<WorkerLifecycle>, Condvar), generation: u64) {
        let mut state = lifecycle.0.lock().unwrap();
        if state.generation == generation {
            state.running = false;
            state.stop_requested = false;
            lifecycle.1.notify_all();
        }
    }
    pub fn update_stats(&self, packet_len: usize) {
        let mut pkts = self.packets_captured.lock().unwrap();
        *pkts += 1;
        let mut bytes = self.bytes_captured.lock().unwrap();
        *bytes += packet_len as u64;
        let mut last_ts = self.last_packet_timestamp.lock().unwrap();
        *last_ts = Some(chrono::Utc::now().to_rfc3339());
    }

    pub fn get_metrics(&self, status: &str) -> crate::models::CaptureMetrics {
        let packets = *self.packets_captured.lock().unwrap();
        let bytes = *self.bytes_captured.lock().unwrap();
        let dropped = *self.dropped_packets.lock().unwrap();
        let duration_secs = self
            .start_time
            .lock()
            .unwrap()
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0);
        let pps = if duration_secs > 0 { packets as f64 / duration_secs as f64 } else { 0.0 };
        let bps = if duration_secs > 0 { bytes as f64 / duration_secs as f64 } else { 0.0 };
        crate::models::CaptureMetrics {
            status: status.to_string(),
            selected_interface: self.active_iface.lock().unwrap().clone().unwrap_or_else(|| "".to_string()),
            packets_captured: packets,
            bytes_captured: bytes,
            packets_per_sec: pps,
            bytes_per_sec: bps,
            dropped_packets: dropped,
            duration_secs,
        }
    }

    pub fn run_capture_loop(&self, app_handle: AppHandle) -> bool {
        let Some((worker_generation, mut capture)) = self.begin_worker() else {
            return false;
        };
        let worker_lifecycle = self.worker_lifecycle.clone();
        let active_iface_clone = self.active_iface.clone();
        let packets_captured = self.packets_captured.clone();
        let bytes_captured = self.bytes_captured.clone();
        let dropped_packets = self.dropped_packets.clone();
        let last_packet_timestamp = self.last_packet_timestamp.clone();
        let start_time = self.start_time.clone();
        let recent_packets = self.recent_packets.clone();
        let dns_pending = self.dns_pending.clone();
        let flow_engine = self.flow_engine.clone();
        let ja4_engine = self.ja4_engine.clone();
        let detection_engine = self.detection_engine.clone();
        let graph_engine = self.graph_engine.clone();
        let storyline_builder = self.storyline_builder.clone();
        let persist_interval_ms = self.persist_interval_ms;

        enum LoopEvent {
            Stats(crate::models::CaptureMetrics),
            Flows(Vec<crate::models::FlowRecord>),
            Graph(crate::models::AttackGraph),
            Ja4(crate::models::Ja4Observation),
            Detection(crate::models::DetectionFinding),
            Persisted(usize),
        }

        let (tx, rx) = std::sync::mpsc::sync_channel::<LoopEvent>(128);
        tauri::async_runtime::spawn_blocking(move || {
            loop {
                match rx.recv() {
                    Ok(LoopEvent::Stats(m)) => {
                        let _ = app_handle.emit("capture-stats", m);
                    }
                    Ok(LoopEvent::Flows(f)) => {
                        let _ = app_handle.emit("capture-flows", f);
                    }
                    Ok(LoopEvent::Graph(g)) => {
                        let _ = app_handle.emit("graph-updated", g);
                    }
                    Ok(LoopEvent::Ja4(j)) => {
                        let _ = app_handle.emit("ja4-stream", j);
                    }
                    Ok(LoopEvent::Detection(d)) => {
                        let _ = app_handle.emit("detection-created", d);
                    }
                    Ok(LoopEvent::Persisted(n)) => {
                        let _ = app_handle.emit("capture-persisted", n);
                    }
                    Err(_) => break,
                }
            }
        });

        tauri::async_runtime::spawn_blocking(move || {
            let mut packet_count: u64 = 0;
            let mut last_stats_emit = Instant::now();
            let mut last_stats_bytes = *bytes_captured.lock().unwrap();
            let mut last_persist = Instant::now();
            let mut last_flow_emit = Instant::now();
            let mut emitted_findings: std::collections::HashSet<String> = std::collections::HashSet::new();

            loop {
                if NpcapCapture::worker_should_stop(&worker_lifecycle, worker_generation) {
                    break;
                }

                let packet_data = match capture.next_packet() {
                    Ok(packet) => Some((packet.data.to_vec(), chrono::Utc::now().to_rfc3339())),
                    Err(PcapError::TimeoutExpired) => None,
                    Err(err) => {
                        tracing::warn!("Transient packet capture error: {}", err);
                        None
                    }
                };

                if let Some((data, timestamp)) = packet_data {
                    packet_count += 1;
                    *packets_captured.lock().unwrap() += 1;
                    *bytes_captured.lock().unwrap() += data.len() as u64;
                    *last_packet_timestamp.lock().unwrap() = Some(timestamp.clone());

                    let metadata = parse_raw_packet(&data, &timestamp);
                    let flow_record = flow_engine.lock().unwrap().ingest_packet(&metadata);

                    if let Some(ref qname) = metadata.dns_qname {
                        if !qname.is_empty() {
                            let mut pending = dns_pending.lock().unwrap();
                            if pending.len() >= 256 {
                                pending.clear();
                            }
                            pending.push(DnsQueryEntry {
                                timestamp: timestamp.clone(),
                                client_ip: metadata.src_ip.clone(),
                                server_ip: metadata.dst_ip.clone(),
                                qname: qname.clone(),
                                qtype: metadata.dns_qtype.clone(),
                                rcode: metadata.dns_rcode,
                                answers: metadata.dns_answers,
                            });
                        }
                    }

                    {
                        let mut queue = recent_packets.lock().unwrap();
                        if queue.len() >= 500 {
                            queue.pop_front();
                        }
                        queue.push_back(metadata.clone());
                    }

                    if metadata.protocol == "TCP" {
                        if let Some(l4) = crate::services::packet_parser::l4_payload(&data) {
                            if let Some(ja4_obs) = ja4_engine.lock().unwrap().process_packet(&metadata, l4, &flow_record.flow_id) {
                                flow_engine.lock().unwrap().attach_ja4_to_flow(&flow_record.flow_id, ja4_obs.fingerprint.clone());
                                graph_engine.lock().unwrap().ingest_ja4(&ja4_obs);
                                let _ = tx.try_send(LoopEvent::Ja4(ja4_obs.clone()));
                            }
                        }
                    }

                    let detections = detection_engine.lock().unwrap().evaluate_flow(&flow_record);
                    for finding in detections {
                        if emitted_findings.insert(finding.finding_id.clone()) {
                            graph_engine.lock().unwrap().ingest_finding(&finding);
                            let related_flows = flow_engine.lock().unwrap().get_recent_flows(500);
                            let observations = ja4_engine.lock().unwrap().get_observations(500);
                            storyline_builder.lock().unwrap().build_storyline_from_finding(&finding, &related_flows, &observations);
                            let _ = tx.try_send(LoopEvent::Detection(finding.clone()));
                        }
                    }

                    graph_engine.lock().unwrap().ingest_flow(&flow_record);

                    // Batched active-flow event (5s)
                    if last_flow_emit.elapsed() >= Duration::from_secs(5) {
                        let flows = flow_engine.lock().unwrap().get_active_flows(50);
                        let _ = tx.try_send(LoopEvent::Flows(flows));
                        let _ = tx.try_send(LoopEvent::Graph(graph_engine.lock().unwrap().get_graph()));
                        last_flow_emit = Instant::now();
                    }

                } else {
                    std::thread::sleep(Duration::from_millis(100));
                }

                // Persist on idle interfaces too; retain failed batches.
                if last_persist.elapsed() >= Duration::from_millis(persist_interval_ms) {
                    let flows = flow_engine.lock().unwrap().flush_flows();
                    if !flows.is_empty() {
                        if let Err(err) = crate::database::duckdb::persist_flow_records(&flows) {
                            tracing::warn!("⚠️ Batched flow persistence failed: {}", err);
                            flow_engine.lock().unwrap().reinsert_retry(flows);
                        } else {
                            let _ = tx.try_send(LoopEvent::Persisted(flows.len()));
                        }
                    }
                    let dns = std::mem::take(&mut *dns_pending.lock().unwrap());
                    if !dns.is_empty() {
                        crate::database::sqlite::insert_dns_records_batch(&dns);
                    }
                    last_persist = Instant::now();
                }

                // Emit real window rates even while the interface is idle.
                let elapsed = last_stats_emit.elapsed().as_secs_f64();
                if elapsed >= 1.0 {
                    let packets = *packets_captured.lock().unwrap();
                    let bytes = *bytes_captured.lock().unwrap();
                    let dropped = *dropped_packets.lock().unwrap();
                    let duration_secs = start_time.lock().unwrap().map(|t| t.elapsed().as_secs()).unwrap_or(0);
                    let selected = active_iface_clone.lock().unwrap().clone().unwrap_or_default();
                    let metrics = crate::models::CaptureMetrics {
                        status: "RUNNING".into(), selected_interface: selected,
                        packets_captured: packets, bytes_captured: bytes,
                        packets_per_sec: packet_count as f64 / elapsed,
                        bytes_per_sec: bytes.saturating_sub(last_stats_bytes) as f64 / elapsed,
                        dropped_packets: dropped, duration_secs,
                    };
                    let _ = tx.try_send(LoopEvent::Stats(metrics));
                    packet_count = 0;
                    last_stats_bytes = bytes;
                    last_stats_emit = Instant::now();
                }

                std::thread::yield_now();
            }

            // Final flush on stop
            let flows = flow_engine.lock().unwrap().flush_flows();
            if !flows.is_empty() {
                if let Err(err) = crate::database::duckdb::persist_flow_records(&flows) {
                    tracing::warn!("⚠️ Final flow persistence failed: {}", err);
                    flow_engine.lock().unwrap().reinsert_retry(flows);
                }
            }
            let dns = std::mem::take(&mut *dns_pending.lock().unwrap());
            if !dns.is_empty() {
                crate::database::sqlite::insert_dns_records_batch(&dns);
            }
            drop(capture);
            NpcapCapture::finish_worker(&worker_lifecycle, worker_generation);
        });
        true
    }

    pub fn get_recent_packets(&self, limit: usize) -> Vec<PacketMetadata> {
        let queue = self.recent_packets.lock().unwrap();
        let limit = limit.min(500);
        queue.iter().rev().take(limit).cloned().collect()
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    fn capture() -> NpcapCapture {
        NpcapCapture::new(
            Arc::new(Mutex::new(FlowEngine::new())),
            Arc::new(Mutex::new(Ja4Engine::new())),
            Arc::new(Mutex::new(DetectionEngine::new())),
            Arc::new(Mutex::new(GraphEngine::new())),
            Arc::new(Mutex::new(StorylineBuilder::new())),
        )
    }

    #[test]
    fn timed_out_worker_blocks_open_until_final_work_completes() {
        let capture = capture();
        let generation = 42;
        {
            let mut state = capture.worker_lifecycle.0.lock().unwrap();
            state.generation = generation;
            state.running = true;
        }
        assert!(!capture.stop_and_wait(Duration::from_millis(1)));
        // Must reject before ever asking pcap to open a device.
        let error = capture.open_interface("not-a-real-device").unwrap_err();
        assert!(error.to_string().contains("Previous capture worker"));
        assert!(capture.begin_worker().is_none());
        assert!(capture.worker_running());
        // Completion belongs after final persistence, not after stop request.
        NpcapCapture::finish_worker(&capture.worker_lifecycle, generation);
        assert!(capture.stop_and_wait(Duration::ZERO));
        assert!(!capture.worker_running());
    }

    #[test]
    fn start_without_handle_does_not_mark_worker_running() {
        let capture = capture();
        assert!(capture.begin_worker().is_none());
        assert!(!capture.worker_running());
    }

    #[test]
    fn rejects_non_ethernet_datalinks() {
        assert!(NpcapCapture::validate_datalink(pcap::Linktype::ETHERNET).is_ok());
        for link in [pcap::Linktype(0), pcap::Linktype(101), pcap::Linktype(113)] {
            assert!(NpcapCapture::validate_datalink(link).is_err());
        }
    }

    #[test]
    fn worker_generation_invalidates_finished_worker() {
        let lifecycle = Arc::new((Mutex::new(WorkerLifecycle::default()), Condvar::new()));
        let first = {
            let state = lifecycle.0.lock().unwrap();
            assert!(!state.running);
            drop(state);
            let mut state = lifecycle.0.lock().unwrap();
            state.generation += 1;
            state.running = true;
            state.generation
        };

        assert!(lifecycle.0.lock().unwrap().running);
        NpcapCapture::finish_worker(&lifecycle, first);
        assert!(!lifecycle.0.lock().unwrap().running);

        let second = {
            let mut state = lifecycle.0.lock().unwrap();
            state.generation += 1;
            state.running = true;
            state.generation
        };
        assert_ne!(first, second);
        assert!(NpcapCapture::worker_should_stop(&lifecycle, first));
        NpcapCapture::finish_worker(&lifecycle, first);
        assert!(lifecycle.0.lock().unwrap().running);
        NpcapCapture::finish_worker(&lifecycle, second);
    }

    #[test]
    fn stop_request_is_observed_without_waiting_for_capture_backend() {
        let lifecycle = Arc::new((Mutex::new(WorkerLifecycle::default()), Condvar::new()));
        let generation = {
            let mut state = lifecycle.0.lock().unwrap();
            state.generation = 7;
            state.running = true;
            state.generation
        };
        lifecycle.0.lock().unwrap().stop_requested = true;
        assert!(NpcapCapture::worker_should_stop(&lifecycle, generation));
        NpcapCapture::finish_worker(&lifecycle, generation);
        assert!(!lifecycle.0.lock().unwrap().running);
    }
}

use crate::models::DnsQueryEntry;
use crate::models::PacketMetadata;
use crate::services::packet_parser::parse_raw_packet;
use crate::services::{DetectionEngine, FlowEngine, GraphEngine, Ja4Engine, StorylineBuilder};
use pcap::Error as PcapError;
#[cfg(not(target_os = "linux"))]
use pcap::{Active, Capture};
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct NpcapCapture {
    pub active_iface: Arc<Mutex<Option<String>>>,
    pub(crate) capture_handle: Arc<Mutex<Option<CaptureSource>>>,
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
    error: Option<String>,
}

pub(crate) enum CaptureSource {
    #[cfg(not(target_os = "linux"))]
    Native(Capture<Active>),
    #[cfg(target_os = "linux")]
    Helper(crate::services::capture_helper::HelperCapture),
    #[cfg(test)]
    Fixture(VecDeque<Result<(Vec<u8>, String), PcapError>>),
}

impl CaptureSource {
    fn next_packet(&mut self) -> Result<(Vec<u8>, String), PcapError> {
        match self {
            #[cfg(target_os = "linux")]
            Self::Helper(capture) => capture.next_packet(),
            #[cfg(not(target_os = "linux"))]
            Self::Native(capture) => {
                let packet = capture.next_packet()?;
                let timestamp = chrono::DateTime::from_timestamp(packet.header.ts.tv_sec as i64,
                    packet.header.ts.tv_usec as u32 * 1000).ok_or_else(|| PcapError::PcapError("Invalid capture timestamp".into()))?;
                Ok((packet.data.to_vec(), timestamp.to_rfc3339()))
            }
            #[cfg(test)]
            Self::Fixture(packets) => packets.pop_front().unwrap_or(Err(PcapError::TimeoutExpired)),
        }
    }
}

enum LoopEvent {
    Stats(crate::models::CaptureMetrics),
    Flows(Vec<crate::models::FlowRecord>),
    Summary(crate::models::FlowSummaryStats),
    Graph(crate::models::AttackGraph),
    Ja4(crate::models::Ja4Observation),
    Detection(crate::models::DetectionFinding),
    Persisted(usize),
    Status(&'static str),
}

struct WorkerCompletion {
    lifecycle: Arc<(Mutex<WorkerLifecycle>, Condvar)>,
    generation: u64,
}

impl Drop for WorkerCompletion {
    fn drop(&mut self) {
        let mut state = self.lifecycle.0.lock().unwrap_or_else(|e| e.into_inner());
        if state.generation == self.generation && state.running {
            state.running = false;
            state.error = Some("Native capture worker exited unexpectedly".into());
            self.lifecycle.1.notify_all();
        }
    }
}

struct FlowSnapshot {
    flows: Vec<crate::models::FlowRecord>,
    summary: crate::models::FlowSummaryStats,
    graph: crate::models::AttackGraph,
}

struct FlowEventCadence {
    last_emit: Instant,
}

impl FlowEventCadence {
    fn new(now: Instant) -> Self {
        Self { last_emit: now }
    }

    // Driven by worker time, not packet arrival. Missed intervals produce one
    // current snapshot rather than an unbounded catch-up burst.
    fn snapshot_if_due(
        &mut self,
        now: Instant,
        flows: &Mutex<FlowEngine>,
        graph: &Mutex<GraphEngine>,
    ) -> Option<FlowSnapshot> {
        if now.duration_since(self.last_emit) < Duration::from_secs(5) {
            return None;
        }
        self.last_emit = now;
        let engine = flows.lock().unwrap();
        let snapshot_flows = engine.get_active_flows(50);
        let summary = engine.get_summary_stats();
        drop(engine);
        Some(FlowSnapshot {
            flows: snapshot_flows,
            summary,
            graph: graph.lock().unwrap().get_graph(),
        })
    }
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
        match crate::platform::capture::devices() {
            Ok(devs) => devs.into_iter().map(|d| d.name).collect(),
            Err(_) => vec![],
        }
    }

    pub fn open_interface(&self, iface_name: &str) -> Result<(), PcapError> {
        self.open_filtered_interface(iface_name, "")
    }

    pub fn open_filtered_interface(&self, iface_name: &str, filter: &str) -> Result<(), PcapError> {
        crate::platform::capture::ensure_capture_runtime().map_err(PcapError::PcapError)?;
        if filter.len() > 2048 { return Err(PcapError::PcapError("Capture filter exceeds 2048 bytes".into())); }
        // Keep admission closed through opening: a timed-out worker still owns
        // its capture and may still be persisting its final batch.
        let state = self.worker_lifecycle.0.lock().unwrap();
        if state.running {
            return Err(PcapError::PcapError(
                "Previous capture worker has not finished".into(),
            ));
        }
        #[cfg(not(target_os = "linux"))]
        let capture = Capture::from_device(iface_name)?
            .promisc(false)
            .snaplen(65535)
            .timeout(100)
            .open()?
            .setnonblock()?;
        #[cfg(not(target_os = "linux"))]
        let capture = {
            let mut capture = capture;
            if !filter.is_empty() { capture.filter(filter, true)?; }
            Self::validate_datalink(capture.get_datalink())?;
            CaptureSource::Native(capture)
        };
        #[cfg(target_os = "linux")]
        let capture = {
            let helper = crate::services::capture_helper::HelperCapture::open(iface_name, filter)?;
            Self::validate_datalink(helper.datalink())?;
            CaptureSource::Helper(helper)
        };
        self.reset_recording();
        let mut lock = self.capture_handle.lock().unwrap();
        *lock = Some(capture);
        let mut active = self.active_iface.lock().unwrap();
        *active = Some(iface_name.to_string());
        Ok(())
    }

    fn reset_recording(&self) {
        *self.packets_captured.lock().unwrap() = 0;
        *self.bytes_captured.lock().unwrap() = 0;
        *self.dropped_packets.lock().unwrap() = 0;
        *self.last_packet_timestamp.lock().unwrap() = None;
        self.recent_packets.lock().unwrap().clear();
        self.detection_engine.lock().unwrap().reset_window();
        *self.start_time.lock().unwrap() = Some(Instant::now());
    }

    pub fn worker_error(&self) -> Option<String> {
        self.worker_lifecycle.0.lock().unwrap().error.clone()
    }

    fn validate_datalink(link: pcap::Linktype) -> Result<(), PcapError> {
        if link != pcap::Linktype::ETHERNET {
            return Err(PcapError::PcapError(format!(
                "Unsupported capture datalink {:?}; Ethernet is required",
                link
            )));
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
                Ok(packet) => Ok(Some(packet)),
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
        let deadline = Instant::now() + timeout;
        self.close();
        let (lifecycle_lock, done) = &*self.worker_lifecycle;
        let guard = lifecycle_lock.lock().unwrap();
        if !guard.running {
            return true;
        }
        let (guard, _) = done
            .wait_timeout_while(guard, deadline.saturating_duration_since(Instant::now()), |state| state.running)
            .unwrap();
        !guard.running
    }

    fn begin_worker(&self) -> Option<(u64, CaptureSource)> {
        let (lifecycle_lock, _) = &*self.worker_lifecycle;
        let mut state = lifecycle_lock.lock().unwrap();
        if state.running {
            return None;
        }
        let capture = self.capture_handle.lock().unwrap().take()?;
        state.generation = state.generation.wrapping_add(1);
        state.running = true;
        state.stop_requested = false;
        state.error = None;
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
        let pps = if status == "RUNNING" && duration_secs > 0 {
            packets as f64 / duration_secs as f64
        } else {
            0.0
        };
        let bps = if status == "RUNNING" && duration_secs > 0 {
            bytes as f64 / duration_secs as f64
        } else {
            0.0
        };
        crate::models::CaptureMetrics {
            status: status.to_string(),
            selected_interface: self
                .active_iface
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| "".to_string()),
            packets_captured: packets,
            bytes_captured: bytes,
            packets_per_sec: pps,
            bytes_per_sec: bps,
            dropped_packets: dropped,
            duration_secs,
        }
    }

    pub fn run_capture_loop(&self, app_handle: AppHandle) -> bool {
        self.start_worker(move |event| match event {
            LoopEvent::Stats(m) => { let _ = app_handle.emit("capture-stats", m); }
            LoopEvent::Flows(f) => { let _ = app_handle.emit("capture-flows", f); }
            LoopEvent::Summary(s) => { let _ = app_handle.emit("flow-summary", s); }
            LoopEvent::Graph(g) => { let _ = app_handle.emit("graph-updated", g); }
            LoopEvent::Ja4(j) => { let _ = app_handle.emit("ja4-stream", j); }
            LoopEvent::Detection(d) => { let _ = app_handle.emit("detection-created", d); }
            LoopEvent::Persisted(n) => { let _ = app_handle.emit("capture-persisted", n); }
            LoopEvent::Status(s) => { let _ = app_handle.emit("capture-status", s); }
        }, |flows| crate::database::duckdb::persist_flow_records(flows).map(|_| ()).map_err(|e| e.to_string()),
            crate::database::sqlite::insert_dns_records_batch)
    }

    fn start_worker(&self, emit: impl Fn(LoopEvent) + Send + 'static,
        persist_flows: impl Fn(&[crate::models::FlowRecord]) -> Result<(), String> + Send + 'static,
        persist_dns: impl Fn(&[DnsQueryEntry]) + Send + 'static) -> bool {
        let Some((worker_generation, source)) = self.begin_worker() else {
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

        let (tx, rx) = std::sync::mpsc::sync_channel::<LoopEvent>(128);
        tauri::async_runtime::spawn_blocking(move || {
            while let Ok(event) = rx.recv() { emit(event); }
        });

        tauri::async_runtime::spawn_blocking(move || {
            let _completion = WorkerCompletion { lifecycle: worker_lifecycle.clone(), generation: worker_generation };
            let mut capture = source;
            let mut packet_count: u64 = 0;
            let mut last_stats_emit = Instant::now();
            let mut last_stats_bytes = *bytes_captured.lock().unwrap();
            let mut last_persist = Instant::now();
            let mut flow_cadence = FlowEventCadence::new(Instant::now());
            let mut emitted_findings = VecDeque::new();
            let mut terminal_error = None;

            loop {
                if NpcapCapture::worker_should_stop(&worker_lifecycle, worker_generation) {
                    break;
                }

                let packet_data = match capture.next_packet() {
                    Ok(packet) => Some(packet),
                    Err(PcapError::TimeoutExpired) => None,
                    Err(PcapError::NoMorePackets) => break,
                    Err(err) => {
                        tracing::warn!("Packet capture stopped: {}", err);
                        terminal_error = Some(err.to_string());
                        break;
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
                            if let Some(ja4_obs) = ja4_engine.lock().unwrap().process_packet(
                                &metadata,
                                l4,
                                &flow_record.flow_id,
                            ) {
                                flow_engine.lock().unwrap().attach_ja4_to_flow(
                                    &flow_record.flow_id,
                                    ja4_obs.fingerprint.clone(),
                                );
                                graph_engine.lock().unwrap().ingest_ja4(&ja4_obs);
                                let _ = tx.try_send(LoopEvent::Ja4(ja4_obs.clone()));
                            }
                        }
                    }

                    let detections = detection_engine.lock().unwrap().evaluate_flow(&flow_record);
                    for finding in detections {
                        if !emitted_findings.contains(&finding.finding_id) {
                            if emitted_findings.len() >= 500 { emitted_findings.pop_front(); }
                            emitted_findings.push_back(finding.finding_id.clone());
                            graph_engine.lock().unwrap().ingest_finding(&finding);
                            let related_flows = flow_engine.lock().unwrap().get_recent_flows(500);
                            let observations = ja4_engine.lock().unwrap().get_observations(500);
                            storyline_builder
                                .lock()
                                .unwrap()
                                .build_storyline_from_finding(
                                    &finding,
                                    &related_flows,
                                    &observations,
                                );
                            let _ = tx.try_send(LoopEvent::Detection(finding.clone()));
                        }
                    }

                    graph_engine.lock().unwrap().ingest_flow(&flow_record);
                } else {
                    std::thread::sleep(Duration::from_millis(100));
                }

                // Emit actual bounded snapshots on idle interfaces too.
                if let Some(snapshot) =
                    flow_cadence.snapshot_if_due(Instant::now(), &flow_engine, &graph_engine)
                {
                    let _ = tx.try_send(LoopEvent::Flows(snapshot.flows));
                    let _ = tx.try_send(LoopEvent::Summary(snapshot.summary));
                    let _ = tx.try_send(LoopEvent::Graph(snapshot.graph));
                }

                // Persist on idle interfaces too; retain failed batches.
                if last_persist.elapsed() >= Duration::from_millis(persist_interval_ms)
                    || dns_pending.lock().unwrap().len() >= 256 {
                    let flows = flow_engine.lock().unwrap().flush_flows();
                    if !flows.is_empty() {
                        if let Err(err) = persist_flows(&flows) {
                            tracing::warn!("⚠️ Batched flow persistence failed: {}", err);
                            flow_engine.lock().unwrap().reinsert_retry(flows);
                        } else {
                            let _ = tx.try_send(LoopEvent::Persisted(flows.len()));
                        }
                    }
                    let dns = std::mem::take(&mut *dns_pending.lock().unwrap());
                    if !dns.is_empty() {
                        persist_dns(&dns);
                    }
                    last_persist = Instant::now();
                }

                // Emit real window rates even while the interface is idle.
                let elapsed = last_stats_emit.elapsed().as_secs_f64();
                if elapsed >= 1.0 {
                    let packets = *packets_captured.lock().unwrap();
                    let bytes = *bytes_captured.lock().unwrap();
                    let dropped = *dropped_packets.lock().unwrap();
                    let duration_secs = start_time
                        .lock()
                        .unwrap()
                        .map(|t| t.elapsed().as_secs())
                        .unwrap_or(0);
                    let selected = active_iface_clone
                        .lock()
                        .unwrap()
                        .clone()
                        .unwrap_or_default();
                    let metrics = crate::models::CaptureMetrics {
                        status: "RUNNING".into(),
                        selected_interface: selected,
                        packets_captured: packets,
                        bytes_captured: bytes,
                        packets_per_sec: packet_count as f64 / elapsed,
                        bytes_per_sec: bytes.saturating_sub(last_stats_bytes) as f64 / elapsed,
                        dropped_packets: dropped,
                        duration_secs,
                    };
                    let _ = tx.try_send(LoopEvent::Stats(metrics));
                    packet_count = 0;
                    last_stats_bytes = bytes;
                    last_stats_emit = Instant::now();
                }

                std::thread::yield_now();
            }

            // Release the recorder before potentially slow final persistence.
            drop(capture);
            // Final flush on stop, bounded helper completion, or terminal error.
            let flows = flow_engine.lock().unwrap().flush_flows();
            if !flows.is_empty() {
                if let Err(err) = persist_flows(&flows) {
                    tracing::warn!("⚠️ Final flow persistence failed: {}", err);
                    terminal_error.get_or_insert_with(|| format!("Final flow persistence failed: {err}"));
                    flow_engine.lock().unwrap().reinsert_retry(flows);
                }
            }
            let dns = std::mem::take(&mut *dns_pending.lock().unwrap());
            if !dns.is_empty() {
                persist_dns(&dns);
            }
            let outcome = if terminal_error.is_some() { "ERROR" } else { "STOPPED" };
            worker_lifecycle.0.lock().unwrap().error = terminal_error;
            NpcapCapture::finish_worker(&worker_lifecycle, worker_generation);
            let _ = tx.try_send(LoopEvent::Status(outcome));
        });
        true
    }

    pub fn get_recent_packets(&self, limit: usize) -> Vec<PacketMetadata> {
        let queue = self.recent_packets.lock().unwrap();
        let limit = limit.min(500);
        queue.iter().rev().take(limit).cloned().collect()
    }
}

impl Drop for NpcapCapture {
    fn drop(&mut self) {
        let _ = self.stop_and_wait(Duration::from_secs(2));
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

    fn wait_finished(capture: &NpcapCapture) {
        let deadline = Instant::now() + Duration::from_secs(3);
        while capture.worker_running() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(!capture.worker_running(), "fixture worker did not finish");
    }

    #[test]
    fn terminal_read_error_flushes_once_releases_ownership_and_restart_resets_metrics() {
        let capture = capture();
        let dns = Arc::new(Mutex::new(Vec::new()));
        let flows = Arc::new(Mutex::new(Vec::new()));
        let saved_dns = dns.clone();
        let saved_flows = flows.clone();
        capture.reset_recording();
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(VecDeque::from([
            Ok((crate::services::buddy_engine::tests::dns_packet(), "2026-10-24T00:00:00Z".into())),
            Err(PcapError::PcapError("fixture interface disappeared".into())),
        ])));
        assert!(capture.start_worker(|_| {}, move |batch| { saved_flows.lock().unwrap().extend_from_slice(batch); Ok(()) },
            move |batch| saved_dns.lock().unwrap().extend_from_slice(batch)));
        wait_finished(&capture);
        assert!(capture.worker_error().unwrap().contains("interface disappeared"));
        assert!(capture.capture_handle.lock().unwrap().is_none());
        assert_eq!(capture.get_metrics("ERROR").packets_captured, 1);
        assert_eq!(dns.lock().unwrap().len(), 1);
        assert_eq!(flows.lock().unwrap()[0].packet_count, 1);
        assert_eq!(capture.last_packet_timestamp.lock().unwrap().as_deref(), Some("2026-10-24T00:00:00Z"));

        capture.reset_recording();
        let metrics = capture.get_metrics("STARTING");
        assert_eq!(metrics.packets_captured, 0);
        assert_eq!(metrics.bytes_captured, 0);
        assert_eq!(metrics.packets_per_sec, 0.0);
        assert!(capture.last_packet_timestamp.lock().unwrap().is_none());
        assert!(capture.get_recent_packets(500).is_empty());
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(VecDeque::from([Err(PcapError::NoMorePackets)])));
        assert!(capture.start_worker(|_| {}, |_| Ok(()), |_| {}));
        wait_finished(&capture);
        assert!(capture.worker_error().is_none());
    }

    #[test]
    fn stop_flushes_pending_dns_and_waits_for_final_persistence_before_restart() {
        let capture = capture();
        let dns = Arc::new(Mutex::new(Vec::new()));
        let saved_dns = dns.clone();
        let (entered, received) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel();
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(VecDeque::from([
            Ok((crate::services::buddy_engine::tests::dns_packet(), "fixture".into())),
        ])));
        assert!(capture.start_worker(|_| {}, move |_| {
            entered.send(()).unwrap();
            released.recv_timeout(Duration::from_secs(3)).unwrap();
            Ok(())
        }, move |batch| saved_dns.lock().unwrap().extend_from_slice(batch)));
        let deadline = Instant::now() + Duration::from_secs(2);
        while *capture.packets_captured.lock().unwrap() == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(*capture.packets_captured.lock().unwrap(), 1);
        assert!(!capture.stop_and_wait(Duration::from_millis(5)));
        received.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(capture.open_interface("never-open-this-fixture").unwrap_err().to_string().contains("Previous capture worker"));
        release.send(()).unwrap();
        assert!(capture.stop_and_wait(Duration::from_secs(2)));
        assert_eq!(dns.lock().unwrap().len(), 1);
    }

    #[test]
    fn full_dns_batch_is_persisted_instead_of_discarded() {
        let capture = capture();
        let dns = Arc::new(Mutex::new(Vec::new()));
        let saved = dns.clone();
        let mut packets: VecDeque<_> = (0..257).map(|_| Ok((crate::services::buddy_engine::tests::dns_packet(), "fixture".into()))).collect();
        packets.push_back(Err(PcapError::NoMorePackets));
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(packets));
        assert!(capture.start_worker(|_| {}, |_| Ok(()), move |batch| saved.lock().unwrap().extend_from_slice(batch)));
        wait_finished(&capture);
        assert_eq!(dns.lock().unwrap().len(), 257);
        assert!(capture.dns_pending.lock().unwrap().is_empty());
    }

    #[test]
    fn dropping_capture_owner_cancels_worker_and_flushes_pending_evidence() {
        let capture = capture();
        let lifecycle = capture.worker_lifecycle.clone();
        let dns = Arc::new(Mutex::new(Vec::new()));
        let saved = dns.clone();
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(VecDeque::from([
            Ok((crate::services::buddy_engine::tests::dns_packet(), "fixture".into())),
        ])));
        assert!(capture.start_worker(|_| {}, |_| Ok(()), move |batch| saved.lock().unwrap().extend_from_slice(batch)));
        let deadline = Instant::now() + Duration::from_secs(2);
        while *capture.packets_captured.lock().unwrap() == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(*capture.packets_captured.lock().unwrap(), 1);
        drop(capture);
        assert!(!lifecycle.0.lock().unwrap().running);
        assert_eq!(dns.lock().unwrap().len(), 1);
    }

    #[test]
    fn final_persistence_failure_is_reported_and_evidence_retained() {
        let capture = capture();
        *capture.capture_handle.lock().unwrap() = Some(CaptureSource::Fixture(VecDeque::from([
            Ok((crate::services::buddy_engine::tests::dns_packet(), "fixture".into())),
            Err(PcapError::NoMorePackets),
        ])));
        assert!(capture.start_worker(|_| {}, |_| Err("fixture database unavailable".into()), |_| {}));
        wait_finished(&capture);
        assert!(capture.worker_error().unwrap().contains("Final flow persistence failed"));
        assert_eq!(capture.flow_engine.lock().unwrap().get_active_flows(10).len(), 1);
    }

    #[test]
    fn idle_flow_cadence_emits_empty_real_snapshots_without_catch_up_bursts() {
        let capture = capture();
        let start = Instant::now();
        let mut cadence = FlowEventCadence::new(start);
        let mut snapshot_at = |seconds| {
            cadence.snapshot_if_due(
                start + Duration::from_secs(seconds),
                &capture.flow_engine,
                &capture.graph_engine,
            )
        };
        assert!(snapshot_at(0).is_none());
        assert!(snapshot_at(4).is_none());
        for seconds in [5, 10, 60] {
            let snapshot = snapshot_at(seconds).expect("idle worker tick must emit");
            assert!(snapshot.flows.is_empty());
            assert_eq!(snapshot.summary.active_flows_count, 0);
            assert_eq!(snapshot.summary.total_flows_processed, 0);
            assert!(snapshot.graph.nodes.is_empty());
            assert!(snapshot.graph.edges.is_empty());
            assert!(snapshot_at(seconds).is_none());
            assert!(snapshot_at(seconds + 4).is_none());
        }
        assert!(!capture.worker_running());
        assert!(capture.capture_handle.lock().unwrap().is_none());
    }

    #[test]
    fn idle_snapshot_is_bounded_and_preserves_ingested_packet_totals() {
        let capture = capture();
        let start = Instant::now();
        let mut cadence = FlowEventCadence::new(start);
        let mut ingested = std::collections::HashMap::new();
        // Test-only Ethernet/IPv4/UDP frames exercise the real parser/engines.
        for port in 1000u16..1060 {
            let mut frame = vec![0u8; 42];
            frame[12..14].copy_from_slice(&0x0800u16.to_be_bytes());
            frame[14] = 0x45;
            frame[16..18].copy_from_slice(&28u16.to_be_bytes());
            frame[23] = 17;
            frame[26..30].copy_from_slice(&[192, 0, 2, 1]);
            frame[30..34].copy_from_slice(&[192, 0, 2, 2]);
            frame[34..36].copy_from_slice(&port.to_be_bytes());
            frame[36..38].copy_from_slice(&9000u16.to_be_bytes());
            frame[38..40].copy_from_slice(&8u16.to_be_bytes());
            let packet = parse_raw_packet(&frame, "2026-10-15T00:00:00Z");
            let flow = capture.flow_engine.lock().unwrap().ingest_packet(&packet);
            capture.graph_engine.lock().unwrap().ingest_flow(&flow);
            ingested.insert(flow.flow_id.clone(), flow);
        }
        // No further packets arrive between these worker ticks.
        for seconds in [5, 10] {
            let snapshot = cadence
                .snapshot_if_due(
                    start + Duration::from_secs(seconds),
                    &capture.flow_engine,
                    &capture.graph_engine,
                )
                .unwrap();
            assert_eq!(snapshot.flows.len(), 50);
            assert_eq!(snapshot.summary.active_flows_count, 60);
            assert_eq!(snapshot.summary.total_flows_processed, 60);
            assert_eq!(snapshot.summary.udp_flows_count, 60);
            assert_eq!(snapshot.summary.total_volume_bytes, 60 * 42);
            for flow in snapshot.flows {
                let observed = &ingested[&flow.flow_id];
                assert_eq!(flow.src_port, observed.src_port);
                assert_eq!(flow.packet_count, 1);
                assert_eq!(flow.total_bytes, 42);
            }
            assert_eq!(snapshot.graph.nodes.len(), 62);
            assert_eq!(snapshot.graph.edges.len(), 120);
        }
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

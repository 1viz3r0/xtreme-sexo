use crate::models::TelemetryPayload;
use crate::platform::{get_active_tcp_connections, get_detailed_network_adapters};
use crate::services::FlowEngine;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

pub fn start_telemetry_worker(app_handle: tauri::AppHandle, flow_engine: Arc<Mutex<FlowEngine>>) {
    tauri::async_runtime::spawn(async move {
        let prev_rx = Arc::new(AtomicU64::new(0));
        let prev_tx = Arc::new(AtomicU64::new(0));
        let prev_rx_pkts = Arc::new(AtomicU64::new(0));
        let prev_tx_pkts = Arc::new(AtomicU64::new(0));
        let mut last_sample = Instant::now();
        let mut sample_ready = false;

        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;

            let adapters = get_detailed_network_adapters();
            let (curr_rx, curr_tx, curr_rx_pkts, curr_tx_pkts) = adapters.iter().fold(
                (0u64, 0u64, 0u64, 0u64),
                |(rx_acc, tx_acc, rxp_acc, txp_acc), ad| {
                    (
                        rx_acc + ad.rx_bytes,
                        tx_acc + ad.tx_bytes,
                        rxp_acc + ad.rx_packets,
                        txp_acc + ad.tx_packets,
                    )
                },
            );

            let elapsed = last_sample.elapsed();
            last_sample = Instant::now();
            let old_rx = prev_rx.swap(curr_rx, Ordering::Relaxed);
            let old_tx = prev_tx.swap(curr_tx, Ordering::Relaxed);
            let old_rx_pkts = prev_rx_pkts.swap(curr_rx_pkts, Ordering::Relaxed);
            let old_tx_pkts = prev_tx_pkts.swap(curr_tx_pkts, Ordering::Relaxed);
            let deltas = if sample_ready {
                counter_deltas(
                    old_rx,
                    old_tx,
                    old_rx_pkts,
                    old_tx_pkts,
                    curr_rx,
                    curr_tx,
                    curr_rx_pkts,
                    curr_tx_pkts,
                )
            } else {
                (0, 0, 0, 0)
            };
            sample_ready = true;
            let (rx_delta_bytes, tx_delta_bytes, rx_packets_delta, tx_packets_delta) = deltas;
            let seconds = elapsed.as_secs_f64().max(f64::EPSILON);
            let rx_kbps = (rx_delta_bytes as f64 / 1024.0) / seconds;
            let tx_kbps = (tx_delta_bytes as f64 / 1024.0) / seconds;

            let tcp_conns = get_active_tcp_connections();
            let timestamp = chrono::Utc::now().to_rfc3339();

            // Real RTT measured from observed TCP handshakes (0.0 = no samples yet)
            let avg_rtt_ms = flow_engine
                .lock()
                .map(|fe| fe.get_summary_stats().avg_rtt_ms)
                .unwrap_or(0.0);

            let payload = TelemetryPayload {
                rx_kbps,
                tx_kbps,
                rx_packets_delta,
                tx_packets_delta,
                rtt_avg_ms: avg_rtt_ms,
                active_tcp_count: tcp_conns.len(),
                timestamp,
            };

            let _ = app_handle.emit("system-telemetry", payload);
        }
    });
}

fn counter_deltas(
    old_rx: u64,
    old_tx: u64,
    old_rx_packets: u64,
    old_tx_packets: u64,
    rx: u64,
    tx: u64,
    rx_packets: u64,
    tx_packets: u64,
) -> (u64, u64, u64, u64) {
    (
        rx.saturating_sub(old_rx),
        tx.saturating_sub(old_tx),
        rx_packets.saturating_sub(old_rx_packets),
        tx_packets.saturating_sub(old_tx_packets),
    )
}

#[cfg(test)]
mod tests {
    use super::counter_deltas;

    #[test]
    fn telemetry_reports_counter_deltas_and_handles_reset() {
        assert_eq!(
            counter_deltas(100, 200, 10, 20, 175, 260, 16, 25),
            (75, 60, 6, 5)
        );
        assert_eq!(
            counter_deltas(100, 200, 10, 20, 5, 190, 2, 21),
            (0, 0, 0, 1)
        );
    }
}

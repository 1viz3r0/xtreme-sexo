//! Explicitly authorized, bounded TCP-connect jobs. No DNS or application probes.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, VecDeque};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::task::JoinSet;
use tokio::time::Instant;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScanRequest {
    pub targets: String,
    pub ports: String,
    pub timeout_ms: u64,
    pub concurrency: usize,
    pub authorized: bool,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScanPlan {
    pub targets: Vec<String>,
    pub ports: Vec<u16>,
    pub total_probes: usize,
    pub timeout_ms: u64,
    pub concurrency: usize,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScanResult {
    pub target: String,
    pub port: u16,
    pub state: String,
    #[serde(default)]
    pub reason: String,
    pub service_hint: String,
    pub latency_ms: u64,
    pub observed_at: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScanJob {
    pub id: String,
    pub state: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub plan: ScanPlan,
    pub completed_probes: usize,
    pub results: Vec<ScanResult>,
    pub error: Option<String>,
}

fn now() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }

fn validate_ip(ip: IpAddr) -> Result<IpAddr, String> {
    match ip {
        IpAddr::V4(v) if v.is_unspecified() || v.is_multicast() || v == Ipv4Addr::BROADCAST =>
            Err("Unspecified, multicast and broadcast addresses are not allowed".into()),
        IpAddr::V6(v) if v.is_unspecified() || v.is_multicast() =>
            Err("Unspecified and multicast addresses are not allowed".into()),
        IpAddr::V6(v) if (v.segments()[0] & 0xffc0) == 0xfe80 =>
            Err("IPv6 link-local addresses require a scope and are not supported".into()),
        IpAddr::V6(v) if v.to_ipv4_mapped().is_some() => {
            validate_ip(IpAddr::V4(v.to_ipv4_mapped().unwrap()))
        }
        _ => Ok(ip),
    }
}

/// Pure validation: never resolves names or opens sockets. For /30 and wider,
/// CIDRs exclude network/broadcast endpoints; /31 and /32 include every host.
pub fn plan(request: &ScanRequest) -> Result<ScanPlan, String> {
    if request.targets.len() > 8192 || request.ports.len() > 4096 {
        return Err("Target or port input is too long".into());
    }
    if !(100..=2000).contains(&request.timeout_ms) {
        return Err("Timeout must be between 100 and 2000 milliseconds".into());
    }
    if !(1..=16).contains(&request.concurrency) {
        return Err("Concurrency must be between 1 and 16".into());
    }
    let mut targets = BTreeSet::new();
    let mut has_cidr = false;
    for token in request.targets.split(|c: char| c == ',' || c.is_whitespace()).filter(|s| !s.is_empty()) {
        if let Some((address, prefix)) = token.split_once('/') {
            has_cidr = true;
            let ip: Ipv4Addr = address.parse().map_err(|_| "CIDR targets must use literal IPv4 addresses")?;
            if prefix.is_empty() || !prefix.bytes().all(|b| b.is_ascii_digit()) {
                return Err("Invalid IPv4 CIDR prefix".into());
            }
            let prefix: u32 = prefix.parse().map_err(|_| "Invalid IPv4 CIDR prefix")?;
            if prefix > 32 { return Err("IPv4 CIDR prefix must be 0 through 32".into()); }
            let count = 1u64 << (32 - prefix);
            if count > 32 { return Err("A CIDR may expand to at most 32 hosts; use /27 or narrower".into()); }
            let mask = if prefix == 0 { 0 } else { u32::MAX << (32 - prefix) };
            let base = u32::from(ip) & mask;
            let offsets = if prefix <= 30 { 1..count - 1 } else { 0..count };
            for offset in offsets {
                targets.insert(validate_ip(IpAddr::V4(Ipv4Addr::from(base + offset as u32)))?);
            }
        } else {
            targets.insert(validate_ip(token.parse().map_err(|_| "Targets must be literal IP addresses or IPv4 CIDRs; DNS and scopes are not supported")?)?);
        }
        if targets.len() > 32 { return Err("At most 32 unique target hosts are allowed".into()); }
    }
    if targets.is_empty() { return Err("Provide at least one target IP address".into()); }
    let mut ports = BTreeSet::new();
    for token in request.ports.split(',') {
        let token = token.trim();
        let parse = |s: &str| -> Result<u16, String> {
            let s = s.trim();
            if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
                return Err("Ports must be integers from 1 to 65535".into());
            }
            let p: u16 = s.parse().map_err(|_| "Ports must be integers from 1 to 65535".to_string())?;
            if p == 0 { return Err("Port zero is not allowed".into()); }
            Ok(p)
        };
        let (first, last) = match token.split_once('-') {
            Some((a, b)) => (parse(a)?, parse(b)?),
            None => { let p = parse(token)?; (p, p) },
        };
        if first > last { return Err("Port range start must not exceed its end".into()); }
        if u32::from(last) - u32::from(first) + 1 > 256 { return Err("At most 256 unique ports are allowed".into()); }
        ports.extend(first..=last);
        if ports.len() > 256 { return Err("At most 256 unique ports are allowed".into()); }
    }
    let total_probes = targets.len() * ports.len();
    if total_probes > 4096 { return Err("A scan may contain at most 4096 probes".into()); }
    let mut warnings = vec!["TCP connect only. Port service names are hints, not verified services or OS identification.".into(),
        "Timeout or unreachable results do not prove a port is closed. Starts are limited to 50 connections per second.".into()];
    if has_cidr { warnings.push("CIDRs /30 and wider exclude network and broadcast endpoints; /31 and /32 include all addresses. Literal directed broadcast cannot be identified without the destination subnet mask. Verify the preview.".into()); }
    Ok(ScanPlan { targets: targets.into_iter().map(|ip| ip.to_string()).collect(), ports: ports.into_iter().collect(), total_probes,
        timeout_ms: request.timeout_ms, concurrency: request.concurrency, warnings })
}

#[derive(Default)]
struct Cancellation { flag: AtomicBool, wake: tokio::sync::Notify }
impl Cancellation {
    fn cancel(&self) { self.flag.store(true, Ordering::SeqCst); self.wake.notify_waiters(); }
    fn is_cancelled(&self) -> bool { self.flag.load(Ordering::SeqCst) }
    async fn notified(&self) {
        // Register before checking the flag, including while waiting for the limiter.
        let notified = self.wake.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if !self.is_cancelled() { notified.await; }
    }
}
const JOB_DEADLINE: Duration = Duration::from_secs(10 * 60);
struct Active { id: String, cancelled: Arc<Cancellation> }
#[derive(Default)]
struct Store { jobs: VecDeque<ScanJob>, active: Option<Active>, shutting_down: bool }
struct Inner {
    journal: Option<Arc<super::scan_buddy_journal::ScanJournal>>,
    journal_lock: Option<std::fs::File>,
    storage: Mutex<ScanStorageStatus>,
    store: Mutex<Store>,
    // Shared across jobs: a new job cannot reset the global start-rate window.
    rate: tokio::sync::Mutex<Instant>,
    sequence: AtomicU64,
    #[cfg(test)]
    peak_workers: std::sync::atomic::AtomicUsize,
    #[cfg(test)]
    test_connect: Mutex<Option<TestConnect>>,
    #[cfg(test)]
    test_deadline: Mutex<Option<Arc<TestDeadlineClock>>>,
}
#[cfg(test)]
type TestConnect = Arc<dyn Fn(SocketAddr) -> std::pin::Pin<Box<dyn std::future::Future<Output = std::io::Result<()>> + Send>> + Send + Sync>;
#[cfg(test)]
#[derive(Default)]
struct TestDeadlineClock { elapsed_ms: AtomicU64, wake: tokio::sync::Notify }
#[cfg(test)]
impl TestDeadlineClock {
    fn advance(&self, elapsed: Duration) {
        self.elapsed_ms.fetch_add(elapsed.as_millis() as u64, Ordering::SeqCst);
        self.wake.notify_one();
    }
    async fn expired(&self) {
        loop {
            let wake = self.wake.notified();
            tokio::pin!(wake);
            wake.as_mut().enable();
            if self.elapsed_ms.load(Ordering::SeqCst) >= JOB_DEADLINE.as_millis() as u64 { return; }
            wake.await;
        }
    }
}
pub struct ScanBuddyState { inner: Arc<Inner> }
#[derive(Debug, Clone, Serialize)]
pub struct ScanStorageStatus {
    pub persistent: bool,
    pub available: bool,
    pub warnings: Vec<String>,
    pub last_saved_job: Option<String>,
}
impl Default for ScanBuddyState { fn default() -> Self { Self::new() } }
impl ScanBuddyState {
    pub fn new() -> Self {
        Self { inner: Arc::new(Inner { journal: None, journal_lock: None,
            storage: Mutex::new(ScanStorageStatus { persistent: false, available: false,
                warnings: vec!["Scan history is memory-only".into()], last_saved_job: None }),
            store: Mutex::new(Store::default()), rate: tokio::sync::Mutex::new(Instant::now()), sequence: AtomicU64::new(1),
            #[cfg(test)]
            peak_workers: std::sync::atomic::AtomicUsize::new(0),
            #[cfg(test)]
            test_connect: Mutex::new(None),
            #[cfg(test)]
            test_deadline: Mutex::new(None),
        }) }
    }
    /// Startup-only disk work; never starts or resumes network probes.
    pub fn persistent() -> Self {
        Self::with_history_directory(crate::database::sqlite::get_app_dir().join("scan-buddy"))
    }
    pub fn with_history_directory(directory: std::path::PathBuf) -> Self {
        let mut state = Self::new();
        let loaded = (|| -> Result<_, String> {
            let mut builder = std::fs::DirBuilder::new();
            #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
            match builder.create(&directory) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(_) => return Err("Scan history directory is unavailable".into()),
            }
            let metadata = std::fs::symlink_metadata(&directory).map_err(|_| "Scan history directory is unavailable")?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() { return Err("Scan history directory is unsafe".into()); }
            #[cfg(unix)] { use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o077 != 0 { return Err("Scan history directory must be private".into()); }
            }
            let lock_path = directory.join("scan-history.lock");
            if let Ok(meta) = std::fs::symlink_metadata(&lock_path) {
                if !meta.is_file() || meta.file_type().is_symlink() { return Err("Scan history lock is unsafe".into()); }
                #[cfg(unix)] { use std::os::unix::fs::{MetadataExt, PermissionsExt};
                    if meta.nlink() != 1 || meta.permissions().mode() & 0o077 != 0 { return Err("Scan history lock is unsafe".into()); }
                }
            }
            let mut options = std::fs::OpenOptions::new(); options.read(true).write(true).create(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600);
                #[cfg(target_os="linux")] options.custom_flags(0x20000);
            }
            let lock = options.open(lock_path).map_err(|_| "Scan history lock is unavailable")?;
            lock.try_lock().map_err(|_| "Scan history is owned by another NET0ZE instance")?;
            let journal = Arc::new(super::scan_buddy_journal::ScanJournal::open(directory.join("scan_buddy_history.db"))?);
            let jobs = journal.load()?;
            Ok((lock, journal, jobs))
        })();
        let inner = Arc::get_mut(&mut state.inner).expect("new scanner has sole ownership");
        match loaded {
            Ok((lock, journal, mut jobs)) => {
                let warnings = journal.warnings(); jobs.reverse();
                inner.store.get_mut().unwrap().jobs = jobs.into();
                *inner.storage.get_mut().unwrap() = ScanStorageStatus { persistent: true, available: true, warnings, last_saved_job: None };
                inner.journal = Some(journal); inner.journal_lock = Some(lock);
            }
            Err(error) => { inner.storage.get_mut().unwrap().warnings = vec![format!("{error}; scans will use memory-only history")]; }
        }
        state
    }
    pub fn storage_status(&self) -> ScanStorageStatus {
        self.inner.storage.lock().map(|s| s.clone()).unwrap_or(ScanStorageStatus {
            persistent: false, available: false, warnings: vec!["Scan history status unavailable".into()], last_saved_job: None })
    }
    pub fn start(&self, request: ScanRequest) -> Result<ScanJob, String> {
        if !request.authorized { return Err("Explicit authorization is required before starting any scan, including loopback".into()); }
        let plan = plan(&request)?;
        let runtime = tokio::runtime::Handle::try_current().map_err(|_| "Async scan runtime is unavailable")?;
        let mut store = self.inner.store.lock().map_err(|_| "Scan state is unavailable")?;
        if store.shutting_down { return Err("Scanner is shutting down".into()); }
        if store.active.is_some() { return Err("A scan is already running or settling cancellation".into()); }
        let id = format!("scan-{}-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(), self.inner.sequence.fetch_add(1, Ordering::Relaxed));
        let job = ScanJob { id: id.clone(), state: "RUNNING".into(), started_at: now(), finished_at: None, plan,
            completed_probes: 0, results: Vec::new(), error: None };
        let cancelled = Arc::new(Cancellation::default());
        store.active = Some(Active { id: id.clone(), cancelled: cancelled.clone() });
        if store.jobs.len() == 8 { store.jobs.pop_front(); }
        store.jobs.push_back(job.clone());
        let inner = self.inner.clone();
        let job_plan = job.plan.clone();
        let deadline = Instant::now() + JOB_DEADLINE;
        runtime.spawn(async move { run(inner, id, job_plan, cancelled, deadline).await; });
        Ok(job)
    }
    pub fn status(&self, id: &str) -> Result<ScanJob, String> {
        self.inner.store.lock().map_err(|_| "Scan state is unavailable")?.jobs.iter().find(|j| j.id == id).cloned().ok_or_else(|| "Scan job not found (history retains at most 8 jobs)".into())
    }
    pub fn history(&self) -> Result<Vec<ScanJob>, String> {
        Ok(self.inner.store.lock().map_err(|_| "Scan state is unavailable")?.jobs.iter().rev().cloned().collect())
    }
    pub fn cancel(&self, id: &str) -> Result<ScanJob, String> {
        let store = self.inner.store.lock().map_err(|_| "Scan state is unavailable")?;
        let job = store.jobs.iter().find(|j| j.id == id).ok_or("Scan job not found")?;
        if let Some(active) = &store.active {
            if active.id == id { active.cancelled.cancel(); }
        }
        // RUNNING until all worker sockets have settled; completed rows survive.
        Ok(job.clone())
    }
    /// Call on application shutdown. No new probes can start after this returns.
    /// Already started connections are woken and dropped promptly.
    pub fn shutdown(&self) {
        if let Ok(mut store) = self.inner.store.lock() {
            store.shutting_down = true;
            if let Some(active) = &store.active { active.cancelled.cancel(); }
        }
    }
    pub async fn shutdown_and_wait(&self) {
        self.shutdown();
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            let active = self.inner.store.lock().map(|s| s.active.is_some()).unwrap_or(false);
            if !active { break; }
            // Never wait forever if the runtime can no longer settle a task.
            if Instant::now() >= deadline { break; }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
}
impl Drop for ScanBuddyState { fn drop(&mut self) { self.shutdown(); } }

fn service_hint(port: u16) -> String {
    let name = match port {
        21 => "FTP", 22 => "SSH", 23 => "Telnet", 25 | 587 => "SMTP", 53 => "DNS", 80 | 8080 => "HTTP",
        110 => "POP3", 135 => "MS-RPC", 139 => "NetBIOS", 143 => "IMAP", 443 | 8443 => "HTTPS", 445 => "SMB",
        465 => "SMTPS", 993 => "IMAPS", 995 => "POP3S", 1433 => "MSSQL", 1521 => "Oracle", 2049 => "NFS",
        2375 => "Docker", 3306 => "MySQL", 3389 => "RDP", 5432 => "PostgreSQL", 5900 => "VNC",
        6379 => "Redis", 9200 => "Elasticsearch", 27017 => "MongoDB", _ => "Unknown service",
    };
    format!("{} (port-based hint; unverified)", name)
}

async fn connect(inner: &Inner, address: SocketAddr) -> std::io::Result<()> {
    #[cfg(test)]
    {
        let injected = inner.test_connect.lock().unwrap().clone();
        if let Some(injected) = injected { return injected(address).await; }
    }
    #[cfg(not(test))]
    let _ = inner;
    // Normal async polling retains the runtime's real waker. Never a Noop waker.
    TcpStream::connect(address).await.map(drop)
}

fn outcome_reason(error: Option<std::io::ErrorKind>) -> (&'static str, &'static str) {
    use std::io::ErrorKind::*;
    match error {
        None => ("OPEN", "connection succeeded"),
        Some(ConnectionRefused) => ("CLOSED", "connection refused"),
        Some(TimedOut) => ("TIMEOUT", "timed out"),
        Some(AddrNotAvailable | NetworkUnreachable | HostUnreachable) => ("UNREACHABLE", "network unreachable"),
        Some(PermissionDenied) => ("ERROR", "permission denied"),
        _ => ("ERROR", "other I/O"),
    }
}

async fn probe(inner: Arc<Inner>, cancelled: Arc<Cancellation>, ip: IpAddr, port: u16,
    timeout_ms: u64, deadline: Instant, started_tx: tokio::sync::oneshot::Sender<()>) -> Option<ScanResult> {
    let rate = tokio::select! {
        biased;
        _ = cancelled.notified() => return None,
        rate = inner.rate.lock() => rate,
    };
    tokio::select! {
        biased;
        _ = cancelled.notified() => return None,
        _ = tokio::time::sleep_until(deadline) => return None,
        _ = tokio::time::sleep_until(*rate) => (),
    }
    let mut rate = Some(rate);
    let mut started = None;
    let mut started_tx = Some(started_tx);
    let connection = connect(&inner, SocketAddr::new(ip, port));
    tokio::pin!(connection);
    // A normal Future adapter, always using the executor-supplied context. The
    // first poll and cancel/shutdown share the store lock: socket creation cannot
    // race past a returned cancellation. Never hold this lock across an await.
    let outcome = {
        let gated = std::future::poll_fn(|cx| {
            use std::future::Future;
            if started.is_none() {
                let Ok(store) = inner.store.lock() else { return std::task::Poll::Ready(None); };
                if store.shutting_down || cancelled.is_cancelled() || Instant::now() >= deadline {
                    return std::task::Poll::Ready(None);
                }
                started = Some(Instant::now());
                let result = connection.as_mut().poll(cx).map(Some);
                **rate.as_mut().expect("start permit") = Instant::now() + Duration::from_millis(20);
                // Release the limiter after initiation, not after connect.
                drop(rate.take());
                if let Some(tx) = started_tx.take() { let _ = tx.send(()); }
                drop(store);
                result
            } else {
                connection.as_mut().poll(cx).map(Some)
            }
        });
        tokio::pin!(gated);
        tokio::select! {
            biased;
            result = &mut gated => result,
            _ = cancelled.notified() => return None,
            _ = tokio::time::sleep(Duration::from_millis(timeout_ms)) => Some(Err(std::io::ErrorKind::TimedOut.into())),
        }
    };
    let outcome = outcome?;
    let (state, reason) = outcome_reason(outcome.err().map(|error| error.kind()));
    Some(ScanResult { target: ip.to_string(), port, state: state.into(), reason: reason.into(), service_hint: service_hint(port),
        latency_ms: started?.elapsed().as_millis().min(u64::MAX as u128) as u64, observed_at: now() })
}

async fn deadline_elapsed(inner: &Inner, deadline: Instant) {
    #[cfg(test)]
    {
        let injected = inner.test_deadline.lock().unwrap().clone();
        if let Some(clock) = injected { clock.expired().await; return; }
    }
    #[cfg(not(test))]
    let _ = inner;
    tokio::time::sleep_until(deadline).await;
}

async fn persist(inner: &Arc<Inner>, id: &str) {
    let Some(journal) = inner.journal.clone() else { return; };
    let snapshot = inner.store.lock().ok().and_then(|s| s.jobs.iter().find(|j| j.id == id).cloned());
    let Some(snapshot) = snapshot else { return; };
    // Serialization, validation and SQLite work stay off async workers/state locks.
    let result = tokio::task::spawn_blocking(move || journal.save(&snapshot)).await;
    if let Ok(mut status) = inner.storage.lock() {
        match result {
            Ok(Ok(())) => { status.available = true; status.last_saved_job = Some(id.into()); }
            _ => {
                status.available = false;
                let warning = "Scan history write failed; some recent results may not survive restart".to_string();
                if !status.warnings.contains(&warning) { status.warnings.push(warning); }
            }
        }
    }
}

async fn run(inner: Arc<Inner>, id: String, plan: ScanPlan, cancelled: Arc<Cancellation>, deadline: Instant) {
    persist(&inner, &id).await;
    let mut last_checkpoint = Instant::now();
    let mut workers = JoinSet::new();
    let mut next = 0;
    let mut failure = None;
    let expires = deadline_elapsed(&inner, deadline);
    tokio::pin!(expires);
    loop {
        while failure.is_none() && !cancelled.is_cancelled() && workers.len() < plan.concurrency && next < plan.total_probes {
            // Port-major order gives every target a turn before the next port.
            let ip: IpAddr = plan.targets[next % plan.targets.len()].parse().expect("validated literal IP");
            let port = plan.ports[next / plan.targets.len()];
            next += 1;
            let (started_tx, started_rx) = tokio::sync::oneshot::channel();
            workers.spawn(probe(inner.clone(), cancelled.clone(), ip, port, plan.timeout_ms, deadline, started_tx));
            #[cfg(test)]
            inner.peak_workers.fetch_max(workers.len(), Ordering::Relaxed);
            // Do not let executor task scheduling reorder connection starts.
            tokio::select! {
                biased;
                _ = cancelled.notified() => (),
                _ = &mut expires => { failure = Some("Scan exceeded the 10-minute wall-clock deadline; pending probes were cancelled"); cancelled.cancel(); },
                _ = started_rx => (),
            }
        }
        let result = if cancelled.is_cancelled() {
            workers.join_next().await
        } else {
            tokio::select! {
                biased;
                _ = cancelled.notified() => continue,
                _ = &mut expires => { failure = Some("Scan exceeded the 10-minute wall-clock deadline; pending probes were cancelled"); cancelled.cancel(); continue; },
                result = workers.join_next() => result,
            }
        };
        let Some(result) = result else { break; };
        match result {
            Ok(Some(row)) => {
                if let Ok(mut store) = inner.store.lock() {
                    if let Some(job) = store.jobs.iter_mut().find(|j| j.id == id) {
                        job.results.push(row);
                        job.completed_probes = job.results.len();
                    }
                }
            }
            Ok(None) => (),
            Err(_) => { failure.get_or_insert("A scan worker failed; pending probes were cancelled"); cancelled.cancel(); }
        }
        if last_checkpoint.elapsed() >= Duration::from_secs(1) {
            persist(&inner, &id).await;
            last_checkpoint = Instant::now();
        }
    }
    if let Ok(mut store) = inner.store.lock() {
        if let Some(job) = store.jobs.iter_mut().find(|j| j.id == id) {
            job.state = if failure.is_some() { "FAILED" } else if cancelled.is_cancelled() { "CANCELLED" } else { "COMPLETED" }.into();
            job.finished_at = Some(now());
            job.error = failure.map(str::to_string);
            tracing::info!(operation = "scan_buddy_finish", success = failure.is_none(), count = job.completed_probes as u64);
        }
    }
    persist(&inner, &id).await;
    if let Ok(mut store) = inner.store.lock() { store.active = None; }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> ScanRequest { ScanRequest { targets: "127.0.0.1".into(), ports: "80,443".into(), timeout_ms: 100, concurrency: 4, authorized: true } }
    #[tokio::test]
    async fn engine_history_survives_reopen_and_exclusive_owner_prevents_false_recovery() {
        let directory = std::env::temp_dir().join(format!("scan-engine-journal-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = ScanBuddyState::with_history_directory(directory.clone());
        assert!(state.storage_status().available);
        let duplicate = ScanBuddyState::with_history_directory(directory.clone());
        assert!(!duplicate.storage_status().persistent);
        assert!(duplicate.storage_status().warnings[0].contains("another NET0ZE"));
        drop(duplicate);
        let mut r = request(); r.ports = listener.local_addr().unwrap().port().to_string();
        let job = state.start(r).unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if !state.inner.store.lock().unwrap().active.is_some() && Arc::strong_count(&state.inner) == 1 { break; }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await.unwrap();
        assert_eq!(state.status(&job.id).unwrap().results[0].state, "OPEN");
        assert_eq!(state.storage_status().last_saved_job.as_deref(), Some(job.id.as_str()));
        drop(state);
        let reopened = ScanBuddyState::with_history_directory(directory.clone());
        assert!(reopened.storage_status().available);
        let restored = reopened.status(&job.id).unwrap();
        assert_eq!(restored.state, "COMPLETED");
        assert_eq!(restored.results[0].reason, "connection succeeded");
        assert!(reopened.inner.store.lock().unwrap().active.is_none());
        drop(reopened); std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn mapped_targets_are_canonical_and_numeric_grammar_is_strict() {
        let mut r = request();
        r.targets = "127.0.0.1,::ffff:127.0.0.1,::ffff:7f00:1".into();
        assert_eq!(plan(&r).unwrap().targets, vec!["127.0.0.1"]);
        for target in ["127.0.0.1/+32", "127.0.0.1/", "127.0.0.1/32/32", "::ffff:0.0.0.0", "::ffff:255.255.255.255"] {
            r.targets = target.into(); assert!(plan(&r).is_err(), "{target}");
        }
        r.targets = "127.0.0.1".into();
        for ports in ["+80", "80-+81", "80-", "-80", "80--81", "80,,81", "80-81-82"] {
            r.ports = ports.into(); assert!(plan(&r).is_err(), "{ports}");
        }
    }
    #[test]
    fn reasons_are_finite_and_legacy_rows_deserialize() {
        use std::io::ErrorKind::*;
        assert_eq!(outcome_reason(None), ("OPEN", "connection succeeded"));
        for (kind, state, reason) in [
            (ConnectionRefused, "CLOSED", "connection refused"), (TimedOut, "TIMEOUT", "timed out"),
            (NetworkUnreachable, "UNREACHABLE", "network unreachable"), (PermissionDenied, "ERROR", "permission denied"),
            (Other, "ERROR", "other I/O"),
        ] { assert_eq!(outcome_reason(Some(kind)), (state, reason)); }
        let row: ScanResult = serde_json::from_str(r#"{"target":"127.0.0.1","port":80,"state":"OPEN","service_hint":"hint","latency_ms":0,"observed_at":"now"}"#).unwrap();
        assert_eq!(row.reason, "");
    }
    #[test]
    fn validates_literals_ranges_and_bounds() {
        let mut r = request();
        r.targets = "127.0.0.1, ::1 127.0.0.1".into(); r.ports = "22,80-82,80".into();
        assert_eq!(plan(&r).unwrap().total_probes, 8);
        for target in ["example.com", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::", "ff02::1", "fe80::1", "::ffff:224.0.0.1", "127.0.0.1/26", "::1/128", "1.2.3.4/33"] {
            r.targets = target.into(); assert!(plan(&r).is_err(), "{target}");
        }
        r.targets = "127.0.0.1/27".into(); assert_eq!(plan(&r).unwrap().targets.len(), 30);
        r.targets = "127.0.0.0/30".into(); assert_eq!(plan(&r).unwrap().targets, vec!["127.0.0.1", "127.0.0.2"]);
        r.targets = "127.0.0.0/31".into(); assert_eq!(plan(&r).unwrap().targets.len(), 2);
        r.targets = "127.0.0.1/32".into(); assert_eq!(plan(&r).unwrap().targets.len(), 1);
        r.targets = "127.0.0.1/27".into();
        r.targets.push_str(",127.0.0.32,127.0.0.33,127.0.0.34"); assert!(plan(&r).is_err());
        r.targets = "127.0.0.1/27,127.0.0.32,127.0.0.33".into(); r.ports = "1-128".into(); assert_eq!(plan(&r).unwrap().total_probes, 4096);
        r.ports = "1-129".into(); assert!(plan(&r).is_err());
        r.targets = "127.0.0.1".into();
        for ports in ["0", "65536", "", "80,", "90-80", "1-257"] { r.ports = ports.into(); assert!(plan(&r).is_err()); }
        r.ports = "1-256".into(); assert_eq!(plan(&r).unwrap().ports.len(), 256);
        r.concurrency = 17; assert!(plan(&r).is_err()); r.concurrency = 0; assert!(plan(&r).is_err());
        r.concurrency = 16; r.timeout_ms = 99; assert!(plan(&r).is_err()); r.timeout_ms = 2001; assert!(plan(&r).is_err());
    }
    async fn finished(state: &ScanBuddyState, id: &str) -> ScanJob {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop { let job = state.status(id).unwrap(); if job.state != "RUNNING" { return job; } tokio::time::sleep(Duration::from_millis(5)).await; }
        }).await.unwrap()
    }
    async fn wait_for_starts(starts: &Mutex<Vec<(SocketAddr, Instant)>>, count: usize) {
        tokio::time::timeout(Duration::from_secs(1), async {
            while starts.lock().unwrap().len() < count { tokio::task::yield_now().await; }
        }).await.unwrap();
    }
    fn inject(state: &ScanBuddyState, pending: bool) -> Arc<Mutex<Vec<(SocketAddr, Instant)>>> {
        let starts = Arc::new(Mutex::new(Vec::new()));
        let capture = starts.clone();
        *state.inner.test_connect.lock().unwrap() = Some(Arc::new(move |address| {
            capture.lock().unwrap().push((address, Instant::now()));
            Box::pin(async move { if pending { std::future::pending::<()>().await; } Ok(()) })
        }));
        starts
    }
    #[tokio::test]
    async fn fair_starts_and_global_rate_across_jobs() {
        let state = ScanBuddyState::new();
        let starts = inject(&state, false);
        let mut r = request(); r.targets = "127.0.0.1,127.0.0.2".into(); r.ports = "80,81".into();
        let job = state.start(r.clone()).unwrap();
        assert_eq!(finished(&state, &job.id).await.state, "COMPLETED");
        let job = state.start(r).unwrap(); finished(&state, &job.id).await;
        let starts = starts.lock().unwrap();
        assert_eq!(starts.iter().take(4).map(|(address, _)| address.to_string()).collect::<Vec<_>>(),
            vec!["127.0.0.1:80", "127.0.0.2:80", "127.0.0.1:81", "127.0.0.2:81"]);
        for pair in starts.windows(2) { assert!(pair[1].1.duration_since(pair[0].1) >= Duration::from_millis(20)); }
    }
    #[tokio::test]
    async fn pending_connections_and_rate_wait_are_cancelled_promptly() {
        let state = ScanBuddyState::new();
        let starts = inject(&state, true);
        let mut r = request(); r.timeout_ms = 2000; r.ports = "80-95".into(); r.concurrency = 16;
        let job = state.start(r).unwrap(); wait_for_starts(&starts, 1).await;
        let count = starts.lock().unwrap().len();
        let before = Instant::now(); state.cancel(&job.id).unwrap();
        let done = tokio::time::timeout(Duration::from_millis(300), finished(&state, &job.id)).await.unwrap();
        assert!(before.elapsed() < Duration::from_millis(300));
        assert_eq!(done.state, "CANCELLED"); assert!(done.results.is_empty());
        assert_eq!(starts.lock().unwrap().len(), count);
    }
    #[tokio::test]
    async fn cancellation_wakes_a_queued_global_limiter_lock() {
        let state = ScanBuddyState::new(); let starts = inject(&state, false);
        let permit = state.inner.rate.lock().await;
        let job = state.start(request()).unwrap(); tokio::task::yield_now().await;
        state.cancel(&job.id).unwrap();
        let done = tokio::time::timeout(Duration::from_millis(300), finished(&state, &job.id)).await.unwrap();
        assert_eq!(done.state, "CANCELLED"); assert!(done.results.is_empty());
        assert!(starts.lock().unwrap().is_empty()); drop(permit);
    }
    #[tokio::test]
    async fn injected_deadline_fails_pending_work_without_sleeping_ten_minutes() {
        let state = ScanBuddyState::new();
        let clock = Arc::new(TestDeadlineClock::default());
        *state.inner.test_deadline.lock().unwrap() = Some(clock.clone());
        let starts = inject(&state, true);
        let mut r = request(); r.timeout_ms = 2000; r.ports = "80-95".into();
        let job = state.start(r).unwrap(); wait_for_starts(&starts, 1).await;
        // Manually advance just the injected wall-clock deadline; no test-util
        // feature or real ten-minute delay is required.
        clock.advance(Duration::from_secs(599));
        tokio::task::yield_now().await;
        assert_eq!(state.status(&job.id).unwrap().state, "RUNNING");
        clock.advance(Duration::from_secs(1));
        let done = tokio::time::timeout(Duration::from_millis(300), finished(&state, &job.id)).await.unwrap();
        assert_eq!(done.state, "FAILED"); assert!(done.results.is_empty());
        assert_eq!(done.error.as_deref(), Some("Scan exceeded the 10-minute wall-clock deadline; pending probes were cancelled"));
        let count = starts.lock().unwrap().len(); tokio::task::yield_now().await;
        assert_eq!(starts.lock().unwrap().len(), count);
    }
    #[tokio::test]
    async fn normal_waker_completes_a_previously_pending_probe() {
        let state = ScanBuddyState::new();
        let wake = Arc::new(tokio::sync::Notify::new());
        let capture = wake.clone();
        *state.inner.test_connect.lock().unwrap() = Some(Arc::new(move |_| {
            let capture = capture.clone();
            Box::pin(async move { capture.notified().await; Ok(()) })
        }));
        let mut r = request(); r.ports = "80".into(); r.timeout_ms = 2000;
        let job = state.start(r).unwrap();
        tokio::task::yield_now().await;
        wake.notify_one();
        let done = tokio::time::timeout(Duration::from_millis(300), finished(&state, &job.id)).await.unwrap();
        assert_eq!(done.state, "COMPLETED"); assert_eq!(done.results[0].state, "OPEN");
    }
    #[tokio::test]
    async fn deadline_keeps_completed_rows_and_drops_pending_connections() {
        let state = ScanBuddyState::new();
        let clock = Arc::new(TestDeadlineClock::default());
        *state.inner.test_deadline.lock().unwrap() = Some(clock.clone());
        let started = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let capture = started.clone();
        *state.inner.test_connect.lock().unwrap() = Some(Arc::new(move |_| {
            let index = capture.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move { if index != 0 { std::future::pending::<()>().await; } Ok(()) })
        }));
        let mut r = request(); r.ports = "80-95".into(); r.timeout_ms = 2000;
        let job = state.start(r).unwrap();
        tokio::time::timeout(Duration::from_secs(1), async {
            while started.load(Ordering::SeqCst) < 2 { tokio::task::yield_now().await; }
        }).await.unwrap();
        clock.advance(JOB_DEADLINE);
        let done = tokio::time::timeout(Duration::from_millis(300), finished(&state, &job.id)).await.unwrap();
        assert_eq!(done.state, "FAILED"); assert_eq!(done.completed_probes, 1);
        assert_eq!(done.results[0].port, 80); assert_eq!(done.results[0].reason, "connection succeeded");
        let decoded: ScanJob = serde_json::from_value(serde_json::to_value(&done).unwrap()).unwrap();
        assert_eq!(decoded.completed_probes, 1); assert_eq!(decoded.plan.total_probes, 16);
    }
    #[tokio::test]
    async fn shutdown_drops_inflight_and_rate_waiters_without_new_rows() {
        let state = ScanBuddyState::new(); let starts = inject(&state, true);
        let mut r = request(); r.ports = "80-95".into(); r.timeout_ms = 2000;
        let job = state.start(r).unwrap(); wait_for_starts(&starts, 1).await;
        tokio::time::timeout(Duration::from_millis(300), state.shutdown_and_wait()).await.unwrap();
        let count = starts.lock().unwrap().len();
        assert_eq!(state.status(&job.id).unwrap().state, "CANCELLED");
        assert!(state.status(&job.id).unwrap().results.is_empty());
        tokio::task::yield_now().await; assert_eq!(starts.lock().unwrap().len(), count);
    }
    #[tokio::test]
    async fn loopback_results_authorization_and_history() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open = listener.local_addr().unwrap().port();
        let closed_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let closed = closed_listener.local_addr().unwrap().port(); drop(closed_listener);
        let state = ScanBuddyState::new(); let mut r = request(); r.ports = format!("{open},{closed}");
        r.authorized = false; assert!(state.start(r.clone()).is_err()); r.authorized = true;
        let job = state.start(r.clone()).unwrap(); let done = finished(&state, &job.id).await;
        assert_eq!(done.state, "COMPLETED"); assert_eq!(done.completed_probes, 2); assert!(done.finished_at.is_some());
        assert_eq!(done.results.iter().find(|x| x.port == open).unwrap().state, "OPEN");
        assert_eq!(done.results.iter().find(|x| x.port == closed).unwrap().state, "CLOSED");
        assert!(done.results.iter().all(|x| x.service_hint.contains("hint") && !x.observed_at.is_empty()));
        r.ports = open.to_string();
        for _ in 0..8 { let job = state.start(r.clone()).unwrap(); finished(&state, &job.id).await; }
        assert_eq!(state.history().unwrap().len(), 8); assert!(state.status(&job.id).is_err());
        state.shutdown_and_wait().await; assert!(state.start(r).is_err());
    }
    #[tokio::test]
    async fn cancellation_gates_workers_and_keeps_rows() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let state = ScanBuddyState::new(); let mut r = request();
        r.targets = "127.0.0.0/27".into(); r.ports = port.to_string(); r.concurrency = 16;
        let job = state.start(r.clone()).unwrap();
        assert!(state.start(r.clone()).is_err());
        // Wait for one completed local probe, then cancel queued workers.
        while state.status(&job.id).unwrap().completed_probes == 0 { tokio::time::sleep(Duration::from_millis(5)).await; }
        state.cancel(&job.id).unwrap(); assert!(state.start(r.clone()).is_err());
        let done = finished(&state, &job.id).await;
        assert_eq!(done.state, "CANCELLED"); assert!(done.completed_probes > 0 && done.completed_probes < done.plan.total_probes);
        assert_eq!(done.completed_probes, done.results.len());
        let mut invalid = r; invalid.concurrency = 0; assert!(state.start(invalid).is_err());
    }
    #[tokio::test]
    async fn rate_is_global_and_concurrency_bounded() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = ScanBuddyState::new(); let mut r = request();
        r.ports = listener.local_addr().unwrap().port().to_string(); r.targets = "127.0.0.0/29".into(); r.concurrency = 1;
        let start = Instant::now(); let job = state.start(r.clone()).unwrap(); finished(&state, &job.id).await;
        assert!(start.elapsed() >= Duration::from_millis(100));
        assert_eq!(state.inner.peak_workers.load(Ordering::Relaxed), 1);
        state.inner.peak_workers.store(0, Ordering::Relaxed);
        r.concurrency = 16; let job = state.start(r).unwrap(); let done = finished(&state, &job.id).await;
        assert_eq!(done.completed_probes, 6); assert!(start.elapsed() >= Duration::from_millis(220));
        assert_eq!(state.inner.peak_workers.load(Ordering::Relaxed), 6);
    }
    #[tokio::test]
    async fn shutdown_cancels_before_queued_connections_start() {
        let state = ScanBuddyState::new();
        let job = state.start(request()).unwrap();
        state.shutdown_and_wait().await;
        let done = state.status(&job.id).unwrap();
        assert_eq!(done.state, "CANCELLED");
        assert_eq!(done.completed_probes, 0);
        assert!(state.start(request()).is_err());
    }
}

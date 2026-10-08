use chrono::{DateTime, FixedOffset, Utc};
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tracing::field::{Field, Visit};
use tracing_subscriber::fmt::format::{FormatEvent, FormatFields, Writer};
use tracing_subscriber::fmt::writer::BoxMakeWriter;
use tracing_subscriber::fmt::FmtContext;
use tracing_subscriber::registry::LookupSpan;

pub const LOG_FILE_BYTES: u64 = 1024 * 1024;
pub const LOG_FILE_COUNT: usize = 5;
pub const MAX_READ_BYTES: usize = 256 * 1024;
/// Records operation outcome even on early error returns; never holds user input.
pub struct OperationAudit {
    operation: &'static str,
    started: std::time::Instant,
    success: bool,
    count: u64,
}
impl OperationAudit {
    pub fn new(operation: &'static str) -> Self {
        Self { operation, started: std::time::Instant::now(), success: false, count: 0 }
    }
    pub fn complete(&mut self, count: u64) { self.success = true; self.count = count; }
}
impl Drop for OperationAudit {
    fn drop(&mut self) {
        tracing::info!(operation = self.operation, success = self.success, count = self.count,
            duration_ms = self.started.elapsed().as_millis().min(u64::MAX as u128) as u64);
    }
}
const DEFAULT_READ_BYTES: usize = 64 * 1024;
static RUNTIME: OnceLock<Arc<Mutex<Runtime>>> = OnceLock::new();

pub fn india_timestamp(time: DateTime<Utc>) -> String {
    time.with_timezone(&FixedOffset::east_opt(19_800).expect("valid IST offset"))
        .format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeLogStatus {
    pub available: bool,
    pub reason: Option<String>,
    pub generated_at: String,
    pub timezone: &'static str,
    pub initialized_at: Option<String>,
    pub last_write_at: Option<String>,
    pub file_count: usize,
    pub retained_bytes: u64,
    pub max_file_bytes: u64,
    pub max_files: usize,
    pub max_read_bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeLogChunk {
    /// Ring slot identifier, never an absolute path. Slot zero is newest.
    pub file_id: String,
    pub modified_at: Option<String>,
    pub text: String,
    pub bytes_read: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecentRuntimeLogs {
    pub status: RuntimeLogStatus,
    pub byte_limit: usize,
    pub bytes_read: usize,
    pub truncated: bool,
    /// Oldest to newest among returned tails. A tail may begin mid-line.
    pub chunks: Vec<RuntimeLogChunk>,
}

fn rejected() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "unsafe runtime log path")
}

/// Reject links in every existing component, including app-data ancestors.
fn check_directory(directory: &Path) -> io::Result<()> {
    if !directory.is_absolute() { return Err(rejected()); }
    let mut prefix = PathBuf::new();
    for component in directory.components() {
        if matches!(component, std::path::Component::ParentDir) { return Err(rejected()); }
        prefix.push(component);
        let metadata = fs::symlink_metadata(&prefix)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err(rejected()); }
    }
    Ok(())
}

fn prepare_directory(directory: &Path) -> io::Result<()> {
    check_directory(directory.parent().ok_or_else(rejected)?)?;
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)] {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    match builder.create(directory) {
        Ok(()) => (),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(error),
    }
    check_directory(directory)?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn valid_file(metadata: &fs::Metadata) -> bool {
    if !metadata.is_file() || metadata.file_type().is_symlink() { return false; }
    #[cfg(unix)] {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() != 1 { return false; }
    }
    true
}

/// Never truncates/writes before verifying the opened handle. Hard links are
/// rejected on Unix as well as symlinks; callers cannot supply a path.
fn open_checked(directory: &Path, name: &str, writable: bool) -> io::Result<File> {
    check_directory(directory)?;
    let directory_before = fs::metadata(directory)?;
    let path = directory.join(name);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if !valid_file(&metadata) => return Err(rejected()),
        Ok(_) => (),
        Err(error) if writable && error.kind() == io::ErrorKind::NotFound => (),
        Err(error) => return Err(error),
    }
    let mut options = OpenOptions::new();
    options.read(true).write(writable).create(writable);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
        // Final-component O_NOFOLLOW race defense on supported platforms.
        #[cfg(target_os = "linux")] options.custom_flags(0x20000);
        #[cfg(target_os = "macos")] options.custom_flags(0x100);
    }
    let file = options.open(&path)?;
    check_directory(directory)?;
    let entry = fs::symlink_metadata(&path)?;
    let actual = file.metadata()?;
    if !valid_file(&entry) || !valid_file(&actual) { return Err(rejected()); }
    #[cfg(unix)] {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let directory_after = fs::metadata(directory)?;
        if entry.dev() != actual.dev() || entry.ino() != actual.ino()
            || directory_before.dev() != directory_after.dev()
            || directory_before.ino() != directory_after.ino() { return Err(rejected()); }
        if writable { file.set_permissions(fs::Permissions::from_mode(0o600))?; }
        else if actual.mode() & 0o077 != 0 { return Err(rejected()); }
    }
    #[cfg(not(unix))] let _ = directory_before;
    Ok(file)
}

fn slot_name(slot: usize) -> String { format!("runtime-{slot}.log") }

struct Runtime {
    directory: PathBuf,
    file: Option<File>,
    // OS lock is released automatically on exit; a second process uses stdout.
    _lock: Option<File>,
    file_bytes: u64,
    file_limit: u64,
    initialized_at: String,
    last_write_at: Option<String>,
    failure: Option<String>,
}

impl Runtime {
    fn new(directory: PathBuf, file_limit: u64) -> Self {
        let mut runtime = Self {
            directory, file: None, _lock: None, file_bytes: 0, file_limit,
            initialized_at: india_timestamp(Utc::now()), last_write_at: None, failure: None,
        };
        let result = (|| {
            prepare_directory(&runtime.directory)?;
            let lock = open_checked(&runtime.directory, "runtime.lock", true)?;
            lock.try_lock().map_err(|_| io::Error::new(io::ErrorKind::WouldBlock, "runtime log in use"))?;
            runtime._lock = Some(lock);
            // Historical per-session files are not read, exposed, or deleted.
            for slot in 0..LOG_FILE_COUNT {
                match open_checked(&runtime.directory, &slot_name(slot), false) {
                    Ok(file) if file.metadata()?.len() <= file_limit => (),
                    Ok(_) => return Err(io::Error::new(io::ErrorKind::InvalidData, "oversize runtime log")),
                    Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                    Err(error) => return Err(error),
                }
            }
            let mut file = open_checked(&runtime.directory, &slot_name(0), true)?;
            runtime.file_bytes = file.seek(SeekFrom::End(0))?;
            runtime.file = Some(file);
            Ok(())
        })();
        if let Err(error) = result { runtime.disable(&error); }
        runtime
    }

    fn disable(&mut self, error: &io::Error) {
        self.file = None;
        // No raw OS message/path or user data is exposed or logged.
        self.failure = Some(format!("File logging unavailable ({:?})", error.kind()));
    }

    fn rotate(&mut self) -> io::Result<()> {
        check_directory(&self.directory)?;
        self.file.take();
        for slot in (0..LOG_FILE_COUNT).rev() {
            let name = slot_name(slot);
            match open_checked(&self.directory, &name, false) {
                Ok(_) => {
                    let path = self.directory.join(&name);
                    if slot == LOG_FILE_COUNT - 1 { fs::remove_file(path)?; }
                    else { fs::rename(path, self.directory.join(slot_name(slot + 1)))?; }
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                Err(error) => return Err(error),
            }
        }
        self.file = Some(open_checked(&self.directory, &slot_name(0), true)?);
        self.file_bytes = 0;
        Ok(())
    }

    fn append(&mut self, bytes: &[u8]) -> io::Result<()> {
        if self.file.is_none() { return Ok(()); }
        for chunk in bytes.chunks(self.file_limit.max(1) as usize) {
            if self.file_bytes + chunk.len() as u64 > self.file_limit { self.rotate()?; }
            let current = open_checked(&self.directory, &slot_name(0), false)?;
            let file = self.file.as_mut().ok_or_else(rejected)?;
            #[cfg(unix)] {
                use std::os::unix::fs::MetadataExt;
                let expected = current.metadata()?;
                let actual = file.metadata()?;
                if expected.dev() != actual.dev() || expected.ino() != actual.ino()
                    || !valid_file(&actual) { return Err(rejected()); }
            }
            drop(current);
            file.write_all(chunk)?;
            self.file_bytes += chunk.len() as u64;
            self.last_write_at = Some(india_timestamp(Utc::now()));
        }
        Ok(())
    }

    fn snapshot(&self, limit: usize, read_content: bool) -> RecentRuntimeLogs {
        let mut status = RuntimeLogStatus {
            available: self.file.is_some(), reason: self.failure.clone(),
            generated_at: india_timestamp(Utc::now()), timezone: "Asia/Kolkata",
            initialized_at: Some(self.initialized_at.clone()), last_write_at: self.last_write_at.clone(),
            file_count: 0, retained_bytes: 0, max_file_bytes: self.file_limit,
            max_files: LOG_FILE_COUNT, max_read_bytes: MAX_READ_BYTES,
        };
        let mut chunks = Vec::new();
        let mut remaining = limit;
        let mut bytes_read = 0;
        if status.available {
            for slot in 0..LOG_FILE_COUNT {
                let result = (|| -> io::Result<()> {
                    let mut file = open_checked(&self.directory, &slot_name(slot), false)?;
                    let metadata = file.metadata()?;
                    if metadata.len() > self.file_limit { return Err(rejected()); }
                    status.file_count += 1;
                    status.retained_bytes += metadata.len();
                    if read_content && remaining > 0 && metadata.len() > 0 {
                        let count = remaining.min(metadata.len() as usize);
                        file.seek(SeekFrom::End(-(count as i64)))?;
                        let mut bytes = Vec::with_capacity(count);
                        file.take(count as u64).read_to_end(&mut bytes)?;
                        remaining -= bytes.len();
                        bytes_read += bytes.len();
                        let text = String::from_utf8_lossy(&bytes).into_owned();
                        // Lossy replacement must not inflate the content bound.
                        let text = if text.len() > bytes.len() {
                            let mut start = text.len() - bytes.len();
                            while !text.is_char_boundary(start) { start += 1; }
                            text[start..].to_owned()
                        } else { text };
                        chunks.push(RuntimeLogChunk {
                            file_id: slot_name(slot),
                            modified_at: metadata.modified().ok().map(|time| india_timestamp(time.into())),
                            text, bytes_read: bytes.len(),
                        });
                    }
                    Ok(())
                })();
                if let Err(error) = result {
                    if error.kind() == io::ErrorKind::NotFound { continue; }
                    status.available = false;
                    status.reason = Some(format!("Runtime log read unavailable ({:?})", error.kind()));
                    chunks.clear();
                    bytes_read = 0;
                    break;
                }
            }
        }
        chunks.reverse();
        RecentRuntimeLogs { truncated: read_content && status.retained_bytes > bytes_read as u64,
            status, byte_limit: limit, bytes_read, chunks }
    }
}

struct SafeWriter(Arc<Mutex<Runtime>>);
impl Write for SafeWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let _ = io::stdout().write_all(bytes);
        if let Ok(mut runtime) = self.0.lock() {
            if let Err(error) = runtime.append(bytes) { runtime.disable(&error); }
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> { Ok(()) }
}

/// Free-form messages/errors, paths, URLs, packet fields and span values are
/// excluded. New instrumentation should use these allowlisted fields.
#[derive(Default)]
struct OperationalFields(String);
impl Visit for OperationalFields {
    fn record_bool(&mut self, field: &Field, value: bool) {
        if matches!(field.name(), "success" | "available") {
            self.0.push_str(&format!(" {}={value}", field.name()));
        }
    }
    fn record_u64(&mut self, field: &Field, value: u64) {
        if matches!(field.name(), "count" | "indicators" | "duration_ms") {
            self.0.push_str(&format!(" {}={value}", field.name()));
        }
    }
    fn record_i64(&mut self, field: &Field, value: i64) {
        if value >= 0 { self.record_u64(field, value as u64); }
    }
    fn record_str(&mut self, field: &Field, value: &str) {
        let allowed = match field.name() {
            "platform" => matches!(value, "linux" | "windows" | "macos"),
            "timezone" => value == "Asia/Kolkata",
            "provider" => matches!(value, "ipify" | "ipwho.is"),
            "operation" => matches!(value, "initialize" | "readiness" | "capture_start" | "capture_stop" | "capture_complete" | "import" | "export" | "search" | "refresh" | "scan_buddy_plan" | "scan_buddy_start" | "scan_buddy_status" | "scan_buddy_cancel" | "scan_buddy_history" | "scan_buddy_finish"),
            "state" => matches!(value, "READY" | "UNAVAILABLE" | "NOT_STARTED" | "RUNNING" | "STOPPED" | "COMPLETED" | "FAILED" | "LIVE" | "CACHED" | "ERROR"),
            _ => false,
        };
        if allowed { self.0.push_str(&format!(" {}={value}", field.name())); }
    }
    fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}

struct OperationalFormat;
impl<S, N> FormatEvent<S, N> for OperationalFormat
where S: tracing::Subscriber + for<'a> LookupSpan<'a>, N: for<'a> FormatFields<'a> + 'static {
    fn format_event(&self, _ctx: &FmtContext<'_, S, N>, mut writer: Writer<'_>, event: &tracing::Event<'_>) -> std::fmt::Result {
        let mut fields = OperationalFields::default();
        event.record(&mut fields);
        writeln!(writer, "{} {} {}:{}{}", india_timestamp(Utc::now()), event.metadata().level(), event.metadata().target(), event.metadata().line().unwrap_or(0), fields.0)
    }
}

pub fn init_logging() {
    let runtime = Arc::new(Mutex::new(Runtime::new(crate::database::sqlite::get_app_dir().join("logs"), LOG_FILE_BYTES)));
    if RUNTIME.set(runtime.clone()).is_err() { return; }
    let writer = BoxMakeWriter::new(move || SafeWriter(runtime.clone()));
    let subscriber = tracing_subscriber::fmt().with_max_level(tracing::Level::INFO)
        .with_ansi(false).event_format(OperationalFormat).with_writer(writer).finish();
    if tracing::subscriber::set_global_default(subscriber).is_ok() {
        tracing::info!(platform = std::env::consts::OS, timezone = "Asia/Kolkata", operation = "initialize", "Native backend logging initialized");
    } else if let Some(runtime) = RUNTIME.get() {
        if let Ok(mut runtime) = runtime.lock() {
            runtime.disable(&io::Error::new(io::ErrorKind::AlreadyExists, "subscriber already installed"));
        }
    }
}

pub fn recent_runtime_logs(max_bytes: Option<usize>) -> RecentRuntimeLogs {
    let limit = max_bytes.unwrap_or(DEFAULT_READ_BYTES).clamp(1, MAX_READ_BYTES);
    if let Some(runtime) = RUNTIME.get() {
        if let Ok(runtime) = runtime.lock() { return runtime.snapshot(limit, true); }
    }
    unavailable_snapshot(limit)
}

pub fn runtime_log_status() -> RuntimeLogStatus {
    if let Some(runtime) = RUNTIME.get() {
        if let Ok(runtime) = runtime.lock() { return runtime.snapshot(0, false).status; }
    }
    unavailable_snapshot(0).status
}

fn unavailable_snapshot(limit: usize) -> RecentRuntimeLogs {
    RecentRuntimeLogs {
        status: RuntimeLogStatus {
            available: false, reason: Some("Runtime logging is not initialized or unavailable".into()),
            generated_at: india_timestamp(Utc::now()), timezone: "Asia/Kolkata", initialized_at: None,
            last_write_at: None, file_count: 0, retained_bytes: 0, max_file_bytes: LOG_FILE_BYTES,
            max_files: LOG_FILE_COUNT, max_read_bytes: MAX_READ_BYTES,
        }, byte_limit: limit, bytes_read: 0, truncated: false, chunks: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Sandbox(PathBuf);
    impl Sandbox {
        fn new() -> Self {
            let base = std::env::temp_dir().join(format!("netoze-runtime-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&base).unwrap(); Self(base)
        }
        fn logs(&self) -> PathBuf { self.0.join("logs") }
    }
    impl Drop for Sandbox { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn ist_timestamp_crosses_utc_date_boundary() {
        let utc = DateTime::parse_from_rfc3339("2026-10-03T20:45:00Z").unwrap().with_timezone(&Utc);
        assert_eq!(india_timestamp(utc), "2026-10-04T02:15:00.000+05:30");
    }
    #[test]
    fn rotation_retains_five_bounded_slots_and_newest_tail() {
        let sandbox = Sandbox::new();
        let mut runtime = Runtime::new(sandbox.logs(), 8);
        for number in 0..9 { runtime.append(format!("{number:08}").as_bytes()).unwrap(); }
        let snapshot = runtime.snapshot(12, true);
        assert!(snapshot.status.available);
        assert_eq!(snapshot.status.file_count, 5);
        assert_eq!(snapshot.status.retained_bytes, 40);
        assert_eq!(snapshot.bytes_read, 12);
        assert!(snapshot.truncated);
        assert_eq!(snapshot.chunks.iter().map(|chunk| chunk.text.as_str()).collect::<String>(), "000700000008");
        assert!(!sandbox.logs().join("runtime-5.log").exists());
    }
    #[test]
    fn oversized_writes_and_utf8_reads_obey_byte_bounds() {
        let sandbox = Sandbox::new();
        let mut runtime = Runtime::new(sandbox.logs(), 8);
        runtime.append("ééééééééé".as_bytes()).unwrap();
        let snapshot = runtime.snapshot(3, true);
        assert_eq!(snapshot.bytes_read, 3);
        assert!(snapshot.chunks.iter().map(|chunk| chunk.text.len()).sum::<usize>() <= 3);
        assert!(snapshot.chunks.last().unwrap().text.ends_with('é'));
        assert!(snapshot.truncated);
        assert!(runtime.snapshot(99, true).status.retained_bytes <= 40);
    }
    #[test]
    fn competing_process_lock_and_disk_failure_are_unavailable() {
        let sandbox = Sandbox::new();
        let first = Runtime::new(sandbox.logs(), 8);
        assert!(first.file.is_some());
        let second = Runtime::new(sandbox.logs(), 8);
        assert!(!second.snapshot(8, true).status.available);
        let obstruction = sandbox.0.join("blocked");
        fs::write(&obstruction, "x").unwrap();
        let mut blocked = Runtime::new(obstruction.join("logs"), 8);
        assert!(!blocked.snapshot(8, true).status.available);
        assert!(blocked.append(b"continues").is_ok());
    }
    #[test]
    fn restart_preserves_ring_and_reports_metadata_without_content() {
        let sandbox = Sandbox::new();
        {
            let mut runtime = Runtime::new(sandbox.logs(), 8);
            runtime.append(b"123456789").unwrap();
        }
        let runtime = Runtime::new(sandbox.logs(), 8);
        let status = runtime.snapshot(0, false);
        assert!(status.status.available);
        assert_eq!(status.status.retained_bytes, 9);
        assert_eq!(status.status.file_count, 2);
        assert!(status.status.initialized_at.unwrap().ends_with("+05:30"));
        assert!(status.chunks.is_empty());
        assert!(!status.truncated);
        let recent = runtime.snapshot(99, true);
        assert!(!recent.truncated);
        assert_eq!(recent.bytes_read, 9);
        assert!(recent.chunks.iter().all(|chunk| chunk.modified_at.as_ref().unwrap().ends_with("+05:30")));
    }
    #[test]
    fn unrelated_files_are_neither_returned_nor_removed() {
        let sandbox = Sandbox::new();
        let mut runtime = Runtime::new(sandbox.logs(), 8);
        fs::write(sandbox.logs().join("backend-old.log"), "private legacy").unwrap();
        for _ in 0..8 { runtime.append(b"safe0000").unwrap(); }
        let snapshot = runtime.snapshot(100, true);
        assert!(!snapshot.chunks.iter().any(|chunk| chunk.text.contains("private")));
        assert!(sandbox.logs().join("backend-old.log").exists());
        assert!(check_directory(&sandbox.0.join("logs/../logs")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn private_permissions_and_link_rejection() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let sandbox = Sandbox::new();
        let mut runtime = Runtime::new(sandbox.logs(), 8);
        runtime.append(b"safe").unwrap();
        assert_eq!(fs::metadata(sandbox.logs()).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(fs::metadata(sandbox.logs().join("runtime-0.log")).unwrap().permissions().mode() & 0o777, 0o600);
        let secret = sandbox.0.join("secret");
        fs::write(&secret, "credentials").unwrap();
        fs::remove_file(sandbox.logs().join("runtime-0.log")).unwrap();
        symlink(&secret, sandbox.logs().join("runtime-0.log")).unwrap();
        assert!(!runtime.snapshot(8, true).status.available);
        assert!(runtime.append(b"oops").is_err());
        let shared = Arc::new(Mutex::new(runtime));
        assert_eq!(SafeWriter(shared.clone()).write(b"").unwrap(), 0);
        assert!(!shared.lock().unwrap().snapshot(8, true).status.available);
        assert_eq!(fs::read_to_string(&secret).unwrap(), "credentials");
        fs::remove_file(sandbox.logs().join("runtime-0.log")).unwrap();
        fs::hard_link(&secret, sandbox.logs().join("runtime-0.log")).unwrap();
        assert!(!shared.lock().unwrap().snapshot(8, true).status.available);
        let alias = sandbox.0.join("alias");
        symlink(sandbox.logs(), &alias).unwrap();
        assert!(!Runtime::new(alias, 8).snapshot(8, true).status.available);
    }
    #[cfg(unix)]
    #[test]
    fn readable_permissions_expansion_and_replaced_file_fail_closed() {
        use std::os::unix::fs::PermissionsExt;
        let sandbox = Sandbox::new();
        let mut runtime = Runtime::new(sandbox.logs(), 8);
        runtime.append(b"safe").unwrap();
        let path = sandbox.logs().join("runtime-0.log");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!runtime.snapshot(8, true).status.available);
        fs::remove_file(&path).unwrap();
        fs::write(&path, "new").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(runtime.append(b"x").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "new");
    }
    #[test]
    fn formatter_drops_credentials_paths_payloads_and_free_form_errors() {
        #[derive(Clone)] struct Buffer(Arc<Mutex<Vec<u8>>>);
        impl Write for Buffer {
            fn write(&mut self, bytes: &[u8]) -> io::Result<usize> { self.0.lock().unwrap().extend_from_slice(bytes); Ok(bytes.len()) }
            fn flush(&mut self) -> io::Result<()> { Ok(()) }
        }
        let bytes = Arc::new(Mutex::new(Vec::new()));
        let output = bytes.clone();
        let subscriber = tracing_subscriber::fmt().event_format(OperationalFormat)
            .with_writer(move || Buffer(output.clone())).finish();
        tracing::subscriber::with_default(subscriber, || {
            tracing::warn!(success = false, operation = "export", password = "secret-value", payload = "packet-value", error = "sensitive-error", "token=message-secret /private/path");
        });
        let text = String::from_utf8(bytes.lock().unwrap().clone()).unwrap();
        assert!(text.contains("success=false operation=export"));
        for secret in ["secret-value", "packet-value", "sensitive-error", "message-secret", "/private/path"] { assert!(!text.contains(secret)); }
    }
}

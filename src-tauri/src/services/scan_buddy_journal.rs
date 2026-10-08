//! Private, bounded snapshots only: this module never starts or resumes probes.
//! All calls perform synchronous disk I/O. Call from a blocking worker, never on
//! an async runtime thread or while holding the scan engine's state lock.
//! The caller supplies a dedicated application-owned directory (0700 on Unix),
//! not a user-selected database. The filename must be `scan_buddy_history.db`.
//! Limits apply to active JSON; SQLite pages/rollback overhead are additional.
use super::scan_buddy::{plan, ScanJob, ScanRequest};
use rusqlite::{params, Connection, OpenFlags, Transaction};
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const MAX_JOB: usize = 2 * 1024 * 1024;
const MAX_TOTAL: usize = 16 * 1024 * 1024;
const RECOVERY: &str = "App stopped before scan completed; pending probes were not resumed";
const IO_ERROR: &str = "Scan history storage is unavailable";
const INVALID: &str = "Scan history snapshot is invalid or exceeds its limits";

pub struct ScanJournal {
    connection: Mutex<Connection>,
    warnings: Mutex<Vec<String>>,
    path: PathBuf,
}

impl ScanJournal {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if path.file_name().and_then(|s| s.to_str()) != Some("scan_buddy_history.db") {
            return Err("Scan history requires its dedicated database filename".into());
        }
        check_parent(&path)?;
        if !path.exists() {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            options.open(&path).map_err(|_| IO_ERROR.to_string())?;
        }
        check_file(&path)?;
        // DELETE journaling needs no persistent WAL/SHM. Refuse unexpected
        // sidecars rather than allowing SQLite to follow an attacker-owned one.
        for suffix in ["-journal", "-wal", "-shm"] {
            let sidecar = PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix));
            if fs::symlink_metadata(&sidecar).is_ok() { check_file(&sidecar)?; }
        }
        let before = fs::metadata(&path).map_err(|_| IO_ERROR.to_string())?;
        let conn = Connection::open_with_flags(&path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)
            .map_err(|_| IO_ERROR.to_string())?;
        check_file(&path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let after = fs::metadata(&path).map_err(|_| IO_ERROR.to_string())?;
            if before.dev() != after.dev() || before.ino() != after.ino() { return Err(IO_ERROR.into()); }
        }
        #[cfg(not(unix))]
        let _ = before;
        conn.busy_timeout(Duration::from_millis(250)).map_err(|_| IO_ERROR.to_string())?;
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
        if version != 0 && version != 1 { return Err("Scan history schema version is unsupported".into()); }
        if version == 0 {
            let tables: i64 = conn.query_row("SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'", [], |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
            if tables != 0 { return Err("Scan history schema is not recognized".into()); }
            conn.execute_batch("PRAGMA page_size=4096; PRAGMA auto_vacuum=INCREMENTAL;
                BEGIN IMMEDIATE;
                CREATE TABLE scan_jobs(id TEXT PRIMARY KEY NOT NULL, started_us INTEGER NOT NULL,
                    snapshot TEXT NOT NULL CHECK(length(CAST(snapshot AS BLOB)) <= 2097152));
                PRAGMA user_version=1; COMMIT;").map_err(|_| IO_ERROR.to_string())?;
        }
        let vacuum: i64 = conn.pragma_query_value(None, "auto_vacuum", |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
        let page_size: i64 = conn.pragma_query_value(None, "page_size", |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
        let pages: i64 = conn.pragma_query_value(None, "page_count", |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
        if vacuum != 2 || page_size != 4096 || pages > 4608 { return Err("Scan history storage format is unsupported".into()); }
        // 18 MiB page ceiling includes indexes and page overhead, not rollback
        // journals. Incremental maintenance below keeps reusable pages bounded.
        conn.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
            PRAGMA trusted_schema=OFF; PRAGMA max_page_count=4608;").map_err(|_| IO_ERROR.to_string())?;
        Ok(Self { connection: Mutex::new(conn), warnings: Mutex::new(Vec::new()), path })
    }

    /// Safe, count-only warnings from the most recent load. Surface in the UI.
    pub fn warnings(&self) -> Vec<String> {
        self.warnings.lock().map(|w| w.clone()).unwrap_or_else(|_| vec![IO_ERROR.into()])
    }

    pub fn save(&self, job: &ScanJob) -> Result<(), String> {
        let (json, started) = snapshot(job)?;
        check_file(&self.path)?;
        let mut conn = self.connection.lock().map_err(|_| IO_ERROR.to_string())?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|_| IO_ERROR.to_string())?;
        upsert(&tx, job, &json, started)?;
        prune(&tx)?;
        tx.commit().map_err(|_| IO_ERROR.to_string())?;
        maintain(&conn);
        Ok(())
    }

    /// Returns newest-started first. RUNNING snapshots are terminalized and
    /// committed before returning; partial results survive, nothing is resumed.
    pub fn load(&self) -> Result<Vec<ScanJob>, String> {
        check_file(&self.path)?;
        let mut warnings = self.warnings.lock().map_err(|_| IO_ERROR.to_string())?;
        warnings.clear();
        let mut conn = self.connection.lock().map_err(|_| IO_ERROR.to_string())?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|_| IO_ERROR.to_string())?;
        let (count, bytes): (i64, i64) = tx.query_row(
            "SELECT count(*), coalesce(sum(length(CAST(snapshot AS BLOB))),0) FROM scan_jobs", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| IO_ERROR.to_string())?;
        if !(0..=8).contains(&count) || !(0..=MAX_TOTAL as i64).contains(&bytes) {
            warnings.push("Scan history exceeded storage bounds and was not loaded".into());
            return Err(INVALID.into());
        }
        let mut jobs = Vec::new();
        let mut skipped = 0;
        {
            let mut statement = tx.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=128 THEN id END,
                started_us, CASE WHEN typeof(snapshot)='text' AND length(CAST(snapshot AS BLOB))<=2097152 THEN snapshot END
                FROM scan_jobs ORDER BY started_us DESC, id DESC LIMIT 8").map_err(|_| IO_ERROR.to_string())?;
            let rows = statement.query_map([], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?)))
                .map_err(|_| IO_ERROR.to_string())?;
            for row in rows {
                let parsed = row.ok().and_then(|(id, started, json)| {
                    let job: ScanJob = serde_json::from_str(&json?).ok()?;
                    if id? != job.id || validate(&job).ok()? != started { return None; }
                    Some(job)
                });
                match parsed { Some(job) => jobs.push(job), None => skipped += 1 }
            }
        }
        let mut recovered = 0;
        for job in &mut jobs {
            if job.state == "RUNNING" {
                job.state = "FAILED".into();
                job.error = Some(RECOVERY.into());
                job.finished_at = Some(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
                let (json, started) = snapshot(job)?;
                upsert(&tx, job, &json, started)?;
                recovered += 1;
            }
        }
        prune(&tx)?;
        tx.commit().map_err(|_| IO_ERROR.to_string())?;
        maintain(&conn);
        if skipped > 0 { warnings.push(format!("Skipped {skipped} invalid scan history entries")); }
        if recovered > 0 { warnings.push(format!("Recovered {recovered} interrupted scan jobs without resuming probes")); }
        Ok(jobs)
    }
}

fn upsert(tx: &Transaction<'_>, job: &ScanJob, json: &str, started: i64) -> Result<(), String> {
    tx.execute("INSERT INTO scan_jobs(id,started_us,snapshot) VALUES(?1,?2,?3)
        ON CONFLICT(id) DO UPDATE SET started_us=excluded.started_us,snapshot=excluded.snapshot",
        params![job.id, started, json]).map_err(|_| IO_ERROR.to_string())?;
    Ok(())
}
fn prune(tx: &Transaction<'_>) -> Result<(), String> {
    tx.execute("DELETE FROM scan_jobs WHERE id NOT IN (SELECT id FROM scan_jobs ORDER BY started_us DESC,id DESC LIMIT 8)", [])
        .map_err(|_| IO_ERROR.to_string())?;
    let bytes: i64 = tx.query_row("SELECT coalesce(sum(length(CAST(snapshot AS BLOB))),0) FROM scan_jobs", [], |r| r.get(0)).map_err(|_| IO_ERROR.to_string())?;
    if bytes > MAX_TOTAL as i64 { return Err(INVALID.into()); }
    Ok(())
}
fn maintain(conn: &Connection) {
    // Best effort after a successful durable commit; a maintenance failure does
    // not falsely report the committed write as failed. Page ceiling remains.
    let _ = conn.execute_batch("PRAGMA incremental_vacuum(64)");
}
fn snapshot(job: &ScanJob) -> Result<(String, i64), String> {
    let started = validate(job)?;
    let json = serde_json::to_string(job).map_err(|_| INVALID.to_string())?;
    if json.len() > MAX_JOB { return Err(INVALID.into()); }
    Ok((json, started))
}
fn utc(value: &str) -> Result<i64, String> {
    if value.len() > 40 { return Err(INVALID.into()); }
    let time = chrono::DateTime::parse_from_rfc3339(value).map_err(|_| INVALID.to_string())?;
    if time.offset().local_minus_utc() != 0 { return Err(INVALID.into()); }
    Ok(time.timestamp_micros())
}
fn validate(job: &ScanJob) -> Result<i64, String> {
    let bad = || INVALID.to_string();
    if job.id.is_empty() || job.id.len() > 128 || !job.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || !matches!(job.state.as_str(), "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED")
        || job.plan.targets.is_empty() || job.plan.targets.len() > 32 || job.plan.ports.is_empty() || job.plan.ports.len() > 256
        || job.results.len() > 4096 || job.completed_probes != job.results.len()
        || job.plan.warnings.len() > 8 || job.plan.warnings.iter().any(|w| w.len() > 1024)
        || job.error.as_ref().map(|e| e.len() > 2048).unwrap_or(false) { return Err(bad()); }
    let started = utc(&job.started_at)?;
    if (job.state == "RUNNING") != job.finished_at.is_none() { return Err(bad()); }
    if let Some(finished) = &job.finished_at { if utc(finished)? < started { return Err(bad()); } }
    if job.plan.targets.iter().any(|s| s.len() > 45 || s.parse::<std::net::IpAddr>().is_err()) { return Err(bad()); }
    let checked = plan(&ScanRequest { targets: job.plan.targets.join(","),
        ports: job.plan.ports.iter().map(u16::to_string).collect::<Vec<_>>().join(","),
        timeout_ms: job.plan.timeout_ms, concurrency: job.plan.concurrency, authorized: false }).map_err(|_| bad())?;
    let targets: BTreeSet<_> = job.plan.targets.iter().cloned().collect();
    let ports: BTreeSet<_> = job.plan.ports.iter().copied().collect();
    if targets.len() != job.plan.targets.len() || ports.len() != job.plan.ports.len()
        || targets != checked.targets.into_iter().collect() || ports != checked.ports.into_iter().collect()
        || job.plan.total_probes != checked.total_probes || job.completed_probes > checked.total_probes
        || (job.state == "COMPLETED" && job.completed_probes != checked.total_probes) { return Err(bad()); }
    let mut unique = BTreeSet::new();
    for row in &job.results {
        if !targets.contains(&row.target) || !ports.contains(&row.port) || !unique.insert((&row.target, row.port))
            || !matches!(row.state.as_str(), "OPEN" | "CLOSED" | "TIMEOUT" | "UNREACHABLE" | "ERROR")
            || row.reason.len() > 512 || row.service_hint.len() > 256 || utc(&row.observed_at)? < started { return Err(bad()); }
    }
    Ok(started)
}

fn check_parent(path: &Path) -> Result<(), String> {
    if !path.is_absolute() { return Err("Scan history requires an absolute application path".into()); }
    let parent = path.parent().ok_or(IO_ERROR)?;
    let mut current = PathBuf::new();
    for component in parent.components() {
        if matches!(component, Component::ParentDir | Component::CurDir) { return Err(IO_ERROR.into()); }
        current.push(component);
        let meta = fs::symlink_metadata(&current).map_err(|_| IO_ERROR.to_string())?;
        if !meta.is_dir() || meta.file_type().is_symlink() { return Err("Scan history directory is unsafe".into()); }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(parent).map_err(|_| IO_ERROR.to_string())?.permissions().mode() & 0o077 != 0 {
            return Err("Scan history requires a private application directory".into());
        }
    }
    Ok(())
}
fn check_file(path: &Path) -> Result<(), String> {
    check_parent(path)?;
    let meta = fs::symlink_metadata(path).map_err(|_| IO_ERROR.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() { return Err("Scan history file is unsafe".into()); }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let parent = fs::metadata(path.parent().ok_or(IO_ERROR)?).map_err(|_| IO_ERROR.to_string())?;
        if meta.nlink() != 1 || meta.uid() != parent.uid() || meta.permissions().mode() & 0o777 != 0o600 {
            return Err("Scan history requires a private, single-link regular file".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::scan_buddy::ScanResult;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!("scan-journal-test-{}-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&path).unwrap();
            #[cfg(unix)]
            { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap(); }
            Self(path)
        }
        fn db(&self) -> PathBuf { self.0.join("scan_buddy_history.db") }
    }
    impl Drop for Temp { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
    fn job(index: u32) -> ScanJob {
        let started = format!("2026-01-01T00:00:{index:02}.000Z");
        ScanJob { id: format!("scan-{index}"), state: "COMPLETED".into(), started_at: started.clone(), finished_at: Some(started.clone()),
            plan: plan(&ScanRequest { targets: "127.0.0.1".into(), ports: "80,443".into(), timeout_ms: 100, concurrency: 1, authorized: false }).unwrap(),
            completed_probes: 2, error: None,
            results: [80, 443].into_iter().map(|port| ScanResult { target: "127.0.0.1".into(), port, state: "CLOSED".into(),
                reason: String::new(), service_hint: "Unverified port hint".into(), latency_ms: 1, observed_at: started.clone() }).collect() }
    }
    #[test]
    fn save_reopen_retention_and_update_preserves_start_order() {
        let temp = Temp::new();
        let journal = ScanJournal::open(temp.db()).unwrap();
        for index in 0..10 { journal.save(&job(index)).unwrap(); }
        let mut updated = job(2); updated.results[0].reason = "Connection refused".into();
        journal.save(&updated).unwrap();
        drop(journal);
        let reopened = ScanJournal::open(temp.db()).unwrap();
        let jobs = reopened.load().unwrap();
        assert_eq!(jobs.len(), 8); assert_eq!(jobs[0].id, "scan-9"); assert_eq!(jobs[7].id, "scan-2");
        assert_eq!(jobs[7].results[0].reason, "Connection refused");
        assert!(reopened.warnings().is_empty());
        let conn = reopened.connection.lock().unwrap();
        let pages: i64 = conn.pragma_query_value(None, "max_page_count", |r| r.get(0)).unwrap();
        assert_eq!(pages, 4608);
    }
    #[test]
    fn interrupted_jobs_recover_once_and_keep_partial_rows() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        let mut running = job(1); running.state = "RUNNING".into(); running.finished_at = None;
        running.results.pop(); running.completed_probes = 1;
        journal.save(&running).unwrap();
        let recovered = journal.load().unwrap().pop().unwrap();
        assert_eq!(recovered.state, "FAILED"); assert_eq!(recovered.error.as_deref(), Some(RECOVERY));
        assert_eq!(recovered.results.len(), 1); assert_eq!(recovered.results[0].port, 80);
        assert!(recovered.finished_at.is_some()); assert_eq!(journal.warnings().len(), 1);
        drop(journal);
        let reopened = ScanJournal::open(temp.db()).unwrap();
        let loaded = reopened.load().unwrap();
        assert_eq!(loaded.len(), 1); assert_eq!(loaded[0].finished_at, recovered.finished_at);
        assert!(reopened.warnings().is_empty());
        // No engine, async runtime or socket exists in this test: load only
        // terminalizes stored JSON and cannot duplicate network activity.
    }
    #[test]
    fn malformed_json_and_invalid_model_are_skipped_with_safe_counts() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        journal.save(&job(1)).unwrap();
        let conn = journal.connection.lock().unwrap();
        conn.execute("INSERT INTO scan_jobs VALUES('broken',0,'not json')", []).unwrap();
        let mut bad = job(2); bad.results[1] = bad.results[0].clone();
        conn.execute("INSERT INTO scan_jobs VALUES(?1,?2,?3)", params![bad.id, utc(&bad.started_at).unwrap(), serde_json::to_string(&bad).unwrap()]).unwrap();
        drop(conn);
        assert_eq!(journal.load().unwrap().len(), 1);
        assert_eq!(journal.warnings(), vec!["Skipped 2 invalid scan history entries"]);
        assert!(journal.save(&bad).is_err());
        bad = job(2); bad.plan.targets[0] = "example.com".into(); assert!(journal.save(&bad).is_err());
        bad = job(2); bad.completed_probes = 1; assert!(journal.save(&bad).is_err());
        bad = job(2); bad.plan.ports[0] = 0; assert!(journal.save(&bad).is_err());
        bad = job(2); bad.plan.concurrency = 17; assert!(journal.save(&bad).is_err());
        bad = job(2); bad.plan.timeout_ms = 99; assert!(journal.save(&bad).is_err());
    }
    #[test]
    fn strict_row_bounds_and_unknown_versions_fail_closed() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        let conn = journal.connection.lock().unwrap();
        for i in 0..9 { conn.execute("INSERT INTO scan_jobs VALUES(?1,0,'{}')", [format!("bad-{i}")]).unwrap(); }
        drop(conn);
        assert!(journal.load().is_err()); assert_eq!(journal.warnings().len(), 1);
        journal.connection.lock().unwrap().execute_batch("PRAGMA user_version=99").unwrap();
        drop(journal); assert!(ScanJournal::open(temp.db()).is_err());
    }
    #[test]
    fn failed_write_does_not_change_previous_snapshot() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        journal.save(&job(1)).unwrap();
        journal.connection.lock().unwrap().execute_batch("PRAGMA query_only=ON").unwrap();
        assert_eq!(journal.save(&job(2)).unwrap_err(), IO_ERROR);
        journal.connection.lock().unwrap().execute_batch("PRAGMA query_only=OFF").unwrap();
        assert_eq!(journal.load().unwrap().len(), 1);
    }
    #[test]
    fn oversized_snapshots_are_rejected_on_save_and_skipped_on_load() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        let mut large = job(1);
        large.plan = plan(&ScanRequest { targets: (1..=16).map(|n| format!("127.0.0.{n}")).collect::<Vec<_>>().join(","),
            ports: "1-256".into(), timeout_ms: 100, concurrency: 16, authorized: false }).unwrap();
        large.results.clear();
        for target in &large.plan.targets {
            for port in &large.plan.ports {
                large.results.push(ScanResult { target: target.clone(), port: *port, state: "CLOSED".into(), reason: "r".repeat(512),
                    service_hint: "s".repeat(256), latency_ms: 1, observed_at: large.started_at.clone() });
            }
        }
        large.completed_probes = large.results.len();
        assert_eq!(large.completed_probes, 4096); assert!(validate(&large).is_ok());
        assert!(journal.save(&large).is_err());
        journal.save(&job(2)).unwrap();
        let conn = journal.connection.lock().unwrap();
        conn.execute_batch("PRAGMA ignore_check_constraints=ON").unwrap();
        conn.execute("INSERT INTO scan_jobs VALUES('oversized',0,?1)", ["x".repeat(MAX_JOB + 1)]).unwrap();
        drop(conn);
        assert_eq!(journal.load().unwrap().len(), 1);
        assert_eq!(journal.warnings(), vec!["Skipped 1 invalid scan history entries"]);
    }
    #[test]
    fn busy_writer_times_out_without_repeating_or_losing_saved_data() {
        let temp = Temp::new(); let journal = ScanJournal::open(temp.db()).unwrap();
        journal.save(&job(1)).unwrap();
        let other = Connection::open(temp.db()).unwrap();
        other.execute_batch("BEGIN IMMEDIATE").unwrap();
        let began = std::time::Instant::now();
        assert_eq!(journal.save(&job(2)).unwrap_err(), IO_ERROR);
        assert!(began.elapsed() < Duration::from_secs(2));
        other.execute_batch("ROLLBACK").unwrap();
        assert_eq!(journal.load().unwrap().len(), 1);
    }
    #[cfg(unix)]
    #[test]
    fn private_permissions_and_link_rejection() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let temp = Temp::new();
        let journal = ScanJournal::open(temp.db()).unwrap(); drop(journal);
        assert_eq!(fs::metadata(temp.db()).unwrap().permissions().mode() & 0o777, 0o600);
        fs::set_permissions(temp.db(), fs::Permissions::from_mode(0o644)).unwrap();
        assert!(ScanJournal::open(temp.db()).is_err());
        fs::set_permissions(temp.db(), fs::Permissions::from_mode(0o600)).unwrap();
        let linked = temp.0.join("linked.db"); fs::hard_link(temp.db(), &linked).unwrap();
        assert!(ScanJournal::open(temp.db()).is_err()); fs::remove_file(&linked).unwrap();
        fs::rename(temp.db(), &linked).unwrap(); symlink(&linked, temp.db()).unwrap();
        assert!(ScanJournal::open(temp.db()).is_err()); fs::remove_file(temp.db()).unwrap();
        fs::rename(&linked, temp.db()).unwrap();
        fs::set_permissions(&temp.0, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(ScanJournal::open(temp.db()).is_err());
        fs::set_permissions(&temp.0, fs::Permissions::from_mode(0o700)).unwrap();
    }
}

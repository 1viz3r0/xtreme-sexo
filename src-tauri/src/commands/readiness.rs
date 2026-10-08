//! Passive startup diagnostics: no processes, network probes, or capture handles.
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct StorageReadiness {
    pub initialized: bool,
    pub path: Option<String>,
    pub schema_readable: bool,
    pub read_write_open: bool,
    pub writes_verified: bool,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct NativeToolReadiness {
    pub name: String,
    pub available: bool,
    pub path: Option<String>,
    pub purpose: String,
}

#[derive(Debug, Serialize)]
pub struct CaptureReadiness {
    pub library: String,
    pub enumeration: String,
    pub interface_count: Option<usize>,
    pub permission: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct ReadinessError {
    pub source: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct BackendReadiness {
    pub checked_at: String,
    pub platform: String,
    pub architecture: String,
    pub platform_supported: bool,
    pub storage: StorageReadiness,
    pub native_tools: Vec<NativeToolReadiness>,
    pub capture: CaptureReadiness,
    pub last_errors: Vec<ReadinessError>,
    pub error_scope: String,
    pub guidance: Vec<String>,
}

fn storage_readiness(path: Option<&Path>, initial_error: Option<String>) -> (StorageReadiness, Vec<ReadinessError>) {
    let mut errors = Vec::new();
    let mut result = StorageReadiness {
        initialized: path.is_some() && initial_error.is_none(),
        path: path.map(|p| p.to_string_lossy().into_owned()),
        schema_readable: false,
        read_write_open: false,
        writes_verified: false,
        detail: "Storage was not initialized.".into(),
    };
    if let Some(message) = initial_error {
        errors.push(ReadinessError { source: "storage initialization".into(), message });
    }
    if let Some(path) = path {
        // Never create a missing database or run a migration during a health check.
        let read = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .and_then(|conn| conn.query_row("SELECT key, value FROM app_config LIMIT 1", [], |_| Ok(())).optional());
        match read {
            Ok(_) => result.schema_readable = true,
            Err(error) => errors.push(ReadinessError { source: "storage schema read".into(), message: error.to_string() }),
        }
        match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE) {
            Ok(conn) => match conn.is_readonly(rusqlite::DatabaseName::Main) {
                Ok(false) => result.read_write_open = true,
                Ok(true) => errors.push(ReadinessError { source: "storage access".into(), message: "SQLite opened the database read-only.".into() }),
                Err(error) => errors.push(ReadinessError { source: "storage access".into(), message: error.to_string() }),
            },
            Err(error) => errors.push(ReadinessError { source: "storage read-write open".into(), message: error.to_string() }),
        }
        result.detail = "Schema read and read-write open checked without changing data. Write transactions, journal access and free space are not verified.".into();
    }
    (result, errors)
}

use rusqlite::OptionalExtension;

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else { return false; };
    if !metadata.is_file() { return false; }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    { true }
}

fn native_tool(name: &str, purpose: &str) -> NativeToolReadiness {
    let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let path = std::env::var_os("PATH").and_then(|value| {
        std::env::split_paths(&value).filter(|p| p.is_absolute())
            .map(|p| p.join(&file)).find(|p| executable(p))
    });
    NativeToolReadiness {
        name: name.into(), available: path.is_some(),
        path: path.map(|p| p.to_string_lossy().into_owned()), purpose: purpose.into(),
    }
}

fn capture_result(result: Result<usize, String>, supported: bool) -> (CaptureReadiness, Option<ReadinessError>) {
    let mut capture = CaptureReadiness {
        library: if cfg!(windows) { "Npcap" } else { "libpcap" }.into(),
        enumeration: "UNAVAILABLE".into(), interface_count: None,
        permission: "NOT_TESTED".into(),
        detail: "Interface enumeration does not establish capture permission. No interface is opened by this check.".into(),
    };
    if !supported {
        capture.detail = "Native capture is supported on Windows and Linux only.".into();
        return (capture, None);
    }
    match result {
        Ok(count) => {
            capture.enumeration = "AVAILABLE".into();
            capture.interface_count = Some(count);
            if count == 0 { capture.detail.push_str(" The library returned no interfaces."); }
            (capture, None)
        }
        Err(message) => (capture, Some(ReadinessError { source: "capture enumeration".into(), message })),
    }
}

#[tauri::command]
pub async fn get_backend_readiness(state: tauri::State<'_, crate::state::BackendState>) -> Result<BackendReadiness, String> {
    let path: Option<PathBuf> = state.sqlite_path.clone();
    let storage_error = state.storage_error.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let supported = cfg!(any(windows, target_os = "linux"));
        let (storage, mut last_errors) = storage_readiness(path.as_deref(), storage_error);
        let enumeration = if supported { pcap::Device::list().map(|list| list.len()).map_err(|e| e.to_string()) } else { Ok(0) };
        let (capture, capture_error) = capture_result(enumeration, supported);
        if let Some(error) = capture_error { last_errors.push(error); }
        let mut native_tools = vec![native_tool("ping", "Explicit ping checks"), native_tool("arp", "Local neighbor inventory")];
        if cfg!(target_os = "linux") { native_tools.push(native_tool("journalctl", "Local system event reads")); }
        let mut guidance = vec!["Tool availability means an executable file was found in PATH; execution and permissions were not tested.".into()];
        if !storage.initialized || !storage.schema_readable || !storage.read_write_open {
            guidance.push("Check the database path and its parent directory permissions for your signed-in user, then restart NET0ZE. Keep the database when repairing permissions.".into());
        }
        if cfg!(windows) {
            guidance.push("For capture on Windows, install Npcap with WinPcap API compatibility. If Npcap was restricted to administrators, use an approved administrator session when explicitly starting capture.".into());
            guidance.push("If the desktop cannot launch, install Microsoft Edge WebView2 Runtime and check Npcap's runtime libraries.".into());
        } else if cfg!(target_os = "linux") {
            guidance.push("On Linux, install your distribution's libpcap runtime and WebKitGTK 4.1 packages. Missing ping/arp tools are normally supplied by iputils-ping and net-tools (package names vary).".into());
            guidance.push("Capture may require CAP_NET_RAW/CAP_NET_ADMIN granted by your administrator to the installed executable. Journal access depends on your distribution's journal group permissions; restart your session after group changes.".into());
        }
        BackendReadiness {
            checked_at: chrono::Utc::now().to_rfc3339(), platform: std::env::consts::OS.into(), architecture: std::env::consts::ARCH.into(), platform_supported: supported,
            storage, native_tools, capture, last_errors,
            error_scope: "Storage initialization error and this check's errors only. Capture worker error history is not retained by this diagnostic.".into(), guidance,
        }
    }).await.map_err(|e| format!("Readiness check failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enumeration_never_claims_permission() {
        for count in [0, 3] {
            let (capture, error) = capture_result(Ok(count), true);
            assert_eq!(capture.permission, "NOT_TESTED");
            assert_eq!(capture.interface_count, Some(count));
            assert!(error.is_none());
        }
        let (capture, error) = capture_result(Err("driver unavailable".into()), true);
        assert_eq!(capture.enumeration, "UNAVAILABLE");
        assert_eq!(capture.permission, "NOT_TESTED");
        assert_eq!(error.unwrap().message, "driver unavailable");
    }

    #[test]
    fn initialization_failure_is_preserved() {
        let (storage, errors) = storage_readiness(None, Some("permission denied".into()));
        assert!(!storage.initialized && !storage.schema_readable && !storage.read_write_open);
        assert!(!storage.writes_verified);
        assert_eq!(errors[0].message, "permission denied");
    }

    #[test]
    fn schema_check_accepts_empty_config_and_never_creates_missing_database() {
        let path = std::env::temp_dir().join(format!("netoze-readiness-{}-{}.db", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let (missing, errors) = storage_readiness(Some(&path), None);
        assert!(!missing.schema_readable && !missing.read_write_open);
        assert!(!errors.is_empty());
        assert!(!path.exists());

        let conn = Connection::open(&path).unwrap();
        conn.execute("CREATE TABLE app_config (key TEXT, value TEXT)", []).unwrap();
        drop(conn);
        let before = std::fs::read(&path).unwrap();
        let (storage, errors) = storage_readiness(Some(&path), None);
        assert!(storage.schema_readable && storage.read_write_open);
        assert!(!storage.writes_verified);
        assert!(errors.is_empty());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_file(path).unwrap();
    }
}

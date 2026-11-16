//! Test-only DB isolation helpers for the unit-test binary.
//!
//! `NETOZE_TEST_DATA_HOME` is a process-wide environment override: any test
//! that opens the default application database must not run while another
//! test points the override at a disposable directory. Both sides therefore
//! take the same mutex for the whole of their body.

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

pub(crate) static DB_ENV_LOCK: Mutex<()> = Mutex::new(());

fn lock() -> MutexGuard<'static, ()> {
    DB_ENV_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Guard for tests that intentionally use the default application database:
/// holds the DB-env mutex so no concurrent test flips the storage override.
pub(crate) struct DbEnvGuard {
    _lock: MutexGuard<'static, ()>,
}

pub(crate) fn hold_db_env() -> DbEnvGuard {
    DbEnvGuard { _lock: lock() }
}

/// Disposable storage for unit tests. Never touches installed user data.
/// The mutex is held for the whole lifetime of the guard.
pub(crate) struct IsolatedData {
    root: PathBuf,
    previous: Option<OsString>,
    _lock: MutexGuard<'static, ()>,
}

pub(crate) fn isolated_data(label: &str) -> IsolatedData {
    let lock = lock();
    let nonce: String = {
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).expect("OS entropy");
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    };
    let root = std::env::temp_dir().join(format!("netoze-improvement-test-data-{label}-{nonce}"));
    std::fs::create_dir_all(&root).expect("create isolated test storage");
    let previous = std::env::var_os("NETOZE_TEST_DATA_HOME");
    std::env::set_var("NETOZE_TEST_DATA_HOME", &root);
    assert!(
        crate::database::sqlite::get_app_dir().starts_with(&root),
        "platform data resolution must honor isolated storage before any test writes"
    );
    IsolatedData { root, previous, _lock: lock }
}

impl Drop for IsolatedData {
    fn drop(&mut self) {
        match &self.previous {
            Some(value) => std::env::set_var("NETOZE_TEST_DATA_HOME", value),
            None => std::env::remove_var("NETOZE_TEST_DATA_HOME"),
        }
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

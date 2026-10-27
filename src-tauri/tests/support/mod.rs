//! Disposable storage for native integration tests. Never touch installed data.
use std::{ffi::OsString, path::PathBuf, sync::{Mutex, MutexGuard}};

static DATA_LOCK: Mutex<()> = Mutex::new(());

pub struct IsolatedData {
    root: PathBuf,
    previous: Vec<(&'static str, Option<OsString>)>,
    _lock: MutexGuard<'static, ()>,
}

pub fn isolated_data(label: &str) -> IsolatedData {
    // Environment-based storage selection is process-wide, including parallel tests.
    let lock = DATA_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).expect("OS entropy for isolated test storage");
    let nonce: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    let root = std::env::temp_dir().join(format!("netoze-improvement-test-data-{label}-{nonce}"));
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&root).expect("create isolated test storage");
    let names = ["XDG_DATA_HOME", "APPDATA", "LOCALAPPDATA", "NETOZE_TEST_DATA_HOME"];
    let previous = names.iter().map(|&name| (name, std::env::var_os(name))).collect();
    let guard = IsolatedData { root, previous, _lock: lock };
    for name in names { std::env::set_var(name, &guard.root); }
    assert!(netoze_desktop::database::sqlite::get_app_dir().starts_with(&guard.root),
        "platform data resolution must honor isolated storage before any test writes");
    guard
}

impl Drop for IsolatedData {
    fn drop(&mut self) {
        for (name, value) in &self.previous {
            match value {
                Some(value) => std::env::set_var(name, value),
                None => std::env::remove_var(name),
            }
        }
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

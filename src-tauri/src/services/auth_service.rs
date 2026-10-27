// NET0ZE local authentication service.
//
// Design (per product pass constraints):
// - Real backend auth, NOT frontend-only. Every command validates the session
//   token and the user role inside the Rust backend.
// - Passwords are hashed with PBKDF2-HMAC-SHA256 (built on the existing `sha2`
//   dependency). OS cryptographic entropy supplies each unique 16-byte salt.
// - Credentials/sessions/activity are persisted in `netoze_auth.json` inside the
//   app data directory (no SQLite schema changes).
// - The first registered account becomes ADMIN; all later accounts are NORMAL
//   USER. Role updates are only possible by editing the local store file — a
//   frontend manipulator cannot escalate.
// - Login rate limiting: 5 consecutive failures locks the account for 15 minutes.
// - Session tokens: 32 random bytes, stored only as SHA-256 hashes, 8h TTL.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

const AUTH_FILE: &str = "netoze_auth.json";
const SALT_BYTES: usize = 16;
const TOKEN_BYTES: usize = 32;
const PBKDF2_ITERATIONS: u32 = 600_000;
const MAX_AUTH_BYTES: u64 = 8 * 1024 * 1024;
const MAX_FAILED_ATTEMPTS: i64 = 5;
const LOCKOUT_SECS: i64 = 900;
const SESSION_TTL_SECS: i64 = 8 * 60 * 60;
const MAX_ACTIVITY_ENTRIES: usize = 1000;

static AUTH_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub salt: String,
    pub hash: String,
    pub iterations: u32,
    pub status: String,
    pub locked_until: i64,
    pub failed_attempts: i64,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub user_id: String,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: i64,
    pub timestamp: i64,
    pub actor_email: String,
    pub action: String,
    pub detail: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AuthStore {
    pub version: u32,
    pub users: HashMap<String, StoredUser>,
    pub sessions: HashMap<String, StoredSession>,
    pub activity: Vec<ActivityEntry>,
    pub next_activity_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub user: PublicUser,
    pub token: String,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn entropy_bytes(n: usize) -> Result<Vec<u8>, String> {
    let mut out = vec![0u8; n];
    getrandom::fill(&mut out).map_err(|_| "Secure OS entropy is unavailable".to_string())?;
    Ok(out)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn sha256_hex(data: &[u8]) -> String {
    to_hex(&Sha256::digest(data))
}

fn equal_secret(expected: &[u8], candidate: &[u8]) -> bool {
    let mut difference = expected.len() ^ candidate.len();
    for (index, byte) in expected.iter().enumerate() {
        difference |= (byte ^ candidate.get(index).copied().unwrap_or(0)) as usize;
    }
    difference == 0
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut k = [0u8; BLOCK];
    if key.len() > BLOCK {
        let d = Sha256::digest(key);
        k[..32].copy_from_slice(&d);
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(data);
    let inner_digest = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);
    let out = outer.finalize();
    let mut result = [0u8; 32];
    result.copy_from_slice(&out);
    result
}

fn pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    let mut block: Vec<u8> = Vec::with_capacity(salt.len() + 4);
    block.extend_from_slice(salt);
    block.extend_from_slice(&1u32.to_be_bytes());
    let mut u = hmac_sha256(password, &block);
    let mut t = u;
    for _ in 1..iterations {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            t[i] ^= u[i];
        }
    }
    t
}

fn auth_path() -> PathBuf {
    let mut p = crate::database::sqlite::get_app_dir();
    p.push(AUTH_FILE);
    p
}

fn load_store() -> Result<AuthStore, String> {
    load_store_at(&auth_path())
}

fn save_store(store: &AuthStore) -> Result<(), String> {
    save_store_at(&auth_path(), store)
}

fn private_options(write: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    options
}

fn check_auth_file(file: &File) -> std::io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_AUTH_BYTES {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Unsafe auth store"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        if metadata.nlink() != 1 || metadata.uid() != unsafe { libc::geteuid() } {
            return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "Unsafe auth owner or links"));
        }
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn lock_store() -> Result<(File, MutexGuard<'static, ()>), String> {
    let process = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let directory = crate::database::sqlite::get_app_dir();
    super::capture_io::private_capture_folder(&directory).map_err(|_| "Private auth storage unavailable")?;
    let file = private_options(true).create(true).truncate(false)
        .open(directory.join("netoze_auth.lock")).map_err(|_| "Auth store lock unavailable")?;
    check_auth_file(&file).map_err(|_| "Auth store lock is unsafe")?;
    file.try_lock().map_err(|_| "Auth store is busy in another NET0ZE process")?;
    // Release the OS file lock before allowing the next thread through the mutex.
    Ok((file, process))
}

fn load_store_at(path: &Path) -> Result<AuthStore, String> {
    let file = match private_options(false).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(AuthStore {
            version: 1, next_activity_id: 1, ..AuthStore::default()
        }),
        Err(_) => return Err("Auth store cannot be opened safely".into()),
    };
    check_auth_file(&file).map_err(|_| "Auth store permissions, links, or size are unsafe")?;
    let mut data = Vec::new();
    file.take(MAX_AUTH_BYTES + 1).read_to_end(&mut data).map_err(|_| "Auth store read failed")?;
    if data.len() as u64 > MAX_AUTH_BYTES { return Err("Auth store exceeds its size limit".into()); }
    let store: AuthStore = serde_json::from_slice(&data).map_err(|_| "Auth store is invalid; preserve it and restore a trusted backup")?;
    if store.version != 1 || store.users.values().any(|user| {
        !(1..=2_000_000).contains(&user.iterations) || user.salt.len() != SALT_BYTES * 2
            || user.hash.len() != 64 || !user.salt.bytes().chain(user.hash.bytes()).all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err("Auth store has an unsupported version or invalid credentials".into());
    }
    Ok(store)
}

fn save_store_at(path: &Path, store: &AuthStore) -> Result<(), String> {
    // Reject links/nonregular existing stores; never truncate the only credential copy.
    match std::fs::symlink_metadata(path) {
        Ok(_) => { check_auth_file(&private_options(false).open(path).map_err(|_| "Auth store cannot be replaced safely")?)
            .map_err(|_| "Auth store cannot be replaced safely")?; }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err("Auth store metadata unavailable".into()),
    }
    let data = serde_json::to_vec_pretty(store).map_err(|_| "Auth store serialization failed")?;
    if data.len() as u64 > MAX_AUTH_BYTES { return Err("Auth store exceeds its size limit".into()); }
    let temporary = path.with_file_name(format!(".netoze-auth-{}.tmp", to_hex(&entropy_bytes(16)?)));
    let mut file = private_options(true).create_new(true).open(&temporary).map_err(|_| "Private auth staging failed")?;
    let result = file.write_all(&data).and_then(|_| file.sync_all());
    drop(file);
    if result.is_err() || std::fs::rename(&temporary, path).is_err() {
        let _ = std::fs::remove_file(temporary);
        return Err("Auth store update failed; previous credentials were preserved".into());
    }
    Ok(())
}

fn prune_expired_sessions(store: &mut AuthStore) {
    let now = now_secs();
    store.sessions.retain(|_, s| s.expires_at > now);
}

fn push_activity(store: &mut AuthStore, actor_email: &str, action: &str, detail: &str) {
    let id = store.next_activity_id;
    store.next_activity_id = id + 1;
    store.activity.push(ActivityEntry {
        id,
        timestamp: now_secs(),
        actor_email: actor_email.to_string(),
        action: action.to_string(),
        detail: detail.to_string(),
    });
    if store.activity.len() > MAX_ACTIVITY_ENTRIES {
        let excess = store.activity.len() - MAX_ACTIVITY_ENTRIES;
        store.activity.drain(0..excess);
    }
}

fn to_public(user: &StoredUser) -> PublicUser {
    PublicUser {
        id: user.id.clone(),
        name: user.name.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
        status: user.status.clone(),
        created_at: user.created_at,
        last_login_at: user.last_login_at,
    }
}

fn current_status(user: &StoredUser) -> String {
    if user.status == "locked" && user.locked_until > now_secs() {
        "locked".to_string()
    } else {
        "active".to_string()
    }
}

fn normalize_email(raw: &str) -> String {
    raw.trim().to_lowercase()
}

fn valid_email(email: &str) -> bool {
    let e = email.trim();
    let at = e.find('@');
    match at {
        Some(i) => {
            i > 0
                && i + 1 < e.len()
                && e[i + 1..].contains('.')
                && e.len() <= 254
                && !e.contains(' ')
        }
        None => false,
    }
}

fn valid_name(name: &str) -> bool {
    let n = name.trim();
    (2..=64).contains(&n.len())
        && n
            .chars()
            .all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.')
}

fn valid_password(pw: &str) -> bool {
    (8..=128).contains(&pw.len())
}

fn mirror_user_profile(user: &StoredUser) {
    let path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let Ok(conn) = rusqlite::Connection::open(&path) else {
        return;
    };
    let _ = conn.execute(
        "INSERT OR IGNORE INTO user_profiles (id, name, email, role, created_at) \
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        rusqlite::params![user.id, user.name, user.email, user.role],
    );
}

pub fn register(name: &str, email: &str, password: &str) -> Result<AuthSession, String> {
    let name = name.trim();
    let email = normalize_email(email);
    if !valid_name(name) {
        return Err("NAME_INVALID".to_string());
    }
    if !valid_email(&email) {
        return Err("EMAIL_INVALID".to_string());
    }
    if !valid_password(password) {
        return Err("PASSWORD_INVALID_MIN_8_MAX_128".to_string());
    }

    let _lock = lock_store()?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);

    if store.users.contains_key(&email) {
        return Err("EMAIL_ALREADY_REGISTERED".to_string());
    }

    let role = if store.users.is_empty() {
        "admin".to_string()
    } else {
        "user".to_string()
    };

    let salt = to_hex(&entropy_bytes(SALT_BYTES)?);
    let salt_bytes: Vec<u8> = salt
        .as_bytes()
        .chunks(2)
        .filter_map(|c| std::str::from_utf8(c).ok().and_then(|s| u8::from_str_radix(s, 16).ok()))
        .collect();
    let hash = to_hex(&pbkdf2_sha256(password.as_bytes(), &salt_bytes, PBKDF2_ITERATIONS));

    let user = StoredUser {
        id: to_hex(&entropy_bytes(16)?),
        name: name.to_string(),
        email: email.clone(),
        role: role.clone(),
        salt: salt.clone(),
        hash,
        iterations: PBKDF2_ITERATIONS,
        status: "active".to_string(),
        locked_until: 0,
        failed_attempts: 0,
        created_at: now_secs(),
        last_login_at: None,
    };

    store.users.insert(email.clone(), user.clone());
    push_activity(&mut store, &email, "REGISTER", &format!("role={}", user.role));

    let token = to_hex(&entropy_bytes(TOKEN_BYTES)?);
    let key = sha256_hex(token.as_bytes());
    let now = now_secs();
    store.sessions.insert(
        key,
        StoredSession {
            user_id: user.id.clone(),
            created_at: now,
            expires_at: now + SESSION_TTL_SECS,
        },
    );
    push_activity(&mut store, &email, "LOGIN", "registered_user_auto_login");
    save_store(&store)?;
    mirror_user_profile(&user);

    Ok(AuthSession {
        user: to_public(&user),
        token,
    })
}

pub fn login(email: &str, password: &str) -> Result<AuthSession, String> {
    let email = normalize_email(email);
    if email.is_empty() || password.is_empty() {
        return Err("EMPTY_CREDENTIALS".to_string());
    }

    if email.len() > 254 || password.len() > 128 { return Err("INVALID_CREDENTIALS".into()); }
    let _lock = lock_store()?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);

    let Some(user) = store.users.get_mut(&email).cloned() else {
        push_activity(&mut store, &email, "LOGIN_FAILED", "unknown_email");
        save_store(&store)?;
        return Err("INVALID_CREDENTIALS".to_string());
    };

    if current_status(&user) == "locked" {
        return Err("ACCOUNT_LOCKED_TRY_LATER".to_string());
    }

    let salt_bytes: Vec<u8> = user
        .salt
        .as_bytes()
        .chunks(2)
        .filter_map(|c| std::str::from_utf8(c).ok().and_then(|s| u8::from_str_radix(s, 16).ok()))
        .collect();
    let candidate = to_hex(&pbkdf2_sha256(
        password.as_bytes(),
        &salt_bytes,
        user.iterations,
    ));

    if !equal_secret(user.hash.as_bytes(), candidate.as_bytes()) {
        let mut locked = false;
        if let Some(u) = store.users.get_mut(&email) {
            u.failed_attempts += 1;
            if u.failed_attempts >= MAX_FAILED_ATTEMPTS {
                u.status = "locked".to_string();
                u.locked_until = now_secs() + LOCKOUT_SECS;
                locked = true;
            }
        }
        push_activity(
            &mut store,
            &email,
            "LOGIN_FAILED",
            if locked { "account_locked" } else { "wrong_password" },
        );
        save_store(&store)?;
        if locked {
            return Err("ACCOUNT_LOCKED_TRY_LATER".to_string());
        }
        return Err("INVALID_CREDENTIALS".to_string());
    }

    if let Some(u) = store.users.get_mut(&email) {
        u.failed_attempts = 0;
        u.status = "active".to_string();
        u.locked_until = 0;
        u.last_login_at = Some(now_secs());
        if u.iterations < PBKDF2_ITERATIONS {
            let salt = entropy_bytes(SALT_BYTES)?;
            u.hash = to_hex(&pbkdf2_sha256(password.as_bytes(), &salt, PBKDF2_ITERATIONS));
            u.salt = to_hex(&salt);
            u.iterations = PBKDF2_ITERATIONS;
        }
    }

    let token = to_hex(&entropy_bytes(TOKEN_BYTES)?);
    let key = sha256_hex(token.as_bytes());
    let now = now_secs();
    store.sessions.insert(
        key,
        StoredSession {
            user_id: user.id.clone(),
            created_at: now,
            expires_at: now + SESSION_TTL_SECS,
        },
    );
    push_activity(&mut store, &email, "LOGIN", "password_login");
    save_store(&store)?;

    let mut pub_user = to_public(&user);
    pub_user.status = "active".to_string();
    pub_user.last_login_at = Some(now);
    Ok(AuthSession {
        user: pub_user,
        token,
    })
}

pub fn logout(token: &str) -> Result<(), String> {
    if token.len() != TOKEN_BYTES * 2 { return Ok(()); }
    let _lock = lock_store()?;
    let mut store = load_store()?;
    let key = sha256_hex(token.as_bytes());
    if let Some(sess) = store.sessions.remove(&key) {
        if let Some(user) = store.users.values().find(|u| u.id == sess.user_id) {
            let email = user.email.clone();
            push_activity(&mut store, &email, "LOGOUT", "session_closed");
        }
        save_store(&store)?;
    }
    Ok(())
}

pub fn session_user(token: &str) -> Result<Option<PublicUser>, String> {
    if token.len() != TOKEN_BYTES * 2 { return Ok(None); }
    let _lock = lock_store()?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);
    let key = sha256_hex(token.as_bytes());
    let Some(sess) = store.sessions.get(&key) else {
        return Ok(None);
    };
    if sess.expires_at <= now_secs() {
        store.sessions.remove(&key);
        save_store(&store)?;
        return Ok(None);
    }
    let user = store.users.values().find(|u| u.id == sess.user_id).cloned();
    let Some(user) = user else {
        return Ok(None);
    };
    let status = current_status(&user);
    if status == "locked" {
        store.sessions.remove(&key);
        save_store(&store)?;
        return Ok(None);
    }
    let mut pub_user = to_public(&user);
    pub_user.status = status;
    Ok(Some(pub_user))
}

pub fn require_user(token: &str) -> Result<PublicUser, String> {
    session_user(token)?.ok_or_else(|| "AUTH_REQUIRED_SESSION_INVALID_OR_EXPIRED".to_string())
}

pub fn require_admin(token: &str) -> Result<PublicUser, String> {
    let user = require_user(token)?;
    if user.role != "admin" {
        return Err("FORBIDDEN_ADMIN_ROLE_REQUIRED".to_string());
    }
    Ok(user)
}

pub fn my_activity(token: &str, limit: usize) -> Result<Vec<ActivityEntry>, String> {
    let user = require_user(token)?;
    let _lock = lock_store()?;
    let store = load_store()?;
    let mut mine: Vec<ActivityEntry> = store
        .activity
        .iter()
        .filter(|a| a.actor_email == user.email)
        .cloned()
        .collect();
    mine.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    mine.truncate(limit.min(200));
    Ok(mine)
}

pub fn admin_list_users(token: &str) -> Result<Vec<PublicUser>, String> {
    require_admin(token)?;
    let _lock = lock_store()?;
    let store = load_store()?;
    let mut users: Vec<PublicUser> = store
        .users
        .values()
        .map(|u| {
            let mut p = to_public(u);
            p.status = current_status(u);
            p
        })
        .collect();
    users.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(users)
}

pub fn admin_list_activity(token: &str, limit: usize) -> Result<Vec<ActivityEntry>, String> {
    require_admin(token)?;
    let _lock = lock_store()?;
    let store = load_store()?;
    let mut items = store.activity.clone();
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    items.truncate(limit.min(500));
    Ok(items)
}

#[cfg(test)]
mod storage_tests {
    use super::*;

    fn directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!("netoze-auth-test-{}", to_hex(&entropy_bytes(16).unwrap())));
        super::super::capture_io::private_capture_folder(&path).unwrap();
        path
    }

    #[test]
    fn password_primitives_match_independent_sha256_vectors() {
        assert_eq!(to_hex(&pbkdf2_sha256(b"password", b"salt", 1)),
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
        assert_eq!(to_hex(&pbkdf2_sha256(b"password", b"salt", 2)),
            "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43");
        assert!(equal_secret(b"secret", b"secret"));
        for candidate in [b"secreu".as_slice(), b"secre", b"secret-more", b""] {
            assert!(!equal_secret(b"secret", candidate));
        }
        assert_eq!(entropy_bytes(TOKEN_BYTES).unwrap().len(), TOKEN_BYTES);
    }

    #[test]
    fn atomic_private_store_preserves_previous_credentials_on_rejected_update() {
        let root = directory();
        let path = root.join(AUTH_FILE);
        let mut store = load_store_at(&path).unwrap();
        save_store_at(&path, &store).unwrap();
        store.next_activity_id = 42;
        save_store_at(&path, &store).unwrap();
        assert_eq!(load_store_at(&path).unwrap().next_activity_id, 42);
        let previous = std::fs::read(&path).unwrap();
        store.activity.push(ActivityEntry { id: 1, timestamp: 0, actor_email: String::new(),
            action: "fixture".into(), detail: "x".repeat(MAX_AUTH_BYTES as usize) });
        assert!(save_store_at(&path, &store).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), previous);
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1, "staging files must be cleaned up");
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        std::fs::write(&path, b"not valid JSON").unwrap();
        assert!(load_store_at(&path).is_err(), "corrupt credentials must not become a new empty admin store");
        assert_eq!(std::fs::read(&path).unwrap(), b"not valid JSON");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn independent_handles_cannot_own_the_same_auth_lock() {
        let root = directory();
        let path = root.join("auth.lock");
        let first = private_options(true).create_new(true).open(&path).unwrap();
        first.try_lock().unwrap();
        let second = private_options(true).open(&path).unwrap();
        assert!(second.try_lock().is_err());
        drop(first);
        second.try_lock().unwrap();
        drop(second);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_hardlinks_and_fifos_cannot_replace_or_block_auth_storage() {
        use std::os::unix::fs::symlink;
        let root = directory();
        let target = root.join("untouched");
        std::fs::write(&target, b"preserve existing bytes").unwrap();
        let path = root.join(AUTH_FILE);
        symlink(&target, &path).unwrap();
        let store = AuthStore { version: 1, ..AuthStore::default() };
        assert!(load_store_at(&path).is_err());
        assert!(save_store_at(&path, &store).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"preserve existing bytes");
        std::fs::remove_file(&path).unwrap();
        std::fs::hard_link(&target, &path).unwrap();
        assert!(load_store_at(&path).is_err());
        assert!(save_store_at(&path, &store).is_err());
        std::fs::remove_file(&path).unwrap();
        let name = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let start = std::time::Instant::now();
        assert!(load_store_at(&path).is_err());
        assert!(save_store_at(&path, &store).is_err());
        assert!(start.elapsed() < std::time::Duration::from_secs(1));
        std::fs::remove_dir_all(root).unwrap();
    }
}

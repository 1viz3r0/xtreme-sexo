//! Signed-manifest update gate.
//!
//! A single manifest at the repository root (`update.json`) carries the whole
//! update policy: the latest version, its severity, whether it is mandatory,
//! the minimum supported (security-floor) version, and the per-platform
//! artifact URLs with their SHA-256 checksums. A detached minisign/ed25519
//! signature (`update.json.sig`) is verified against a public key embedded
//! here before the manifest content is trusted for anything beyond display.
//!
//! Hard rules of this implementation (see SECURITY_DECISIONS.md):
//! * An unsigned or unverifiable manifest is `informational` only: it may
//!   raise a banner, never a gate, and it can never trigger an install.
//! * Enforcing a critical/mandatory gate requires a verified manifest AND a
//!   previously-authenticated cached policy (fresh installs stay fail-open
//!   on first contact).
//! * Network failure never disables the app: the check degrades to a stale
//!   banner with the last successful check time.
//! * Downgrades are refused; a replayed old (signed) manifest can therefore
//!   only ever produce "no update".
//! * The gate never blocks recovery, diagnostics, or user-data export.
//! * Nothing is installed without an explicit user click.

use std::cmp::Ordering;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use tauri::{AppHandle, Emitter, Manager};

use crate::services::http_client;

pub const UPDATE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/update.json";
pub const UPDATE_MANIFEST_SIGNATURE_URL: &str =
    "https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/update.json.sig";
/// Public verification material for the update manifest (tauri signer /
/// minisign ed25519). The private half stays with the maintainer, offline —
/// never in this repository, never in CI.
pub const UPDATE_MANIFEST_PUBLIC_KEY: &str =
    "RWQbD3waQXaYkzeFrkDTpu1XuMrFoLcgyL+3A4pbRt4MiNTUf1JYdXH+";
pub const UPDATE_MANIFEST_KEY_ID: &str = "939876411A7C0F1B";
/// The only hosts an install may be pulled from; extending this list is a
/// code change by design — the distribution channel is part of the trust root.
pub const DOWNLOAD_HOST_SUFFIXES: [&str; 2] = ["github.com", "objects.githubusercontent.com"];

const MANIFEST_MAX_BYTES: usize = 256 * 1024;
const SIGNATURE_MAX_BYTES: usize = 16 * 1024;
const DOWNLOAD_SLACK_BYTES: u64 = 1024 * 1024;
const PERIODIC_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const MANUAL_CHECK_THROTTLE: Duration = Duration::from_secs(60);
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(2);
const INSTALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const STATUS_EVENT: &str = "netoze-update://status";
const PROGRESS_EVENT: &str = "netoze-update://install-progress";
const CACHED_POLICY_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Manifest model
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BannerKind {
    Informational,
    Low,
    Moderate,
    High,
}

impl BannerKind {
    pub fn label(self) -> &'static str {
        match self {
            BannerKind::Informational => "informational",
            BannerKind::Low => "low",
            BannerKind::Moderate => "moderate",
            BannerKind::High => "high",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateArtifact {
    pub format: String,
    pub url: String,
    #[serde(default)]
    pub bytes: Option<u64>,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdatePlatform {
    #[serde(default)]
    pub artifacts: Vec<UpdateArtifact>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateLatest {
    pub version: String,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub mandatory: bool,
    #[serde(default)]
    pub pub_date: Option<String>,
    #[serde(default)]
    pub notes_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateManifest {
    #[serde(default)]
    pub schema: Option<u8>,
    #[serde(default)]
    pub app: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    // Legacy floor key preserved by the signing tooling; the canonical field
    // is min_supported_version. When both exist the stricter value wins.
    #[serde(default)]
    pub force_min_version: Option<String>,
    #[serde(default)]
    pub min_supported_version: Option<String>,
    #[serde(default)]
    pub generated_at: Option<String>,
    pub latest: UpdateLatest,
    #[serde(default)]
    pub platforms: std::collections::HashMap<String, UpdatePlatform>,
    #[serde(default)]
    pub signing: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Decision table (pure, unit-tested)
// ---------------------------------------------------------------------------

/// Parse dotted numeric versions ("2.0.2"). Returns None for anything non
/// numeric so callers refuse to act instead of guessing.
pub fn parse_version(raw: &str) -> Option<Vec<u32>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 32 {
        return None;
    }
    let mut out = Vec::new();
    for segment in trimmed.split('.') {
        if segment.is_empty() || segment.len() > 5 || !segment.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        out.push(segment.parse::<u32>().ok()?);
    }
    if out.len() > 6 {
        return None;
    }
    Some(out)
}

/// Compare two parsed versions by segment; a missing segment counts as 0.
pub fn compare_versions(a: &[u32], b: &[u32]) -> Ordering {
    for index in 0..a.len().max(b.len()) {
        let left = a.get(index).copied().unwrap_or(0);
        let right = b.get(index).copied().unwrap_or(0);
        match left.cmp(&right) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

fn stricter_floor(a: Option<&str>, b: Option<&str>) -> Option<Vec<u32>> {
    match (a.and_then(parse_version), b.and_then(parse_version)) {
        (Some(x), Some(y)) => {
            if compare_versions(&x, &y) == Ordering::Less {
                Some(y)
            } else {
                Some(x)
            }
        }
        (Some(x), None) => Some(x),
        (None, Some(y)) => Some(y),
        (None, None) => None,
    }
}

pub struct DecisionInput<'a> {
    pub current: &'a str,
    pub latest: &'a str,
    pub severity: Option<&'a str>,
    pub mandatory: bool,
    pub authenticated: bool,
    pub min_supported: Option<&'a str>,
    /// Highest floor previously enforced from an authenticated policy.
    pub cached_floor: Option<&'a str>,
    pub has_installable_artifact: bool,
    pub pub_date: Option<&'a str>,
}

#[derive(Debug)]
pub enum GateDecision {
    UpToDate,
    Banner {
        kind: BannerKind,
        reason: String,
        deadline_note: Option<String>,
    },
    Block {
        gate_kind: &'static str,
        required_version: String,
        reason: String,
    },
}

/// The single place severity/mandatory/floor map to a UI class.
pub fn evaluate_update(input: &DecisionInput) -> GateDecision {
    let current = match parse_version(input.current) {
        Some(value) => value,
        // Cannot reason about the local build (or remote data): fail open.
        None => return GateDecision::UpToDate,
    };
    // The security floor is evaluated FIRST: enforcement is independent of
    // whether a newer release exists (a build that already runs the
    // manifest's latest version but sits below the floor must still gate)
    // and even of whether the manifest's latest version is well-formed. The
    // floor is sticky: the highest floor ever seen from an authenticated
    // manifest keeps applying even if a later unsigned manifest pretends
    // otherwise, and unsigned data can never introduce or lower it.
    let floor = if input.authenticated {
        stricter_floor(input.min_supported, input.cached_floor)
    } else {
        // Unauthenticated manifest data is ignored for the floor; only the
        // previously authenticated sticky cache may keep biting.
        input.cached_floor.and_then(parse_version)
    };
    if let Some(floor) = &floor {
        if compare_versions(&current, floor) == Ordering::Less {
            return GateDecision::Block {
                gate_kind: "security_floor",
                required_version: version_string(floor),
                reason: format!(
                    "This NET0ZE build ({}) is below the minimum supported version ({}) from the signed update policy.",
                    input.current,
                    version_string(floor)
                ),
            };
        }
    }

    let latest = match parse_version(input.latest) {
        Some(value) => value,
        None => return GateDecision::UpToDate,
    };

    // Anything at or below the running build is refused outright (downgrade /
    // replay protection).
    if compare_versions(&latest, &current) != Ordering::Greater {
        return GateDecision::UpToDate;
    }

    // Without an authenticated manifest nothing may gate or install.
    if !input.authenticated {
        return GateDecision::Banner {
            kind: BannerKind::Informational,
            reason: format!(
                "Update notices for {} are informational only: the manifest signature could not be verified, so no enforcement or install is possible.",
                input.latest
            ),
            deadline_note: None,
        };
    }

    match input.severity.unwrap_or("moderate") {
        "critical" if input.mandatory => {
            if input.has_installable_artifact {
                GateDecision::Block {
                    gate_kind: "critical_update",
                    required_version: input.latest.to_string(),
                    reason: format!(
                        "A critical security update ({}) is mandatory before normal operation. Update now, or use the recovery, diagnostics, and data-export options on this screen.",
                        input.latest
                    ),
                }
            } else {
                // Never hard-gate when the user has nothing to install.
                GateDecision::Banner {
                    kind: BannerKind::High,
                    reason: format!(
                        "A critical update ({}) is marked mandatory, but the manifest provides no installable package for this platform; update manually from the release page.",
                        input.latest
                    ),
                    deadline_note: deadline_note(input.pub_date),
                }
            }
        }
        "critical" | "high" => GateDecision::Banner {
            kind: BannerKind::High,
            reason: format!(
                "A {}-severity security update ({}) is available and should be installed as soon as possible.",
                if input.severity == Some("critical") { "critical" } else { "high" },
                input.latest
            ),
            deadline_note: deadline_note(input.pub_date),
        },
        "informational" => GateDecision::Banner {
            kind: BannerKind::Informational,
            reason: format!("An informational update ({}) is available.", input.latest),
            deadline_note: None,
        },
        "low" => GateDecision::Banner {
            kind: BannerKind::Low,
            reason: format!("An optional update ({}) is available.", input.latest),
            deadline_note: None,
        },
        // Unrecognized or empty severities recommend, but never enforce.
        "moderate" | _ => GateDecision::Banner {
            kind: BannerKind::Moderate,
            reason: format!("A recommended update ({}) is available.", input.latest),
            deadline_note: None,
        },
    }
}

/// "Defined update deadline" for high-visibility severities: 30 days after
/// first publication, derived from the manifest's own date.
fn deadline_note(pub_date: Option<&str>) -> Option<String> {
    let date = pub_date?;
    let timestamp = chrono::DateTime::parse_from_rfc3339(date).ok()?.timestamp();
    let deadline = timestamp + 30 * 24 * 60 * 60;
    let formatted = chrono::DateTime::from_timestamp(deadline, 0)?
        .format("%Y-%m-%d")
        .to_string();
    Some(format!("Suggested install deadline: {formatted}"))
}

fn version_string(parsed: &[u32]) -> String {
    parsed.iter().map(|value| value.to_string()).collect::<Vec<_>>().join(".")
}

// ---------------------------------------------------------------------------
// Persisted state + runtime status
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
struct PersistedState {
    #[serde(default)]
    schema: u8,
    #[serde(default)]
    last_check_at: Option<i64>,
    #[serde(default)]
    last_check_ok: Option<bool>,
    #[serde(default)]
    last_error: Option<String>,
    #[serde(default)]
    last_authenticated_at: Option<i64>,
    #[serde(default)]
    last_authenticated_manifest_version: Option<String>,
    #[serde(default)]
    last_authenticated_severity: Option<String>,
    #[serde(default)]
    last_authenticated_mandatory: Option<bool>,
    #[serde(default)]
    last_authenticated_notes_url: Option<String>,
    /// Monotonic across authenticated manifests: the maximum floor ever seen.
    #[serde(default)]
    floor_ever_seen: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct UpdateGateStatus {
    pub app_version: String,
    pub channel: String,
    pub latest_version: Option<String>,
    pub severity: Option<String>,
    pub mandatory: bool,
    pub advisory_only: bool,
    pub gate_active: bool,
    pub gate_kind: Option<String>,
    pub gate_required_version: Option<String>,
    pub gate_reason: Option<String>,
    pub notes_url: Option<String>,
    pub last_check_at: Option<i64>,
    pub last_check_ok: Option<bool>,
    pub last_authenticated_at: Option<i64>,
    pub min_supported_version: Option<String>,
    pub last_error: Option<String>,
    pub endpoint: String,
    pub signature_key_id: String,
    pub check_in_progress: bool,
    pub install_in_progress: bool,
}

struct RuntimeState {
    current_version: String,
    status: UpdateGateStatus,
    last_manual_check: Option<Instant>,
    check_in_progress: bool,
    install_in_progress: bool,
    persisted: PersistedState,
    cache_path: PathBuf,
}

pub struct UpdateGateState {
    inner: Mutex<Option<RuntimeState>>,
}

impl UpdateGateState {
    pub fn new(cache_path: PathBuf, current_version: String) -> Self {
        let persisted = load_persisted(&cache_path).unwrap_or_default();
        let status = placeholder_status(&current_version);
        Self {
            inner: Mutex::new(Some(RuntimeState {
                current_version,
                status,
                last_manual_check: None,
                check_in_progress: false,
                install_in_progress: false,
                persisted,
                cache_path,
            })),
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<RuntimeState>>, String> {
        self.inner
            .lock()
            .map_err(|_| "Update gate state is unavailable".to_string())
    }
}

fn placeholder_status(current_version: &str) -> UpdateGateStatus {
    UpdateGateStatus {
        app_version: current_version.to_string(),
        channel: "stable".into(),
        latest_version: None,
        severity: None,
        mandatory: false,
        advisory_only: true,
        gate_active: false,
        gate_kind: None,
        gate_required_version: None,
        gate_reason: None,
        notes_url: None,
        last_check_at: None,
        last_check_ok: None,
        last_authenticated_at: None,
        min_supported_version: None,
        last_error: None,
        endpoint: UPDATE_MANIFEST_URL.into(),
        signature_key_id: UPDATE_MANIFEST_KEY_ID.into(),
        check_in_progress: false,
        install_in_progress: false,
    }
}

fn load_persisted(path: &PathBuf) -> Result<PersistedState, String> {
    if !path.is_file() {
        return Err("no persisted update state yet".into());
    }
    let raw = std::fs::read(path).map_err(|error| error.to_string())?;
    if raw.len() > 64 * 1024 {
        return Err("persisted update state is oversized".into());
    }
    let state: PersistedState = serde_json::from_slice(&raw).map_err(|error| error.to_string())?;
    if state.schema > 1 {
        return Err("unsupported persisted update state schema".into());
    }
    Ok(state)
}

fn save_persisted(state: &mut RuntimeState) {
    state.persisted.schema = 1;
    if let Some(parent) = state.cache_path.parent() {
        let _ = crate::services::capture_io::private_capture_folder(parent);
    }
    let payload = match serde_json::to_vec_pretty(&state.persisted) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!("persisting update gate state failed: {error}");
            return;
        }
    };
    let temp_path = state.cache_path.with_extension("json.tmp");
    if let Ok(mut file) = crate::services::capture_io::create_private_file(&temp_path) {
        if file.write_all(&payload).and_then(|_| file.sync_all()).is_ok() {
            let _ = std::fs::rename(&temp_path, &state.cache_path);
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Manifest authentication
// ---------------------------------------------------------------------------

/// The detached signature file has the classic minisign shape:
/// "untrusted comment: ...\n<base64>"; `Signature::decode` parses that shape.

/// Keep the sticky floor monotonic: the higher of the persisted floor and
/// the fresh floor survives; unparseable candidates are refused.
fn choose_floor_string(existing: Option<&str>, fresh: Option<&str>) -> Option<String> {
    let existing_parsed = existing.and_then(parse_version);
    let fresh_parsed = fresh.and_then(parse_version);
    match (existing_parsed, fresh_parsed) {
        (Some(a), Some(b)) => {
            if compare_versions(&b, &a) == Ordering::Greater {
                fresh.map(str::to_owned)
            } else {
                existing.map(str::to_owned)
            }
        }
        (Some(_), None) => existing.map(str::to_owned),
        (None, Some(_)) => fresh.map(str::to_owned),
        (None, None) => None,
    }
}

/// The detached signature file exists in two byte shapes, both native to the
/// tauri/minisign ecosystem (see SECURITY_DECISIONS.md — the committed file
/// uses shape 2):
///   1. Raw minisign text: `untrusted comment: ...\n<base64 payload>\n`.
///   2. The same text wrapped once more as a single base64 line, exactly as
///      the tauri CLI writes `.pub`/`.sig` files and embeds signatures in
///      its updater manifests.
/// Reaching the signature structure through either container is equivalent:
/// verification itself always runs on the same manifest bytes, against the
/// same embedded key, with legacy mode disabled.
fn signature_text_from_file(signature_file: &[u8]) -> Result<String, String> {
    use base64::Engine as _;
    let text = String::from_utf8_lossy(signature_file).trim().to_string();
    if text.is_empty() {
        return Err("update signature file is empty".into());
    }
    if text.starts_with("untrusted comment:") {
        return Ok(text);
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(text.as_bytes())
        .map_err(|error| format!("update signature file is malformed: {error}"))?;
    String::from_utf8(decoded)
        .map(|value| value.trim().to_string())
        .map_err(|_| "update signature file is malformed: container decodes to non-UTF8 data".into())
}

pub fn verify_manifest_signature(manifest: &[u8], signature_file: &[u8]) -> Result<(), String> {
    let public_key = PublicKey::from_base64(UPDATE_MANIFEST_PUBLIC_KEY)
        .map_err(|error| format!("embedded update public key is invalid: {error}"))?;
    let signature_text = signature_text_from_file(signature_file)?;
    let signature = Signature::decode(&signature_text)
        .map_err(|error| format!("update signature file is malformed: {error}"))?;
    public_key
        .verify(manifest, &signature, false)
        .map_err(|error| format!("update manifest signature verification failed: {error}"))
}

fn check_download_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("update artifact URL must be https".into());
    }
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_lowercase))
        .ok_or_else(|| "update artifact URL has no host".to_string())?;
    if DOWNLOAD_HOST_SUFFIXES
        .iter()
        .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        Ok(())
    } else {
        Err(format!("update artifact host {host} is not an approved release host"))
    }
}

fn platform_key() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

fn pick_artifact<'a>(
    manifest: &'a UpdateManifest,
    prefer_appimage: bool,
) -> Option<&'a UpdateArtifact> {
    let platform = manifest.platforms.get(&platform_key())?;
    let mut candidates: Vec<&UpdateArtifact> = platform
        .artifacts
        .iter()
        .filter(|artifact| {
            artifact.sha256.as_deref().is_some_and(|value| value.len() == 64)
                && artifact.bytes.is_some()
                && check_download_url(&artifact.url).is_ok()
        })
        .collect();
    candidates.sort_by_key(|artifact| {
        if prefer_appimage {
            match artifact.format.as_str() {
                "appimage" => 0,
                "deb" => 1,
                "nsis-setup" => 1,
                "msi" => 2,
                _ => 3,
            }
        } else {
            match artifact.format.as_str() {
                "deb" | "nsis-setup" => 0,
                "appimage" | "msi" => 1,
                _ => 2,
            }
        }
    });
    candidates.first().copied()
}

async fn fetch_bounded(
    client: &reqwest::Client,
    url: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("update check network failure: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "update manifest request returned HTTP {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("update manifest response exceeds size limit".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("update check interrupted: {error}"))?
    {
        if chunk.len() > max_bytes.saturating_sub(body.len()) {
            return Err("update manifest response exceeds size limit".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

struct AuthenticatedManifest {
    manifest: UpdateManifest,
    advisory_only: bool,
}

async fn fetch_and_authenticate(client: &reqwest::Client) -> Result<AuthenticatedManifest, String> {
    let manifest_bytes = fetch_bounded(client, UPDATE_MANIFEST_URL, MANIFEST_MAX_BYTES).await?;
    // A missing, failing, or unverified signature downgrades the manifest to
    // information-only; it never aborts the check itself.
    let authenticated = match fetch_bounded(client, UPDATE_MANIFEST_SIGNATURE_URL, SIGNATURE_MAX_BYTES)
        .await
    {
        Ok(signature_bytes) => verify_manifest_signature(&manifest_bytes, &signature_bytes).is_ok(),
        Err(_) => false,
    };
    let manifest: UpdateManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("update manifest is malformed: {error}"))?;
    if manifest.schema.unwrap_or(0) > 1 {
        return Err("manifest schema is newer than this build understands; install decisions require a supported schema".into());
    }
    if let Some(app) = &manifest.app {
        if app != "netoze-desktop" {
            return Err("manifest is not for this application".into());
        }
    }
    Ok(AuthenticatedManifest {
        manifest,
        advisory_only: !authenticated,
    })
}

// ---------------------------------------------------------------------------
// Status composition
// ---------------------------------------------------------------------------

struct Builder<'a> {
    current_version: &'a str,
}

fn cached_gate_from_persisted(
    builder: &Builder<'_>,
    persisted: &PersistedState,
    status: &mut UpdateGateStatus,
) {
    let current = match parse_version(builder.current_version) {
        Some(value) => value,
        None => return,
    };
    let last_auth_recent = persisted
        .last_authenticated_at
        .is_some_and(|at| now_ms() - at <= CACHED_POLICY_TTL_MS);
    if !last_auth_recent {
        return;
    }
    // Floor gate from the sticky, previously-authenticated policy.
    if let Some(floor) = persisted.floor_ever_seen.as_deref().and_then(|value| parse_version(value)) {
        if compare_versions(&current, &floor) == Ordering::Less {
            status.gate_active = true;
            status.gate_kind = Some("security_floor".into());
            status.gate_required_version = Some(version_string(&floor));
            status.gate_reason = Some(format!(
                "This NET0ZE build ({}) is below the minimum supported version ({}) from the signed update policy.",
                builder.current_version,
                version_string(&floor)
            ));
            status.min_supported_version = Some(version_string(&floor));
            return;
        }
    }
    // Critical + mandatory update verified earlier and not yet installed.
    let cached_newer = persisted
        .last_authenticated_manifest_version
        .as_deref()
        .and_then(parse_version)
        .is_some_and(|target| compare_versions(&target, &current) == Ordering::Greater);
    let critical_cached = persisted
        .last_authenticated_severity
        .as_deref()
        == Some("critical")
        && persisted.last_authenticated_mandatory.unwrap_or(false);
    if cached_newer && critical_cached {
        status.gate_active = true;
        status.gate_kind = Some("critical_update".into());
        status.gate_required_version = persisted.last_authenticated_manifest_version.clone();
        status.gate_reason = Some(format!(
            "A critical security update ({}) was previously verified as mandatory for this build; update now, or use the recovery, diagnostics, and data-export options.",
            persisted.last_authenticated_manifest_version.clone().unwrap_or_default()
        ));
    }
}

fn status_with_persisted_only(
    builder: &Builder<'_>,
    persisted: &PersistedState,
    check_in_progress: bool,
    install_in_progress: bool,
) -> UpdateGateStatus {
    let mut status = placeholder_status(builder.current_version);
    status.check_in_progress = check_in_progress;
    status.install_in_progress = install_in_progress;
    status.last_check_at = persisted.last_check_at;
    status.last_check_ok = persisted.last_check_ok;
    status.last_error = persisted.last_error.clone();
    status.last_authenticated_at = persisted.last_authenticated_at;
    status.latest_version = persisted.last_authenticated_manifest_version.clone();
    status.severity = persisted.last_authenticated_severity.clone();
    status.mandatory = persisted.last_authenticated_mandatory.unwrap_or(false);
    status.notes_url = persisted.last_authenticated_notes_url.clone();
    status.min_supported_version = persisted.floor_ever_seen.clone();
    if persisted.last_authenticated_at.is_some() {
        status.advisory_only = false;
    }
    cached_gate_from_persisted(builder, persisted, &mut status);
    status
}

fn status_with_manifest(
    builder: &Builder<'_>,
    authenticated: &AuthenticatedManifest,
    persisted: &PersistedState,
    install_in_progress: bool,
) -> UpdateGateStatus {
    let mut status = status_with_persisted_only(builder, &persisted.clone(), false, install_in_progress);
    let manifest = &authenticated.manifest;
    status.channel = manifest.channel.clone().unwrap_or_else(|| "stable".into());
    status.latest_version = Some(manifest.latest.version.clone());
    status.severity = manifest.latest.severity.clone();
    status.mandatory = manifest.latest.mandatory;
    status.notes_url = manifest.latest.notes_url.clone();
    status.advisory_only = authenticated.advisory_only;
    status.min_supported_version = manifest
        .min_supported_version
        .clone()
        .or(manifest.force_min_version.clone())
        .or(status.min_supported_version);
    status.gate_active = false;
    status.gate_kind = None;
    status.gate_required_version = None;
    status.gate_reason = None;

    let prefer_appimage = std::env::var("APPIMAGE").is_ok();
    let decision = evaluate_update(&DecisionInput {
        current: builder.current_version,
        latest: &manifest.latest.version,
        severity: manifest.latest.severity.as_deref(),
        mandatory: manifest.latest.mandatory,
        authenticated: !authenticated.advisory_only,
        min_supported: manifest
            .min_supported_version
            .as_deref()
            .or(manifest.force_min_version.as_deref()),
        cached_floor: persisted.floor_ever_seen.as_deref(),
        has_installable_artifact: pick_artifact(manifest, prefer_appimage).is_some(),
        pub_date: manifest.latest.pub_date.as_deref(),
    });
    match decision {
        GateDecision::UpToDate => {}
        GateDecision::Banner { kind, reason, deadline_note } => {
            status.gate_reason = Some(match deadline_note {
                Some(deadline) => format!("{reason} {deadline}"),
                None => reason,
            });
            if kind != BannerKind::Informational {
                status.severity = Some(kind.label().into());
            }
        }
        GateDecision::Block { gate_kind, required_version, reason } => {
            status.gate_active = true;
            status.gate_kind = Some(gate_kind.into());
            status.gate_required_version = Some(required_version);
            status.gate_reason = Some(reason);
        }
    }
    status
}

// ---------------------------------------------------------------------------
// Check flow
// ---------------------------------------------------------------------------

/// Run one check-and-publish cycle. `force` bypasses the manual throttle.
async fn run_check(app: &AppHandle, force: bool) -> Result<UpdateGateStatus, String> {
    let client = http_client::client()?;
    {
        let mut guard = gate_state(app)?;
        let runtime = guard
            .as_mut()
            .ok_or_else(|| "Update gate is not initialised".to_string())?;
        if !force
            && runtime
                .last_manual_check
                .is_some_and(|at| at.elapsed() < MANUAL_CHECK_THROTTLE)
        {
            return Ok(runtime.status.clone());
        }
        if runtime.check_in_progress {
            return Ok(runtime.status.clone());
        }
        runtime.check_in_progress = true;
        runtime.last_manual_check = Some(Instant::now());
        runtime.status.check_in_progress = true;
        let status = runtime.status.clone();
        let _ = app.emit(STATUS_EVENT, &status);
    }

    let fetch_attempt = fetch_and_authenticate(&client).await;
    let final_status;
    {
        let mut guard = gate_state(app)?;
        let runtime = guard
            .as_mut()
            .ok_or("Update gate is not initialised")?;
        let builder = Builder { current_version: &runtime.current_version };
        match &fetch_attempt {
            Ok(authenticated) => {
                runtime.persisted.last_check_at = Some(now_ms());
                runtime.persisted.last_check_ok = Some(true);
                runtime.persisted.last_error = None;
                if !authenticated.advisory_only {
                    runtime.persisted.last_authenticated_at = Some(now_ms());
                    runtime.persisted.last_authenticated_manifest_version =
                        Some(authenticated.manifest.latest.version.clone());
                    runtime.persisted.last_authenticated_severity =
                        authenticated.manifest.latest.severity.clone();
                    runtime.persisted.last_authenticated_mandatory =
                        Some(authenticated.manifest.latest.mandatory);
                    runtime.persisted.last_authenticated_notes_url =
                        authenticated.manifest.latest.notes_url.clone();
                    // The floor is monotonic across authenticated manifests.
                    let fresh_floor = authenticated
                        .manifest
                        .min_supported_version
                        .clone()
                        .or(authenticated.manifest.force_min_version.clone());
                    runtime.persisted.floor_ever_seen = choose_floor_string(
                        runtime.persisted.floor_ever_seen.as_deref(),
                        fresh_floor.as_deref(),
                    );
                }
                final_status = status_with_manifest(&builder, authenticated, &runtime.persisted, runtime.install_in_progress);
            }
            Err(error) => {
                runtime.persisted.last_check_at = Some(now_ms());
                // Fail-open: record the error, keep the app fully operational.
                runtime.persisted.last_error = Some(error.clone());
                final_status = status_with_persisted_only(&builder, &runtime.persisted, false, runtime.install_in_progress);
            }
        }
        runtime.check_in_progress = false;
        runtime.status = final_status.clone();
        save_persisted(runtime);
        let _ = app.emit(STATUS_EVENT, &final_status);
    }
    if let Err(error) = &fetch_attempt {
        tracing::warn!("update gate check degraded to advisory mode: {error}");
    }
    Ok(final_status)
}

fn gate_state<'a>(
    app: &'a AppHandle,
) -> Result<std::sync::MutexGuard<'a, Option<RuntimeState>>, String> {
    let state = app.state::<UpdateGateState>();
    let inner = state.inner();
    inner
        .lock()
        .map_err(|error| error.clone())
}

/// Spawn the periodic worker: one check shortly after boot, then every 6h.
pub fn spawn_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_DELAY).await;
        if let Err(error) = run_check(&app, true).await {
            tracing::warn!("boot update check did not complete: {error}");
        }
        loop {
            tokio::time::sleep(PERIODIC_CHECK_INTERVAL).await;
            if let Err(error) = run_check(&app, true).await {
                tracing::warn!("periodic update check did not complete: {error}");
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Install flow
// ---------------------------------------------------------------------------

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

async fn download_and_verify(
    app: &AppHandle,
    client: &reqwest::Client,
    artifact: &UpdateArtifact,
) -> Result<PathBuf, String> {
    let sha_expected = artifact.sha256.as_ref().ok_or("Verified manifest lacks an artifact checksum")?;
    if sha_expected.len() != 64 || !sha_expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("manifest artifact checksum is malformed".into());
    }
    let total = artifact.bytes.ok_or("Verified manifest lacks an artifact size")?;
    let cap = total.saturating_add(DOWNLOAD_SLACK_BYTES);

    let mut response = client
        .get(&artifact.url)
        .send()
        .await
        .map_err(|error| format!("Update download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Update download returned HTTP {}", response.status().as_u16()));
    }

    let staging = std::env::temp_dir().join(format!(
        "netoze-update-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    crate::services::capture_io::private_capture_folder(&staging)
        .map_err(|error| format!("Cannot create the update staging folder: {error}"))?;
    let file_name = artifact
        .url
        .rsplit('/')
        .next()
        .filter(|name| !name.contains(".."))
        .unwrap_or("netoze-update.bin")
        .to_string();
    let target = staging.join(file_name);

    let mut file = crate::services::capture_io::create_private_file(&target)
        .map_err(|error| format!("Cannot stage the update download: {error}"))?;
    let mut hasher = sha2::Sha256::new();
    let mut downloaded: u64 = 0;
    let mut next_report = total / 20;
    let emit = |done: u64| {
        let _ = app.emit(
            PROGRESS_EVENT,
            serde_json::json!({
                "stage": "download",
                "downloaded_bytes": done,
                "total_bytes": total,
                "format": artifact.format,
            }),
        );
    };
    loop {
        let chunk = match tokio::time::timeout(
            Duration::from_secs(120),
            response.chunk(),
        )
        .await
        .map_err(|_| "Update download stalled for more than 2 minutes".to_string())?
        .map_err(|error| format!("Update download interrupted: {error}"))?
        {
            Some(chunk) => chunk,
            None => break,
        };
        downloaded += chunk.len() as u64;
        if downloaded > cap {
            return Err("Update download exceeds the size recorded in the signed manifest".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|error| format!("Cannot write the staged update: {error}"))?;
        if downloaded >= next_report {
            emit(downloaded);
            next_report = downloaded + total / 20;
        }
    }
    file.sync_all()
        .map_err(|error| format!("Cannot finalize the staged update: {error}"))?;
    drop(file);
    if downloaded != total {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!(
            "Update download is incomplete: received {downloaded} of {total} bytes"
        ));
    }
    let bytes = std::fs::read(&target).map_err(|error| format!("Cannot read the staged update: {error}"))?;
    if bytes.len() as u64 != total {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("Staged update size no longer matches the signed manifest".into());
    }
    let digest = hex_encode(&hasher.clone().finalize());
    if digest != *sha_expected {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(
            "Staged update checksum does not match the signed manifest; nothing was installed"
                .into(),
        );
    }
    Ok(staging)
}

/// Install the verified update for the current platform. Requires the fresh
/// manifest to authenticate and to offer a strictly newer version.
pub async fn run_install(app: &AppHandle) -> Result<(), String> {
    let client = http_client::client()?;

    // Fresh fetch + verification: the install decision rests on bytes
    // verified right now, not on cached UI state.
    let authenticated = fetch_and_authenticate(&client).await?;
    if authenticated.advisory_only {
        return Err("Refusing to install: the update manifest signature could not be verified".into());
    }
    let current = {
        let guard = gate_state(app)?;
        guard
            .as_ref()
            .map(|runtime| runtime.current_version.clone())
            .ok_or("Update gate is not initialised")?
    };
    match (parse_version(&current), parse_version(&authenticated.manifest.latest.version)) {
        (Some(current), Some(target)) if compare_versions(&target, &current) == Ordering::Greater => {}
        (Some(_), Some(target)) => {
            return Err(format!(
                "Refusing to install version {}: the running build is already up to date or newer",
                version_string(&target)
            ))
        }
        _ => return Err("Refusing to install: version data could not be parsed".into()),
    }
    let prefer_appimage = std::env::var("APPIMAGE").is_ok();
    let artifact = pick_artifact(&authenticated.manifest, prefer_appimage)
        .cloned()
        .ok_or("The verified manifest has no installable package for this platform")?;

    {
        let mut guard = gate_state(app)?;
        let runtime = guard.as_mut().ok_or("Update gate is not initialised")?;
        if runtime.install_in_progress {
            return Err("An update is already in progress".into());
        }
        runtime.install_in_progress = true;
        runtime.status.install_in_progress = true;
        let _ = app.emit(STATUS_EVENT, &runtime.status);
    }

    let outcome = match perform_install(app, &client, &artifact).await {
        Ok(after) => Ok(after),
        Err(error) => Err(error),
    };

    match outcome {
        Ok(AfterInstall::Restarting) => {
            // The install completed on disk; core restart relaunches into the
            // new build (expect_run never returns).
            let _ = app.emit(
                PROGRESS_EVENT,
                serde_json::json!({ "stage": "installed_restarting", "format": artifact.format }),
            );
            app.restart()
        }
        Ok(AfterInstall::InstallerLaunched) => {
            let mut guard = gate_state(app)?;
            if let Some(runtime) = guard.as_mut() {
                runtime.install_in_progress = false;
                runtime.status.install_in_progress = false;
            }
            let _ = app.emit(
                PROGRESS_EVENT,
                serde_json::json!({ "stage": "installer_launched", "format": artifact.format }),
            );
            Ok(())
        }
        Err(error) => {
            tracing::warn!("update install failed: {error}");
            if let Ok(mut guard) = gate_state(app) {
                if let Some(runtime) = guard.as_mut() {
                    runtime.install_in_progress = false;
                    runtime.status.install_in_progress = false;
                    let mut status = runtime.status.clone();
                    status.last_error = Some(error.clone());
                    let _ = app.emit(STATUS_EVENT, &status);
                }
            }
            Err(error)
        }
    }
}

enum AfterInstall {
    Restarting,
    InstallerLaunched,
}

async fn perform_install(
    app: &AppHandle,
    client: &reqwest::Client,
    artifact: &UpdateArtifact,
) -> Result<AfterInstall, String> {
    let staging = download_and_verify(app, client, artifact).await?;
    let staged_path = {
        let mut entries = std::fs::read_dir(&staging)
            .map_err(|error| format!("Cannot inspect the staged update: {error}"))?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_file())
            .collect::<Vec<_>>();
        match entries.pop() {
            Some(path) => path,
            None => {
                let _ = std::fs::remove_dir_all(&staging);
                return Err("The staged update folder is empty".to_string());
            }
        }
    };

    let outcome = match (std::env::consts::OS, artifact.format.as_str()) {
        ("windows", "nsis-setup") => {
            // The installer keeps the normal user-visible flow (no silent
            // elevation, per-user install). The app stays open so the user
            // can finish or cancel; the installer carries its own rollback.
            std::process::Command::new(&staged_path)
                .spawn()
                .map_err(|error| format!("Could not launch the verified installer: {error}"))?;
            let _ = std::fs::remove_dir_all(&staging);
            Ok(AfterInstall::InstallerLaunched)
        }
        ("windows", "msi") => {
            std::process::Command::new("msiexec")
                .args(["/i"])
                .arg(&staged_path)
                .spawn()
                .map_err(|error| format!("Could not launch the verified installer: {error}"))?;
            let _ = std::fs::remove_dir_all(&staging);
            Ok(AfterInstall::InstallerLaunched)
        }
        ("linux", "deb") => install_deb(&staged_path).await.map(|_| AfterInstall::Restarting),
        ("linux", "appimage") => {
            if !prefer_appimage_runtime() {
                Err(
                    "This build was installed from the deb package; update via the deb artifact from the release page"
                        .into(),
                )
            } else {
                install_appimage(&staged_path).map(|_| AfterInstall::Restarting)
            }
        }
        ("linux", other) => {
            Err(format!("The verified manifest offers an unsupported artifact format on Linux: {other}"))
        }
        (os, other) => {
            Err(format!("The verified manifest offers an unsupported artifact format on {os}: {other}"))
        }
    };
    // The staged bytes are consumed by success paths above; any other
    // outcome must not leave a copy of the installer behind in temp space.
    if outcome.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    outcome
}

fn prefer_appimage_runtime() -> bool {
    std::env::var("APPIMAGE").is_ok() && std::env::var("APPIMAGE")
        .map(|value| !value.is_empty() && std::path::Path::new(&value).is_file())
        .unwrap_or(false)
}

/// Atomic in-place AppImage replacement with a retained previous copy.
fn install_appimage(staged_path: &std::path::Path) -> Result<(), String> {
    let runtime_path = std::env::var("APPIMAGE")
        .map(PathBuf::from)
        .map_err(|_| "The running AppImage path is unknown (APPIMAGE is unset)".to_string())?;
    let runtime_path = runtime_path
        .canonicalize()
        .map_err(|error| format!("Cannot resolve the running AppImage: {error}"))?;
    let backup = runtime_path.with_extension("AppImage.previous");
    let staged_bytes = std::fs::read(staged_path)
        .map_err(|error| format!("Cannot read the staged update: {error}"))?;
    // Preserve the working version first: rollback source for a failed swap.
    if backup.exists() {
        let _ = std::fs::remove_file(&backup);
    }
    let _ = std::fs::copy(&runtime_path, &backup); // best effort; absence is fine
    let replacement = runtime_path.with_extension("AppImage.update-new");
    {
        let mut file = std::fs::File::create(&replacement)
            .map_err(|error| format!("Cannot write the replacement image: {error}"))?;
        file.write_all(&staged_bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Cannot write the replacement image: {error}"))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&replacement, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("Cannot set executable permission on the replacement image: {error}"))?;
    }
    if std::fs::rename(&replacement, &runtime_path).is_err() {
        // Cross-filesystem or busy rename: belt-and-braces byte copy.
        std::fs::write(&runtime_path, &staged_bytes)
            .map_err(|error| format!("Cannot replace the running AppImage: {error}"))?;
        std::fs::remove_file(&replacement).ok();
    }
    Ok(())
}

/// Standard package-manager flow on Linux: the user consents through the
/// platform policy agent (pkexec) and the package manager keeps its own
/// upgrade history — user data and configuration are preserved by dpkg.
async fn install_deb(staged_path: &std::path::Path) -> Result<(), String> {
    let path = staged_path.to_path_buf();
    let output = tokio::time::timeout(INSTALL_TIMEOUT, tokio::task::spawn_blocking(move || {
        std::process::Command::new("pkexec")
            .args(["dpkg", "-i"])
            .arg(&path)
            .output()
            .map_err(|error| format!("Could not run the package installer: {error}"))
    }))
    .await
    .map_err(|_| "The package installation timed out and was abandoned; the previous install is untouched".to_string())?
    .map_err(|error| format!("Package installation worker failed: {error}"))??;

    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!(
            "The package manager rejected the update: {}",
            if detail.is_empty() { "see pkexec/dpkg output".to_string() } else { detail }
        ))
    }
}

// ---------------------------------------------------------------------------
// Public service entry points (wrapped by #[tauri::command]s in commands/)
// ---------------------------------------------------------------------------

pub fn status_snapshot(app: &AppHandle) -> Result<UpdateGateStatus, String> {
    let guard = gate_state(app)?;
    guard
        .as_ref()
        .map(|runtime| runtime.status.clone())
        .ok_or_else(|| "Update gate is not initialised".into())
}

pub async fn check_now(app: &AppHandle) -> Result<UpdateGateStatus, String> {
    run_check(app, false).await
}

pub async fn install(app: &AppHandle) -> Result<(), String> {
    run_install(app).await
}

/// Recovery first-aid from inside the gate: reveal the app data directory so
/// the user can export databases and logs by hand regardless of gate state.
pub fn open_data_folder() -> Result<String, String> {
    let dir = crate::database::sqlite::get_app_dir();
    let dir_string = dir.display().to_string();
    let mut open = if cfg!(target_os = "windows") {
        std::process::Command::new("explorer")
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else {
        std::process::Command::new("xdg-open")
    };
    open.arg(dir_string);
    match open.spawn() {
        Ok(_) => Ok(dir.display().to_string()),
        Err(error) => Err(format!("Could not open the data folder ({}): {error}", dir.display())),
    }
}

// Used by tests via the public API only.
#[cfg(test)]
mod tests {
    use super::*;

    fn input(
        current: &str,
        latest: &str,
        severity: Option<&str>,
        mandatory: bool,
        authenticated: bool,
        min_supported: Option<&str>,
        cached_floor: Option<&str>,
        has_artifact: bool,
    ) -> DecisionInput<'static> {
        fn leak(value: &str) -> &'static str {
            Box::leak(value.to_string().into_boxed_str())
        }
        DecisionInput {
            current: leak(current),
            latest: leak(latest),
            severity: severity.map(leak),
            mandatory,
            authenticated,
            min_supported: min_supported.map(leak),
            cached_floor: cached_floor.map(leak),
            has_installable_artifact: has_artifact,
            pub_date: Some(leak("2026-10-30T13:30:13Z")),
        }
    }

    #[test]
    fn parse_versions_and_compares_segments() {
        assert_eq!(parse_version("2.0.2"), Some(vec![2, 0, 2]));
        assert_eq!(parse_version("2.0"), Some(vec![2, 0]));
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("2.0.x"), None);
        assert_eq!(parse_version("-1"), None);
        assert_eq!(parse_version("vv2"), None);
        assert_eq!(compare_versions(&[2, 0, 2], &[2, 0, 2]), Ordering::Equal);
        assert_eq!(compare_versions(&[2, 0, 10], &[2, 0, 9]), Ordering::Greater);
        assert_eq!(compare_versions(&[2, 0], &[2, 0, 0, 1]), Ordering::Less);
    }

    #[test]
    fn no_update_when_remote_is_not_newer() {
        // Same version (the verified 2.0.2 manifest on a 2.0.2 build).
        let decision = evaluate_update(&input("2.0.2", "2.0.2", Some("moderate"), false, true, None, None, true));
        assert!(matches!(decision, GateDecision::UpToDate));
        // Replayed OLDER signed manifest: only ever "no update".
        let decision = evaluate_update(&input("2.0.2", "2.0.0", Some("critical"), true, true, Some("2.0.2"), None, true));
        assert!(matches!(decision, GateDecision::UpToDate));
    }

    #[test]
    fn unsigned_manifest_is_informational_and_never_blocks_or_installs() {
        let decision = evaluate_update(&input("2.0.2", "2.0.3", Some("critical"), true, false, Some("2.0.5"), None, true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::Informational),
            other => panic!("expected advisory banner, got {other:?}"),
        }
    }

    #[test]
    fn authenticated_critical_mandatory_gates_when_installable() {
        let decision = evaluate_update(&input("2.0.2", "2.0.3", Some("critical"), true, true, Some("2.0.2"), None, true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "critical_update");
                assert_eq!(required_version, "2.0.3");
            }
            other => panic!("expected gate, got {other:?}"),
        }
    }

    #[test]
    fn critical_without_installable_package_downgrades_to_strong_banner() {
        let decision = evaluate_update(&input("2.0.2", "2.0.3", Some("critical"), true, true, Some("2.0.2"), None, false));
        match decision {
            GateDecision::Banner { kind, reason, .. } => {
                assert_eq!(kind, BannerKind::High);
                assert!(reason.contains("update manually"), "{reason}");
            }
            other => panic!("expected banner, got {other:?}"),
        }
    }

    #[test]
    fn severity_ladder_matches_spec() {
        let cases: [(&str, BannerKind); 4] = [
            ("informational", BannerKind::Informational),
            ("low", BannerKind::Low),
            ("moderate", BannerKind::Moderate),
            ("high", BannerKind::High),
        ];
        for (severity, expected) in cases {
            let decision = evaluate_update(&input("2.0.2", "2.0.3", Some(severity), false, true, None, None, true));
            match decision {
                GateDecision::Banner { kind, .. } => assert_eq!(kind, expected, "{severity}"),
                other => panic!("expected banner for {severity}, got {other:?}"),
            }
        }
        // Critical but non-mandatory stays advisory (strong warning).
        let decision = evaluate_update(&input("2.0.2", "2.0.3", Some("critical"), false, true, None, None, true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::High),
            other => panic!("expected banner, got {other:?}"),
        }
        // Unrecognized severity never enforces.
        let decision = evaluate_update(&input("2.0.2", "2.0.3", Some("quirky"), false, true, None, None, true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::Moderate),
            other => panic!("expected banner, got {other:?}"),
        }
    }

    #[test]
    fn security_floor_blocks_below_min_supported_only_when_authenticated() {
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, true, Some("2.0.2"), None, true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "security_floor");
                assert_eq!(required_version, "2.0.2");
            }
            other => panic!("expected floor gate, got {other:?}"),
        }
        // Same floor but unsigned manifest: the floor can still stick from
        // an earlier authenticated cache, not from the unsigned one.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, false, Some("2.0.2"), None, true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::Informational),
            other => panic!("expected advisory banner, got {other:?}"),
        }
        // Cached floor (previously authenticated) keeps enforcing even when
        // the fresh fetch is unsigned.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, false, None, Some("2.0.2"), true));
        match decision {
            GateDecision::Block { gate_kind, .. } => assert_eq!(gate_kind, "security_floor"),
            other => panic!("expected cached floor gate, got {other:?}"),
        }
    }

    #[test]
    fn cached_floor_never_lets_the_policy_slide_backwards() {
        // Fresh manifest pretends the floor is lower; the sticky cached floor wins.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, true, Some("2.0.1"), Some("2.0.2"), true));
        match decision {
            GateDecision::Block { required_version, .. } => assert_eq!(required_version, "2.0.2"),
            other => panic!("expected sticky floor, got {other:?}"),
        }
        // And a floor above current with no artifact still gates (metadata only).
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, true, Some("2.0.2"), None, false));
        match decision {
            GateDecision::Block { .. } => {}
            other => panic!("expected floor gate, got {other:?}"),
        }
    }

    #[test]
    fn floor_gates_even_when_installed_matches_the_latest_version() {
        // Regression: "up to date" must never preempt the security floor.
        // Installed == latest but below the signed floor still gates.
        let decision = evaluate_update(&input("2.0.1", "2.0.1", Some("moderate"), false, true, Some("2.0.2"), None, true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "security_floor");
                assert_eq!(required_version, "2.0.2");
            }
            other => panic!("expected floor gate on installed==latest, got {other:?}"),
        }

        // The same for a build below the sticky cached floor with an
        // unsigned fresh manifest: the cached floor keeps gating.
        let decision = evaluate_update(&input("2.0.1", "2.0.1", Some("moderate"), false, false, Some("1.0.0"), Some("2.0.2"), true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "security_floor");
                assert_eq!(required_version, "2.0.2");
            }
            other => panic!("expected cached floor gate on installed==latest, got {other:?}"),
        }
    }

    #[test]
    fn cached_floor_enforces_when_the_fresh_manifest_states_no_floor() {
        // An authenticated manifest that stopped advertising a floor must
        // not let the previously authenticated floor lapse.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, true, None, Some("2.0.2"), true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "security_floor");
                assert_eq!(required_version, "2.0.2");
            }
            other => panic!("expected sticky cached floor gate, got {other:?}"),
        }

        // A malformed `latest` version cannot hide floor enforcement either.
        let decision = evaluate_update(&input("2.0.1", "not-a-version", Some("critical"), true, true, Some("2.0.2"), None, true));
        match decision {
            GateDecision::Block { gate_kind, required_version, .. } => {
                assert_eq!(gate_kind, "security_floor");
                assert_eq!(required_version, "2.0.2");
            }
            other => panic!("expected floor gate despite malformed latest, got {other:?}"),
        }
    }

    #[test]
    fn unsigned_manifest_cannot_weaken_the_enforcement_floor() {
        // Claims lower than the sticky cache: the cache wins and is what is
        // reported as required.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, false, Some("2.0.1"), Some("2.0.2"), true));
        match decision {
            GateDecision::Block { required_version, .. } => assert_eq!(required_version, "2.0.2"),
            other => panic!("expected sticky floor to win, got {other:?}"),
        }

        // Claims higher than reality: unsigned data never raises enforcement
        // either — the build meets the cached floor and stays advisory only.
        let decision = evaluate_update(&input("2.0.2", "2.1.0", Some("low"), false, false, Some("9.9.9"), Some("2.0.2"), true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::Informational),
            other => panic!("expected advisory banner for an unsigned floor claim, got {other:?}"),
        }

        // Tries to introduce a floor for a build that never authenticated
        // one: nothing enforces, nothing gates.
        let decision = evaluate_update(&input("2.0.0", "2.1.0", Some("low"), false, false, Some("2.0.9"), None, true));
        match decision {
            GateDecision::Banner { kind, .. } => assert_eq!(kind, BannerKind::Informational),
            other => panic!("expected informational banner with no cached floor, got {other:?}"),
        }
    }

    #[test]
    fn builds_meeting_the_floor_and_up_to_date_stay_ungated() {
        let decision = evaluate_update(&input("2.0.2", "2.0.2", Some("moderate"), false, true, Some("2.0.2"), Some("2.0.2"), true));
        assert!(matches!(decision, GateDecision::UpToDate));
        // A previously higher sticky floor met by a newer build, unsigned
        // fresh manifest: still no gate, no nag.
        let decision = evaluate_update(&input("2.0.3", "2.0.3", Some("moderate"), false, false, Some("2.0.0"), Some("2.0.2"), true));
        assert!(matches!(decision, GateDecision::UpToDate));
    }

    #[test]
    fn repo_manifest_verifies_with_embedded_public_key_and_tampering_fails() {
        // Pin the real, committed manifest + signature pair to the key that
        // the shipped binary embeds; a byte-flip must fail verification.
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let manifest = std::fs::read(root.join("update.json"))
            .expect("update.json must exist in the repository root");
        let signature = std::fs::read(root.join("update.json.sig"))
            .expect("update.json.sig must exist in the repository root");
        // Shape 2: the tauri-CLI base64 container, as committed.
        verify_manifest_signature(&manifest, &signature).expect("committed manifest must verify");
        // Shape 1: the same signature written as raw minisign text must
        // verify too, so future artifacts may use either representation.
        // (signature_text_from_file unwraps the committed container.)
        let raw_text = signature_text_from_file(&signature)
            .expect("committed container must decode to minisign text");
        assert!(raw_text.starts_with("untrusted comment:"));
        verify_manifest_signature(&manifest, raw_text.as_bytes())
            .expect("raw minisign text shape must verify");
        let tampered = {
            let mut tampered = manifest.clone();
            if let Some(last) = tampered.last_mut() {
                *last = b' ';
            }
            tampered
        };
        assert!(verify_manifest_signature(&tampered, &signature).is_err());
        assert!(verify_manifest_signature(&tampered, raw_text.as_bytes()).is_err());
        // An empty signature file fails cleanly instead of panicking.
        assert!(verify_manifest_signature(&manifest, b"").is_err());
    }

    #[test]
    fn download_url_validation_is_https_and_host_allowlisted() {
        assert!(check_download_url("https://github.com/a/b/releases/download/v1/x.deb").is_ok());
        assert!(check_download_url("https://objects.githubusercontent.com/x").is_ok());
        assert!(check_download_url("http://github.com/x").is_err());
        assert!(check_download_url("https://evil.example/x").is_err());
        assert!(check_download_url("ftp://github.com/x").is_err());
    }

    #[test]
    fn persisted_state_roundtrips_json() {
        let dir = std::env::temp_dir().join(format!("netoze-gate-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("update-gate-state.json");
        let persisted = PersistedState {
            schema: 1,
            last_check_at: Some(1_760_000_000_000),
            last_check_ok: Some(true),
            last_error: None,
            last_authenticated_at: Some(1_760_000_000_001),
            last_authenticated_manifest_version: Some("2.0.2".into()),
            last_authenticated_severity: Some("moderate".into()),
            last_authenticated_mandatory: Some(false),
            last_authenticated_notes_url: Some("https://github.com/1viz3r0/xtreme-sexo/releases/tag/v2.0.2".into()),
            floor_ever_seen: Some("2.0.2".into()),
        };
        std::fs::write(&path, serde_json::to_vec_pretty(&persisted).unwrap()).unwrap();
        let loaded = load_persisted(&path).unwrap();
        assert_eq!(loaded.floor_ever_seen.as_deref(), Some("2.0.2"));
        assert_eq!(loaded.last_authenticated_severity.as_deref(), Some("moderate"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cached_gate_applies_from_persisted_state() {
        let persisted = PersistedState {
            schema: 1,
            last_authenticated_at: Some(now_ms()),
            last_authenticated_manifest_version: Some("2.0.3".into()),
            last_authenticated_severity: Some("critical".into()),
            last_authenticated_mandatory: Some(true),
            ..PersistedState::default()
        };
        let builder = Builder { current_version: "2.0.2" };
        let status = status_with_persisted_only(&builder, &persisted, false, false);
        assert!(status.gate_active);
        assert_eq!(status.gate_kind.as_deref(), Some("critical_update"));
        assert_eq!(status.gate_required_version.as_deref(), Some("2.0.3"));

        // Same cache but the build already matches: no gate.
        let builder = Builder { current_version: "2.0.3" };
        let status = status_with_persisted_only(&builder, &persisted, false, false);
        assert!(!status.gate_active);
    }

    #[test]
    fn cached_floor_gate_applies_from_persisted_state() {
        let persisted = PersistedState {
            schema: 1,
            last_authenticated_at: Some(now_ms()),
            floor_ever_seen: Some("2.0.2".into()),
            ..PersistedState::default()
        };
        let builder = Builder { current_version: "2.0.1" };
        let status = status_with_persisted_only(&builder, &persisted, false, false);
        assert!(status.gate_active);
        assert_eq!(status.gate_kind.as_deref(), Some("security_floor"));

        // Stale cached policy (older than TTL) does not gate.
        let expired = PersistedState {
            schema: 1,
            last_authenticated_at: Some(now_ms() - CACHED_POLICY_TTL_MS - 1000),
            floor_ever_seen: Some("2.0.2".into()),
            ..PersistedState::default()
        };
        let builder = Builder { current_version: "2.0.1" };
        let status = status_with_persisted_only(&builder, &expired, false, false);
        assert!(!status.gate_active);
    }

    #[test]
    fn unsigned_real_manifest_simulated_end_to_end_is_advisory() {
        // The in-repo manifest (verified v2.0.2, severity moderate) checked
        // with a broken-signature scenario on an equal build: up to date.
        let manifest_latest = "2.0.2";
        let decision = evaluate_update(&DecisionInput {
            current: "2.0.2",
            latest: manifest_latest,
            severity: Some("moderate"),
            mandatory: false,
            authenticated: false,
            min_supported: Some("2.0.2"),
            cached_floor: None,
            has_installable_artifact: true,
            pub_date: Some("2026-10-30T13:30:13Z"),
        });
        assert!(matches!(decision, GateDecision::UpToDate));
    }

    #[test]
    fn status_with_manifest_keeps_the_sticky_floor_after_clearing_cached_fields() {
        // The status builder clears previously cached gate fields and then
        // re-derives the whole decision from the fresh manifest; the sticky
        // floor must survive that sequence in both signature states.
        let persisted = PersistedState {
            schema: 1,
            last_authenticated_at: Some(now_ms()),
            floor_ever_seen: Some("2.0.2".into()),
            ..PersistedState::default()
        };
        let builder = Builder { current_version: "2.0.1" };

        // Signed manifest, installed == latest, below the floor: the answer
        // is the floor gate, never "up to date".
        let signed = AuthenticatedManifest {
            manifest: UpdateManifest {
                schema: Some(1),
                app: Some("netoze-desktop".into()),
                channel: Some("stable".into()),
                force_min_version: None,
                min_supported_version: Some("2.0.2".into()),
                generated_at: None,
                latest: UpdateLatest {
                    version: "2.0.1".into(),
                    severity: Some("moderate".into()),
                    mandatory: false,
                    pub_date: None,
                    notes_url: None,
                },
                platforms: std::collections::HashMap::new(),
                signing: None,
            },
            advisory_only: false,
        };
        let status = status_with_manifest(&builder, &signed, &persisted, false);
        assert!(status.gate_active);
        assert_eq!(status.gate_kind.as_deref(), Some("security_floor"));
        assert_eq!(status.gate_required_version.as_deref(), Some("2.0.2"));

        // The floorless UNSIGNED twin carries no floor authority of its own;
        // the gate that remains must come from the sticky persisted floor.
        let unsigned = AuthenticatedManifest {
            manifest: UpdateManifest {
                schema: Some(1),
                app: Some("netoze-desktop".into()),
                channel: Some("stable".into()),
                force_min_version: None,
                min_supported_version: None,
                generated_at: None,
                latest: UpdateLatest {
                    version: "2.0.1".into(),
                    severity: Some("moderate".into()),
                    mandatory: false,
                    pub_date: None,
                    notes_url: None,
                },
                platforms: std::collections::HashMap::new(),
                signing: None,
            },
            advisory_only: true,
        };
        let status = status_with_manifest(&builder, &unsigned, &persisted, false);
        assert!(status.advisory_only);
        assert!(status.gate_active);
        assert_eq!(status.gate_kind.as_deref(), Some("security_floor"));
        assert_eq!(status.gate_required_version.as_deref(), Some("2.0.2"));

        // A build meeting the floor stays ungated even when everything else
        // is unchanged.
        let builder = Builder { current_version: "2.0.3" };
        let status = status_with_manifest(&builder, &signed, &persisted, false);
        assert!(!status.gate_active);
    }
}

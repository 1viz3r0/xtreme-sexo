# Update architecture — signed manifest gate

This document describes how the NET0ZE desktop client decides whether an
update exists, whether it is enforced, and how (and when) it installs one.

## One source of truth

A single file at the repository root — `update.json` — carries the entire
update policy:

* `latest` — the newest version, its severity, whether the publisher marked
  it mandatory, publication date and a notes URL.
* `min_supported_version` (the security floor) — the oldest version this
  channel still supports. Versions below it are gated.
* `platforms` — per-platform artifact entries with `format`, `url`,
  `bytes` and `sha256`.
* Preserved legacy keys: `force_min_version` (historical floor spelling; the
  stricter of the two always wins) and `policy` (historical marking).

A detached signature — `update.json.sig` — is verified against an Ed25519
(minisign-format) public key embedded in the binary. **There is no second,
unsigned decision channel anywhere in the client**: version truth, URLs,
checksums, floor and severity all come from this one file. (The existing
`tauri-plugin-updater` design was deliberately superseded by this model; see
`SECURITY_DECISIONS.md`.)

## Signature handling

* Format: minisign/ed25519 produced by `tauri signer`. The client's
  verification uses `minisign-verify` with legacy mode disabled.
* Two byte shapes are accepted for the detached file, both native to the
  tauri/minisign ecosystem:
  1. raw minisign text (`untrusted comment: …\n<base64 payload>\n`), and
  2. the tauri-CLI container — the same text wrapped once more as a single
     base64 line, which is what `tauri signer` writes next to `.pub` keys
     and embeds in its own updater manifests.
  Both paths end in the same cryptographic verification over the same
  manifest bytes; the container only changes how the structure is reached.
* The verification key is embedded in `src-tauri/src/services/update_gate.rs`
  (`UPDATE_MANIFEST_PUBLIC_KEY`, key id `939876411A7C0F1B`).

## Decision table

All decisions are made in one pure function (`evaluate_update`), covered by
unit tests on the real values:

| Condition | Result |
|---|---|
| Latest ≤ running build (incl. replayed old signed manifest) | "No update" — downgrades are refused |
| Manifest **unsigned / bad signature** | Informational banner only — never a gate, never an install |
| Build below security floor (authenticated manifest) | **Gate** — "Update required" overlay |
| Build below the sticky cached floor (even if the fresh manifest is unsigned) | **Gate** |
| `critical` + `mandatory`, verified, installable artifact exists | **Gate** |
| `critical` + `mandatory`, verified, but no installable artifact for this platform | High banner (never a gate you cannot satisfy) |
| `critical` non-mandatory, or `high` | High banner |
| `moderate` (or unrecognized severity) | Moderate banner |
| `low` | Low banner |
| `informational` | Informational banner |

## Enforcement requires identity *and* history

A gate is enforced only when **both** hold:

1. The fetched manifest verifies against the embedded key, **and**
2. a previously-authenticated policy exists in the local cache
   (`update-gate-state.json`, created with `0600` permissions in the app data
   directory, written atomically) and is less than 30 days old.

Consequences: a fresh install with no history stays fail-open on first
contact; a single compromised network path cannot *introduce* enforcement
where none was previously authenticated; and the cached copy alone can keep
a previously-verified gate alive through outages.

## Sticky security floor

The highest floor ever seen from a *verified* manifest is cached and remains
in effect even if a later unsigned (or replayed) manifest claims a lower
floor. Only a verified manifest with an even higher floor raises it — and
replayed-older manifests are refused by the downgrade rule before they can
do anything at all.

## Rate limits and lifecycle

* Boot check runs ~2 s after startup, then every 6 h.
* Manual "check now" is throttled to one network check per minute.
* Check concurrency: one in-flight check; a second request returns the
  current status instead of duplicating network work.
* Manifest and signature are fetched with hard size limits (256 KiB /
  16 KiB), HTTPS-only client with short connect/total timeouts.

## Network failure never disables the app

Every failure path (network unreachable, HTTP error, malformed data,
oversized response, signature fetch failure) results in:

* status recorded (last check time, last error) in the persisted state,
* the app rendered **fully operational** with at most a stale/failed note in
  the update banner,
* no gate from the failed check alone. A previously-verified cached gate can
  still apply (by design above), but a *failed check* itself can never gate.

## Install flow (all steps user-initiated except the checks)

1. A fresh manifest is fetched and signature-verified at install time — a
   cached "Update now" button state is never trusted for the install itself.
2. Platform/arch match, URL (HTTPS + host allowlist: `github.com`,
   `objects.githubusercontent.com`), and "strictly newer than running
   build" are validated; the artifact size and SHA-256 are required fields.
3. The artifact is streamed to a private staging directory
   (`0700` folder, `0600` file) while hashing on the fly; size and digest
   must match the **verified** manifest exactly or everything is deleted.
4. Install routes:
   * Linux `deb` → `pkexec dpkg -i <staged.deb>` — the policy-agent prompt is
     the user consent step; the package manager keeps its own rollback.
   * Linux AppImage (only when the app actually runs from an AppImage) →
     backup copy of the running image retained, atomic replace, app restart.
   * Windows `nsis-setup`/`msi` → the user-visible installer is launched;
     **no silent installs**, no `/quiet`, the app handles no elevation.
5. After a successful deb/AppImage install the app restarts itself. Staging
   directories are cleaned in every outcome.

## The gate never blocks recovery

While the gate overlay is displayed:

* it covers **only the workspace** — the navigation sidebar stays fully
  reachable (Overview, Capture Buddy, System logs, diagnostics, Profile…),
* an "Open data folder" button opens the app data directory from inside the
  gate, enabling manual database/log export at any time,
* "Check again" retries the check; everything else keeps working.

## What the gate deliberately does not do

* It cannot disable the application remotely; unsigned policies can never
  turn off features or block the app.
* It performs no silent/prefetch/background installs; nothing runs before an
  explicit user click.
* It does not "phone home" beyond the manifest fetches: the client sends no
  telemetry about update status to any server.

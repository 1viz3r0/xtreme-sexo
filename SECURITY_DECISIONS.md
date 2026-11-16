# Security decisions log

Numbered, dated decisions behind the update system and hardening work —
including the ones that were reversed, and the limitations accepted on
purpose. This file records *why*; "how" lives in `UPDATE_ARCHITECTURE.md`
and `RELEASE_SECURITY.md`.

## 1. One signed manifest; the tauri updater plugin was superseded (2026-11-10)

The first sketch layered the policy controller on top of
`tauri-plugin-updater`, whose manifest (`latest.json`) the plugin fetches
and trusts on its own. That splits trust: the plugin's unsigned manifest
chooses *what* to install and *where from*, while the signed policy file
would only decorate the choice. A write access to the repository (or the
plugin-hosted manifest path) could point a newer-claimed version at a
replayed, validly-signed old artifact — a downgrade dressed as an upgrade.

Decision: **no second release infrastructure and no second decision
channel**. One manifest (`update.json` + detached signature) governs
version truth, URLs, per-artifact sha256, floor, severity and mandatory
status end-to-end, and installers verify streamed bytes against it. The
plugin remains adoptable later without re-keying: our keys and signature
shape are tauri-signer/minisign-compatible.

Limitation accepted: the tauri plugin's own flow cannot be used verbatim
until it is pointed at the signed manifest; do not re-enable it casually.

## 2. Unsigned / unverifiable manifests are informational only (2026-11-10)

A manifest that fails key verification can still raise a banner ("there is
a newer version") because withholding all information is not free either.
But it can never: gate the app, enable the install button, raise
enforcement colors, or link out (the notes_url of an unverified manifest is
not rendered as a link, so a fake "critical" cannot borrow urgency).

Rationale: a compromised or misconfigured *publication* channel must
degrade to advice, not to enforcement. Enforcement requires a signature
that currently verifies **plus** a previously-authenticated policy in the
local cache (≤ 30 days old) — so enforcement can only ever be *continued*
by a network attacker, never *introduced*.

## 3. Gate requires history — fresh installs stay fail-open (2026-11-10)

Because of decision 2, a brand-new install that has never verified a
policy cannot be gated on first contact, even by a verified manifest.
Accepted cost: a genuinely mandatory critical update has a grace window
(one successful verified check establishes the cache immediately).

## 4. Sticky security floor (2026-11-10)

The highest `min_supported_version` ever seen from a verified manifest is
cached and enforced even if later manifests are unsigned or claim lower.
Only a verified manifest may *raise* the floor. Without stickiness, a
manifest regression would weaken users' protection retroactively.

## 5. Downgrades and replays render as "no update" (2026-11-10)

Version comparison precedes every other rule: anything at or below the
running build produces no banner and no install site. Combined with the
per-artifact sha256 verification, a replayed older signed manifest is
inert.

## 6. Detached signature file: two accepted byte shapes (2026-11-10)

`minisign-verify`'s `Signature::decode` expects raw minisign text, but the
tauri CLI's native output (and its own updater manifests) stores signatures
as a single-line base64 container of that text. The shipped verifier
accepts both shapes and then performs the identical cryptographic check.

Why accept both instead of normalizing the artifact: the committed
`update.json.sig` is what `tauri signer` produces verbatim, and requiring a
manual post-processing step in every future release cycle would eventually
be skipped — producing a *silently unverified* update system (manifests
forever advisory-only). Accepting the tooling's native shape keeps the
ceremony a single command. There is no security cost: both paths perform
the same checks over the same bytes; legacy verification stays disabled;
the container choice is neither attacker-controlled nor check-relevant.

## 7. No silent installs, ever (2026-11-10)

Windows installers are launched visibly and handle their own consent and
rollback; Linux deb installs go through `pkexec` so the platform policy
agent (not our code) captures the administrative consent; AppImage updates
replace files the user owns. Nothing prefetches or auto-runs an installer
without a click. The gate overlay shows a progress stage, not a hidden
worker.

## 8. The gate covers the workspace, not the whole window (2026-11-10)

A full-window modal would make "mandatory update" indistinguishable from
"the app disabled itself". The overlay instead sits over the workspace,
leaving navigation — and with it recovery, diagnostics, every tool, and
data export — reachable. The overlay itself carries "Open data folder" for
first-aid export. This is the strongest reading of the standing rule that
the update gate never blocks recovery, diagnostics, or user-data export.

## 9. Fail-open on network failure (2026-11-10)

Checks (boot + 6 h + manual) that fail degrade to status notes; a failed
check cannot itself gate anything. Previously-verified cached policy can
still apply (decision 2's history requirement), which keeps enforcement
honest through outages without letting a dead network become an excuse to
disable the app.

## 10. Keys out of the repository and out of CI (2026-11-10)

See `CREDENTIAL_POLICY.md`. CI performs no signing; the trust root is the
maintainer (limitation, not accident — stated plainly in
`RELEASE_SECURITY.md`).

## 11. Windows binaries are unsigned; that is disclosed, not hidden (2026-11-10)

No code-signing certificate exists in this project and none was procured.
SmartScreen warnings on first Windows installs are an expected consequence
and are disclosed in `RELEASE_SECURITY.md`. The application offers no
mechanism to suppress OS warnings (and none may be built — see the
boundary list below).

## 12. Release/production-critical build hardening (2026-11-10)

Release profile switched to fat LTO, single codegen unit, stripped symbols,
`panic = "abort"`; devtools feature removed from release builds; production
CSP tightened (dev origins moved to `devCsp`); `withGlobalTauri` pinned
off; window devtools disabled. Verified safe against behavior: the frontend
only fetches same-origin bundled assets, and Tauri presence detection keys
on `__TAURI_INTERNALS__`, which is independent of `withGlobalTauri`. Debug
builds are unaffected.

## 13. Boundaries this project maintains (standing)

The project does not build, adopt or accept contributions of: hidden
monitoring or telemetry about users, stealth or anti-analysis mechanisms,
anti-debug/evasion techniques, EDR/AV bypass, policies that remotely
disable the application, silent installation flows, or second/parallel
release infrastructures. Decisions in this log are made *inside* those
boundaries, explicitly.

## 14. Rejected designs, kept on record (2026-11-10)

* Layering enforcement on an unsigned plugin manifest (superseded —
  decision 1).
* Trusting `force_min_version` from an unsigned legacy snapshot as an
  enforcement source: refused; historical keys are preserved in the
  manifest schema for compatibility and its *signed* successors can carry
  the floor, but an unsigned floor can only inform, never enforce.
* Any "policy server" or remote lockout endpoint: refused (boundary).

## 15. Manifest versions are adopted only from byte-verified artifacts (2026-11-10)

The public repository also carries a `v2.1.0` tag release (published
2026-11-02) with real 2.1.0 Linux installers plus `.minisig` sidecar files
from an unknown/earlier key. The signed manifest deliberately declares
`latest = 2.0.2` — the newest release whose artifact bytes, sizes and
SHA-256 digests were verified in a maintainer-run ceremony. The 2.1.0
artifacts are **not** adopted until the maintainer hashes those bytes
themselves and re-signs the manifest; existing `.minisig` attachments are
not trusted on their word.

Consequences (all intended): a 2.1.0 client sees "no update"; a 2.0.x
client is never offered 2.1.0 artifacts by this channel; nothing about the
2.1.0 release can be pulled up (or down) inside this gate. Only a
maintainer re-sign of a manifest that intentionally claims 2.1.0 changes
this.


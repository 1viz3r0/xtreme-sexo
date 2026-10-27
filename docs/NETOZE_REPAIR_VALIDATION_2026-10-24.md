# NET0ZE repair and acceptance evidence — 2026-10-24

## Scope and baseline

Execution date: 2026-10-24, Asia/Kolkata. Repository:
`/home/addie/omnirush.ai/xtreme-sexo`, branch `master`, starting HEAD `34490da`.
The worktree already contained 84 tracked modified/deleted files and three
untracked tests. Preserve those changes; this run is not a commit, deployment,
host installation, or permission to discard existing work.

Worker: Debian 12 Linux container, mapped root, Node 22.23.3, npm 10.9.9,
Rust/Cargo 1.98.1, Python 3.11.2. This is not the Ryoku host or Windows.
Generated logs belong under ignored `target/netoze-validation-2026-10-24/`.
Never put private runtime inputs, captures, credentials, or raw chat in this report.

Fresh pre-repair checks:

| Check | Observed result | Evidence |
|---|---|---|
| `npm test` | 190 frontend/service + 13 script passes | `baseline-frontend.log` |
| `npm run lint` | zero warnings/errors | `baseline-lint.log` |
| `npm run build` | passed | `baseline-build.log` |
| Cargo library/binary check | passed | `baseline-cargo-check.log` |
| Cargo library/helper tests | 145 + 1 passed; two Docker ignores | `baseline-rust-tests.log` |
| `cargo fmt -- --check` | MISSING DEPENDENCY: rustfmt absent | `baseline-rustfmt.log` |
| `npm audit --json` | three high, one moderate package finding | `baseline-npm-audit.json` |

Logs above are relative to the ignored evidence directory. Historical counts in
the handoff are not substitutes for this run. Existing tests passing does not
establish native capture, Docker lifecycle, installation, or Windows acceptance.

## Discovered skills and integrations

Workspace-local skill discovery found `.opencode/skills/ponytail/SKILL.md` in
the parent workspace; the NET0ZE folder has no separate local skill catalog.
The runtime skill inventory also provides project setup/feature/debug/test/
refactor/performance/build/review/handoff guides, Ryoku, and agent-swarm.
Relevant instructions actually loaded: **ponytail, project-debug,
project-review, project-build, project-test, project-handoff, ryoku**.
There is no exposed dedicated Rust/Tauri/security-audit skill. Two independent
general agents reviewed capture and Labs; no nested agents or swarm was used.

Available tool integrations inspected: filesystem/Git/shell, app context and
extension action inventory, MCP resource/template inventory, browser/WebMCP,
computer-use discovery, and research tools. Exposed app extension actions are
unrelated Google Workspace/image/upload actions; none provides a native-host
runner. MCP demo resources and private memory were not used as project evidence.
The real screen is not enabled; the host Rashin vault/`ryoku` CLI is not
accessible inside this worker. No host settings were changed.

## Initial defect and acceptance ledger

P1 denotes high user impact/data safety; P2 denotes significant correctness or
boundedness. The rows record pre-repair evidence, not final resolution.

| ID | Classification/severity | Evidence and cause | Correction and verification |
|---|---|---|---|
| C1 | TEST DEFECT / P1 | DNS integration deletes every `example.com` row in the ordinary app database | Isolate storage; uniquely identify test observations; prove pre-existing rows survive |
| C2 | SOURCE DEFECT / P1 | `start_helper` drops five validated capture options and sends only three arguments | Use negotiated supported options; assert exact protocol and bounds |
| C3 | SOURCE DEFECT / P1 | Overview opens pcap in the GUI although Linux grants capture privilege only to its helper | Use the existing privilege-separated capture model; ordinary-user native acceptance |
| C4 | SOURCE DEFECT / P1 | Graph ingestion inserts multiple entries but evicts only one | Enforce caps and edge integrity under high-cardinality fixture input |
| C5 | SOURCE DEFECT / P2 | Detection sliding-window trackers never expire | Explicit bounded observation window and deterministic expiry tests |
| C6 | SOURCE DEFECT / P2 | Tutorial recording never polls completion or closes replaced/unmounted sessions | Session ownership, late-start cleanup, completion/repeated-session tests |
| C7 | SOURCE DEFECT / P2 | App exit omits passive capture stop/final flush | Wire bounded capture shutdown and test termination/persistence |
| C8 | SOURCE DEFECT / P2 | Permanent pcap errors loop indefinitely while reporting RUNNING | Terminal error propagation, cleanup, restart regression |
| C9 | SOURCE DEFECT / P2 | Blocking file open occurs before regular-file validation | Nonblocking Unix open and descriptor validation; FIFO rejection regression |
| C10 | SOURCE DEFECT / P2 | Capture restart resets duration but retains counters | Per-run counters/baselines and idle-restart test |
| C11 | SOURCE DEFECT / P2 | Live parser ignores declared packet boundaries/fragments and DNS TCP framing | Malformed/truncated/padding/fragment/DNS TCP fixtures |
| C12 | SOURCE DEFECT / P2 | Automatic capture files rely on ambient umask | Private Unix directories/files; permission and no-overwrite tests |
| L1 | SOURCE DEFECT / P1 | Synchronous Labs commands perform blocking Docker work on the UI thread | Blocking-worker IPC and responsiveness/cancellation checks |
| L2 | SOURCE DEFECT / P1 | Reset reads lab ID after Stop clears it | Preserve selected active ID; reset each provisioned room |
| L3 | SOURCE DEFECT / P1 | Linux permission room has no learner-discoverable flag artifact; advertised routes return 404 | Fixed clue-linked review artifact; recover then submit via actual HTTP |
| L4 | SOURCE DEFECT / P2 | Cached running state persists after target death; ignored test contradicts implementation | Off-thread health reconciliation and listener cancellation tests |
| L5 | SOURCE DEFECT / P2 | Inherited Buildx builder can send private build context elsewhere | Bind build to validated local engine; environment/command regression |
| L6 | SOURCE DEFECT / P2 | In-flight background Status causes Stop/Reset to be rejected | Serialize user action behind poll; deferred-status mounted regression |
| L7 | SOURCE DEFECT / P2 | URL opener waits without a deadline while holding runtime lock | Release lock, bound/reap child; stuck-opener regression |
| L8 | SOURCE DEFECT / P2 | Remount/catalog selection labels an existing run as another room | Derive active identity from runtime ID; remount regression |
| L9 | SOURCE DEFECT / P2 | Required TCP port 9000 rooms expose only an HTTP endpoint | Owned bounded loopback TCP ingress; actual protocol acceptance |
| S1 | TEST DEFECT / P1 | Auth integration removes the ordinary auth file before testing | Isolated guarded test storage; never run destructive cleanup on user store |
| S2 | SOURCE DEFECT / P2 | Download name collision check followed by truncating write races and can follow links | Atomic create-new suffix selection; no-overwrite/link regression |
| S3 | SOURCE DEFECT / P2 | Auth secrets use default-mode non-atomic writes and RandomState as entropy | OS entropy, private atomic storage, corruption/link/permission tests |
| D1 | SOURCE/DEPENDENCY DEFECT | Audit identifies vulnerable Vite/nanoid/source-map-js/moment versions | Verify primary advisories; targeted compatible updates and fresh audit |
| E1 | PERMISSION LIMITATION | AF_PACKET protocol-zero sockets fail EPERM despite a CAP_NET_RAW bit in the worker user namespace | Capability must apply to network namespace owner; no privilege bypass; native helper acceptance |
| E2 | INFRASTRUCTURE LIMITATION | No Docker CLI, alternative runtime, or local daemon socket exposed | Approved native Linux Docker >=28; run ignored lifecycle/sandbox tests |
| E3 | HOST ACCEPTANCE REQUIRED | No Windows runtime or real Ryoku screen/runner exposed | Native install/launch/upgrade/uninstall/capture test matrices |
| E4 | PARTIAL | Windows cross-build notices concern missing SDK PDBs, cross-host/signing and NSIS charset | Keep diagnostics visible; distinguish build evidence from signing/runtime acceptance |

### Capture permission diagnosis

Controlled probes created no capture binding and sent/received no traffic.
Ordinary UDP socket creation works; AF_PACKET RAW/DGRAM with protocol zero and
IPv4 raw ICMP creation fail with EPERM. Device enumeration succeeds. The worker
has mapped UID 0, `NoNewPrivs=1`, and an effective CAP_NET_RAW bit, but that bit is
scoped to its user namespace. Querying the network namespace's owning user
namespace is denied. The installed helper's bit-only check reports capability,
which is not proof that this network namespace permits capture. This is not a
verified missing-libpcap diagnosis, and granting privileges to the GUI is not a fix.

## Current execution status

Baseline established; confirmed repairs and final results are recorded below as
they are verified. Initial readiness is **NOT READY** because confirmed P1
source/data-safety defects remain at this checkpoint.

## Integrated repairs and observed regressions

The initial ledger above is historical. The following describes the integrated,
uncommitted source now tested; it does not imply successful native acceptance.
Both delegated workstreams finished, their returned results were read, and the
combined source was compiled/tested independently. No agents remain pending.

| Findings | Integrated correction | Verification boundary |
|---|---|---|
| C1, S1 | Random disposable native-test storage, serialized environment ownership, original environment restoration, guarded cleanup. A dedicated `NETOZE_TEST_DATA_HOME` override supports Windows known-folder resolution; invalid/relative/nonexistent overrides fail before touching installed data. | Auth, DNS preservation, runtime logging, and concurrent local-service integration checks pass; Windows runtime not exercised. |
| C2, C3 | All eight capture options reach the installed helper. Passive Linux capture reads the helper's bounded PCAP stream rather than opening a packet socket in the GUI. Helper access now probes a protocol-zero socket, not just capability bits. | Wire-format, stream/process, parser tests pass. Rebuilt helper reports `net_raw=0 restricted=1` here without binding or capturing traffic. |
| C4, C5 | Enforce graph limits and reference integrity; expire detection windows after 30 seconds; bound distinct source/item tracking and reset per recording. | High-cardinality, expiry, reset and graph-consistency regressions pass. |
| C6 | Tutorial reuses CaptureWorkflow ownership, polls completion, closes old/unmounted sessions and late startup results. | Mounted repeated-recording and startup/unmount tests pass. |
| C7, C8, C10 | Independent bounded passive shutdown/final flush; terminal reader failures stop and reconcile ERROR; restart resets counters and time/rate baselines. DNS batch overflow no longer discards pending records. | Worker, final-persistence, restart and shutdown-ownership tests pass. STOPPING remains visible until unfinished teardown ends. |
| C9, C11, C12 | Nonblocking/no-follow descriptor-checked imports; declared packet/transport bounds, fragments and DNS/TCP framing; private exclusive capture storage. | FIFO/device/link, malformed-packet, permissions and no-overwrite regressions pass. |
| L1, L6, L7 | All six Labs commands offload state access/lock waits; adapter serializes polls/actions while Stop can cancel provisioning; URL opening releases locks and bounds/reaps launcher work. | Single-thread executor, deferred-poll, cancellation and real local process tests pass. |
| L2, L3, L8 | Preserve active room across Reset; repair discoverable Linux review artifact and routes; display actual runtime room identity after remount. | Controlled all-seven-room reset/rotation, mounted UI, and actual Python HTTP recovery/submission tests pass. |
| L4, L5, L9 | Reconcile owned target health; pin validated local daemon/default builder and clear BuildKit overrides; provide bounded owned loopback TCP ingress to port 9000 for console rooms. | Controlled Docker transport and protocol/forwarder tests pass; no real Docker claim. Docker Desktop/rootless/non-Linux ingress reports setup-required. |
| S2 | Atomic exclusive Downloads suffix selection, bounded content, invalid/platform-reserved names rejected, private writes. Disk writes now execute off the event executor. | Concurrent same-name/no-overwrite/link and permission tests pass. |
| S3 | OS entropy; private bounded atomic auth store; cross-process lock; reject links/nonregular/oversized/corrupt credentials; 600,000-iteration PBKDF2 with legacy login migration; auth work off event executor. | Independent password vectors, storage rejection/preservation/privacy/locking and full auth A–J regressions pass. This is not a formal cryptographic audit. |
| S4 — additional | A row-loop timeout could not interrupt SQLite work before its first row. Added SQLite VM progress interruption, SQL/value/column/expression limits, 8 MiB returned-text cap, and off-thread IPC execution. | In-memory recursive-query interruption, oversized allocation/column rejection, query-text limit and existing read-only integration tests pass. |
| T1 — additional | Ordinary service tests assumed existing open ports, used normal data, or conflated provider availability with offline regression. Use a real owned loopback listener with persisted read-back and isolate writes. External acceptance remains explicitly runnable and fails on unavailable prerequisites. Windows event-log test is no longer counted on Linux. | Local-service suite passes; separate external results below remain visible, including failures. No external response or live capture was synthesized. |

Main source locations beyond the capture/Labs modules are
`src-tauri/src/services/auth_service.rs`, `commands/auth.rs`, `commands/mod.rs`,
`commands/backend.rs`, `database/{sqlite,forensic_db}.rs`,
`services/query_validator.rs`, `tests/{auth_verify,live_services_verify,runtime_logs_verify}.rs`,
and `tests/support/mod.rs`. The existing exit hook now requests Labs shutdown
before other teardown and calls `shutdown()`, preventing late queued starts.

### Dependency and security review

- npm targeted updates: Vite **8.2.4**, moment **2.31.0**, nanoid **3.3.20**,
  source-map-js **1.2.2**, plus compatible Vite transitives. Final npm audit:
  **zero reported vulnerabilities**, not proof of absence of all defects.
- Rust targeted updates: quinn-proto **0.11.18**, rustls **0.23.46**,
  rustls-webpki **0.103.16**, webpki-roots **1.0.10**, Tokio **1.53.3**.
  Replaced yanked chacha20 **0.10.1** with **0.10.2**.
- The initial RustSec audit had **11 vulnerability entries**. The final audit
  has **zero vulnerability entries, seven unmaintained warnings, one unsound
  warning, no yanked warnings**. Strict `--deny warnings` remains **FAILED**.
  No advisory ignore list or warning suppression was added.
- Remaining unmaintained packages: paste 1.0.15, proc-macro-error 1.0.4,
  unic-char-property, unic-char-range, unic-common, unic-ucd-ident and
  unic-ucd-version (the latter five at 0.9.0).
- **glib 0.18.5 / RUSTSEC-2024-0429 is a real unresolved upstream unsoundness**,
  not a harmless maintenance notice. It concerns VariantStrIter pointer
  mutability; the advisory marks >=0.20 patched. The dependency tree ties 0.18
  to GTK/WebKit/Tauri. Adding an unrelated direct glib 0.20 would not replace
  those dependencies. No reachability/exploitability conclusion or safe
  backport is claimed; resolve through a verified compatible upstream change
  or a reviewed backport before security sign-off.
- RustSec database: official rustsec/advisory-db checkout at
  `84d943a6deeb8cc6c6f632531aaf4f1c62275239`, 1,351 advisories. JSON reports
  omit commit metadata in no-fetch mode; record this checkout explicitly.
  The built-in fetch timed out; a direct Git clone succeeded.
- cargo-audit, rustfmt and Clippy were installed only under ignored project
  `target/security-tools/` and `target/validation-toolchain/`; no new host or
  system-wide installation was performed in this repair run.
- Reviewed local auth/storage, download paths, read-only queries, Tauri
  capability/CSP boundaries, helper privilege separation, Docker command
  environment, and package maintainer scripts. This is a targeted review, not
  penetration testing, container-image scanning or a formal security assessment.

## Final available-worker verification

Execution date: October 24, 2026. The current worktree remains uncommitted and
contains preserved unrelated edits. Generated evidence is under ignored
`target/netoze-validation-2026-10-24/`.

| Check | Result | Evidence / limitation |
|---|---|---|
| `npm test` | **200 passed; 0 failed** plus **14 script tests passed** | `final-frontend.log`; includes the Windows PE import-table regression |
| `npm run lint` | **0 warnings; 0 errors** | `final-lint.log`, 137 files |
| `npm run build` | **passed** | `final-build.log`; largest emitted JS 398.99 kB; build completed without the earlier ineffective dynamic-import warning |
| `tsc -b` | **passed as part of build** | `final-build.log` |
| Rust `cargo check --all-targets --offline --locked` | **passed** | `final-cargo-check.log` |
| Rust library/helper/integration tests | **198 passed; 0 failed; 2 library Docker ignores plus explicit integration skips** | `final-rust-tests.log`; 184 lib, 1 helper, 13 integration passes; real capture/Docker/provider/host cases remain ignored |
| Focused SQLite query safety | **2 passed** | `forensic-safety.log`; VM interruption, SQL/value/column limits |
| Local service regressions | **6 passed; 4 explicit external/capture ignores** | `local-integration-regressions.log`; isolated storage and known local listener |
| Seven Python room suites | **17 passed; no ResourceWarnings** | `final-python.log` |
| npm audit | **0 vulnerabilities** | `final-npm-audit.json` |
| RustSec audit | **0 vulnerability entries; 7 unmaintained and 1 unsound warnings** | `final-rust-audit.json`; strict `--deny warnings` intentionally remains nonzero |
| `cargo fmt -- --check` | **failed** | `final-rustfmt.log`; existing/current Rust formatting differences remain |
| strict `cargo clippy --all-targets -- -D warnings` | **failed** | `final-clippy.log`; 44 current lint errors including test-module placement, API shape and style findings; no blanket allowances added |
| Linux helper/package | **built; staged; checksum verified** | DEB SHA-256 `1f1b5d4eea3047de4b608431916bb45baa20c9fd9b23cc173edab2a0640aa8e`; `final-linux-package.log`, `final-linux-checksums.log` |
| Isolated Linux native smoke | **passed** | `final-native-smoke.log`, `target/studio-ui-smoke/capture-workspace.png`; native window found and God's Eye/globe rendered; no capture/scan started |
| Windows cross package | **built; staged; PE import test passed; checksum verified** | NSIS SHA-256 `c3fde1ece216639ce240b2627e2450d091f6545556978221c9b7d933b51052c6`; `final-windows-loader-package.log`, `windows-loader-pe-test.log`, `final-windows-checksums.log` |
| Windows Npcap loader property | **fixed in source and cross-build-verified** | `/DELAYLOAD:wpcap.dll`; required exports are checked through absolute system/Npcap paths with restricted loader flags. No Windows execution. |
| live connectivity acceptance | **failed in worker** | Provider probe reported `All connectivity endpoints unreachable`; `external-connectivity-acceptance.log` |
| live threat-feed acceptance | **passed** | `external-threat-acceptance.log`; provider reachable in this run |
| live GeoIP acceptance | **failed in worker** | Public-IP provider unavailable; `external-geoip-acceptance.log`; local/private classification passes offline |

### Current readiness

**SOURCE-READY, not RUNTIME-VALIDATED or RELEASE-READY.** Source compilation,
frontend/native deterministic checks, local room tests, dependency vulnerability
patches, package generation, isolated Linux rendering, and Windows PE loader
properties are in good shape. This classification is deliberately below
release readiness because strict formatting/Clippy are not clean and the worker
cannot prove live capture, Docker lifecycle, installed Ryoku GUI flow, or
Windows runtime/WebView2/Npcap behavior.

### Acceptance commands still required on the appropriate hosts

Linux capture-capable host with the installed DEB helper and a disposable
fixture interface:

```sh
NETOZE_LIVE_CAPTURE=1 NETOZE_CAPTURE_ISOLATED=1 \
NETOZE_CAPTURE_INTERFACE=captest0 \
NETOZE_CAPTURE_LOCAL_IP=192.0.2.1 \
NETOZE_CAPTURE_PEER_IP=192.0.2.2 \
cargo test --manifest-path src-tauri/Cargo.toml --release \
  --test capture_verify --test capture_dns_verify -- --ignored --test-threads=1
```

Approved native Linux Docker >=28 host:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --release \
  --lib lab_runtime -- --include-ignored --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --release \
  --test lab_runtime_verify -- --include-ignored --test-threads=1
```

Installed Ryoku/Hyprland acceptance, performed by launching the freshly staged
DEB on the host (not this worker):

```text
Labs → Start Web Exposure → Open target → recover/submit flag
     → Reset → reject old flag → accept new flag → Stop
Capture Buddy → select interface → Start/observe → Stop
Watchtower/Overview → check truthful unavailable/loaded states
```

Windows native acceptance requires both an approved Npcap host and a no-Npcap
host, plus WebView2, startup, saved-file analysis, live capture permission,
upgrade/uninstall and unsigned SmartScreen checks. The ignored native tests are
listed in `src-tauri/tests/npcap_loader_verify.rs`. The cross-built installer is
not Windows execution evidence.

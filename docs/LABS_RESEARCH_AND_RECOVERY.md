# NET0ZE Labs: research, failure analysis, and resume plan

**Update: implementation resumed after this research snapshot.** See
`docs/LABS_BENCHMARK_AND_REMAKE.md` and the latest section of
`docs/NETOZE_HANDOFF.md` for the two functional room replacements, authorization
and holdout fixes, durable local checkpoints, live native DOM/process tests,
latest package hashes and still-unverified installed visual workflow. The paused
status, old catalogs and deployment hashes below are historical, not current.

Recorded 2026-10-07. Status: **user rejected current Labs; acceptance NOT met**.
Implementation is paused at the user's request. This is research and a handoff,
not a claim that Labs works. No app code, installation, or processes were changed
during this research pass.

## 1. Actual goal

Labs must be a main navigation destination, with separate Blue Team and Red Team
tracks. Starting a lab must provision a usable original environment and provide
a room link plus challenges that are solved by interacting with that environment.
The user explicitly rejects text cards, answer-copy quizzes, a generic page on a
port, and merged purple-team framing.

Requirements carried forward:
- Original NET0ZE scenarios, applications, branding, datasets, and challenges.
- Red labs: functional fictional applications/services with discoverable behavior
  and objectives verified from lab state, not simply matching generic phrases.
- Blue labs: actual telemetry workbench with searchable records, correlation,
  timeline construction, rule testing, and incident-response decisions.
- Separate tracks at one Labs destination; no Experimental placement.
- Start -> readiness -> URL -> environment -> objective proof -> completion ->
  reset/export must work through the normal installed application launcher.
- Earlier request: 10 Easy, 7 Medium, 3 Hard rooms. The replacement only has six
  labs per track; that is NOT an agreed replacement for the requested distribution.
  Before scaling, prove one complete room in each track. Clarify distribution
  between tracks later rather than silently reducing the requested total.
- Local owned environments only; no real-world targeting or host compromise.

## 2. Repository and deployment snapshot

Repository: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`
Branch: `master`; HEAD: `d0886b95a3fac48d31b3fc9d4d4b215d1f3ad3a4`.
Extensive modified and untracked work exists across the entire application.
Do not reset, clean, commit, remove, or overwrite unrelated work.
The Labs changes are uncommitted; no new commit or tag was created.

Observed during this research pass:
- PID 248186 was running `/usr/bin/netoze-desktop` (verified via `/proc`).
- Installed binary SHA-256:
  `9b827f4aee3ceb4b918cbddb1fca12ce8eafe74cc0ef5350c03f06199b52c447`.
- Latest built release binary SHA-256:
  `e2836f9ca341bf5b54d1a7d4018e50c5048e80d89877ae06809d562c5cb9ea2f`.
- Staged DEB SHA-256:
  `bb024af78c25f1b36d2587a56d072490be34784cb2079879776bd0fdceae65be`.
- DEB: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
- The earlier manually launched latest process is no longer the observed app.
  Opening the normal launcher is currently returning to a different build.
- All builds have version 2.0.0, so version alone cannot establish deployment.
  Record installed/running hashes or introduce a visible build revision.
- `docker`, `podman`, `qemu-system-x86_64`, `virt-manager`,
  `WebKitWebDriver`, and `tauri-driver` were not found on the current PATH.
  `geckodriver` is present. This is a PATH check, not a full host inventory.
- Cargo is available only through the prepared workspace toolchain.

## 3. Findings from source inspection

### Confirmed: current runtime is still a phrase quiz, not a lab environment

`src-tauri/src/services/lab_runtime.rs:88-118` generates twelve definitions using
the same three-step pattern. Blue answers two and three are always `contain
locally` and `document a detection gap`. Red answers two and three are always
`observation is bounded` and `recommend remediation`.
Artifacts are two summary strings that directly disclose answer wording.
There is no functional shop, tenant portal, document service, dataset explorer,
queryable event table, or scenario-specific service behavior.
The backend returns room pages and answer/hint/flag/reset/report endpoints;
these are a working HTTP quiz contract, not the requested operational room.

### Confirmed: desktop and web page maintain conflicting progress

`src/components/LabRuntimeWorkspace.tsx:12,49,52,67` uses an independent
`createTrackLabEngine` in memory. Browser answers update the Rust `Room` instead.
App answers/hints/export/reset do not call the browser runtime endpoints.
`Reset lab` only resets the app engine, not the running browser room.
Flags also differ: app derives an uppercase underscore token; native uses
`NET0ZE{<lab-id>-complete}`. Completion and reports are not shared.

### Confirmed: progress is ephemeral

Both the Rust room and React engines are in memory. Stopping/exiting clears
runtime state; component remounts replace React engines. There is no durable
run record or recovery strategy. A unique URL is a run locator, not persistence.

### Likely launch gap; requires installed-app reproduction

`LabRuntimeWorkspace.tsx:44,61` calls `window.open`, including after async IPC,
and never checks whether opening succeeded. The tests stub `window.open`, so
they cannot establish native WebKit opening or OS-browser behavior.
No explicit opener plugin was found in Cargo/lib registration during inspection.
Tauri documents its opener plugin for opening URLs in the default application.
Use a scoped native opener, validate against the active room URL, and surface
errors. Do NOT label the exact user failure proven until reproduced on the
installed application. Popup suppression is a hypothesis, not a confirmed cause.

### Confirmed: polling/reconciliation is insufficient

The UI fetches status on mount, then depends on local action updates. It does not
reconcile browser progress or continuously verify service health. Adapter
`activeRoom` is assigned before start succeeds and retained across stop/failure;
future status reconciliation can reject a different active room. Fix with a
backend-authoritative run identity and tested failure/remount transitions.

### Confirmed: passing tests do not prove the requested product

Native tests assert HTTP routes and submit the known generic phrases. UI tests
use mocked IPC and mocked browser opening. They do not test native launch -> real
browser JS execution -> environment interaction -> shared progress -> reset ->
normal launcher reopening. These tests are valid for the implemented quiz, but
their scope cannot justify 'full labs working' claims.

### Additional limitations

- Only one room can run at a time (explicit backend rule); present this honestly.
- Runtime uses a handwritten sequential HTTP server; long requests can delay all
  room requests, though reads have deadlines. Consider a maintained HTTP stack.
- Run IDs use timestamp/PID/counter, not a cryptographic session secret. A run ID
  must not be treated as strong authorization when more capabilities are added.
- Legacy rooms and the generic `purple_team` target are retained. They create
  competing entry points; hide/remove from the primary experience deliberately,
  not via an indiscriminate repository reset.
- Earlier reports overstated deployment and product completeness. Historical
  handoff entries below the latest status are history, not current acceptance.

## 4. Architecture research and recommendations (not implemented)

Separate the **control plane**, **challenge environment**, and **verifier**.
The desktop should manage lifecycle, scope, readiness, and run receipts; it should
not maintain a parallel quiz engine. The room browser consumes the same state
authority. One lab manifest defines both presentation and runtime identity.

### Runtime options

| Option | Suitable use | Limits / prerequisites |
| --- | --- | --- |
| Bundled unprivileged sidecar | Original multi-page app and telemetry workbench | Process isolation is not a strong security boundary; no arbitrary execution lab |
| Rootless containers | Multi-service app/database/event collector, disposable runs | Runtime absent on PATH; install/setup requires user/admin approval; shared kernel |
| Isolated VM | OS-level training and stronger boundary for higher-risk tasks | Virtualization/resources/images required; not currently available on PATH |

Recommendation: prove two original functional rooms first; use an explicitly
bounded bundled service for non-execution challenges, or approve a rootless
container prerequisite for multi-service environments. VM support is a separate
scope, not something to pretend a port-hosted page provides.

Container guardrails from official Docker guidance:
- Containerization is not an absolute sandbox; namespaces, cgroups, capabilities,
  host configuration, and kernel security all matter.
- Prefer non-root/rootless, drop unneeded capabilities, constrain CPU/memory/PIDs,
  use no-new-privileges, read-only base filesystems, and disposable per-run data.
- Never mount the Docker socket or host home/root into an exposed challenge app.
- Bind published endpoints explicitly to loopback; port publishing defaults can
  expose services to all host interfaces. Older Docker versions (<28) have a
  documented same-L2 localhost publication caveat.
- Loopback publication is not an outbound-network block. Verify egress policy,
  IPv4/IPv6 exposure, host reachability, and network separation independently.
- Control service must accept only known manifests/images/routes, not arbitrary
  commands, mounts, external URLs, or frontend-provided container arguments.

### Proposed first Red room: NET0ZE Dispatch Desk

Original fictional dispatch application with separate pages for workspace,
job listing, job details, shipment receipts, and audit history. Disposable seeded
database, lab-only identities, no real credentials, external integrations, or
host command execution. Challenges derive from actual records and server-side
state: map available functionality, demonstrate a bounded training-only access
policy discrepancy, record evidence, apply the provided fix, verify expected
behavior. A verifier checks object ownership/policy outcomes rather than phrase
answers. Keep scope restricted to this intentionally owned environment.

### Proposed first Blue room: NET0ZE Signal Bureau

Original defensive workbench with a realistic seeded event corpus and query/filter
controls, event detail, bookmarks, timeline builder, incident notes, rule editor
with fixed permitted operators, rule test results, and response-plan checklist.
Objectives require identifying records, assembling ordered events, and achieving
rule true/false-positive targets. Verify saved artifact IDs and computed results,
not copying a sentence from the briefing. Red and Blue remain separate tracks;
any shared datasets are explicit optional links, never forced merged rooms.

### State model

`idle -> provisioning -> ready -> active -> completed -> stopped`, with explicit
`failed` and `resetting` states. Persist run manifest version, immutable run ID,
track, challenge version, readiness result, checkpoints, attempts, hints, score,
artifact references, and sanitized error receipts. Both app and browser read this
authority. Reset creates/reseeds disposable environment state and clears exactly
the selected run. Stop must invalidate the URL and release all owned resources.
Flags should be derived from verified objectives, not publicly displayed answers
used as the sole evidence of completion.

### Ownership / originality

Use original source, visual assets, narrative, datasets, names, challenge wording,
and application structure. Maintain dependency license notices and a provenance
inventory. Referencing a general vulnerability category is different from copying
a training platform's expression. No guarantee of 'no copyright strike' is
possible; trademark and license issues are distinct. Obtain legal review before
commercial release where needed. No third-party challenge code was copied in
this research pass.

## 5. Sources read for this research

- Tauri opener plugin: https://v2.tauri.app/plugin/opener/
  Documents default-application URL opening, setup, and scoped permissions.
  Latest documentation currently states Rust >=1.90; verify compatibility with
  the repository toolchain/plugin version before selecting a dependency.
- Docker security: https://docs.docker.com/engine/security/
  Namespaces, resource controls, daemon exposure, capability and host-mount risks.
- Docker port publishing: https://docs.docker.com/engine/network/port-publishing/
  Explicit localhost binding, default exposure, routing and version caveats.
- U.S. Copyright Office FAQ:
  https://www.copyright.gov/help/faq/faq-protect.html
  Distinguishes ideas/methods from protected expression and trademark issues.
  Informational source, not jurisdiction-specific legal advice.

## 6. Verification receipt and limits

Working directory for all commands: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`.

Re-run during this research pass:
- `cargo test --manifest-path src-tauri/Cargo.toml --release --test lab_runtime_verify --test purple_team_verify`:
  **passed 5 runtime + 1 legacy target tests**, existing Rust warnings remain.
- `node --import tsx --test src/components/ScenarioLabs.test.ts`:
  **passed 14 tests**, mock-driven UI coverage only.
- `npx tsc -b --pretty false`: **passed**.
- `node --check src-tauri/src/services/lab_room.js`: **passed syntax check**.
- `git diff --check`: **passed** before documentation edits; rerun after writing.

Previously observed earlier in this conversation, not rerun as full suites here:
- `npm test`: 200 app + 5 script tests passed.
- `npx tauri build --bundles deb` and staging: passed.
- Lint: agent-reported pass with existing warnings; not independently rerun here.
- Native all-targets: not rerun after latest runtime; do not claim full pass.
- Browser room JS end-to-end and installed-app native launch: **NOT verified**.
- Two full usable environment playthroughs: **NOT implemented / NOT verified**.
- Current user report: nothing works; acceptance remains failed.

Prepared native environment (required before Cargo commands):
```sh
export CARGO_HOME="$PWD/target/native-tooling/netoze-toolchain/cargo"
export RUSTUP_HOME="$PWD/target/native-tooling/netoze-toolchain/rustup"
sysroot="$PWD/target/native-tooling/netoze-sysroot"
export PATH="$CARGO_HOME/bin:$sysroot/usr/bin:$PATH"
export PKG_CONFIG_SYSROOT_DIR="$sysroot"
export PKG_CONFIG_PATH="$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/share/pkgconfig"
export CARGO_BUILD_JOBS=1
```

## 7. Resume order and acceptance gates

1. Recheck installed/running/release hashes and reproduce Start room from the
   normal application launcher. Capture exact UI error, returned URL, native
   log, browser rendering, and response state without logging credentials.
2. Fix deployment/build identity and scoped native URL opening. An install
   requires OS approval; launching a workspace binary is NOT a system update.
3. Replace the parallel app/browser progression with one backend-authoritative
   run and a shared versioned manifest; add persistence/reset/status contracts.
4. Build ONE functional original Red room and ONE Blue workbench to the designs
   above. Agree runtime prerequisite if containers/VMs are required. Do not bulk
   generate another catalog of repetitive questions.
5. Verify native Start -> ready -> real browser -> interact with actual service ->
   objective proof -> shared app progress -> reset -> stop -> launcher reopen.
   Require a real rendered browser test, not only raw HTTP/mocked `window.open`.
6. Show the two working rooms for user acceptance, then expand to the requested
   difficulty distribution with meaningful changes in complexity and datasets.

Files to start with:
- `src/components/LabRuntimeWorkspace.tsx`: lifecycle, URL opening, parallel state.
- `src/services/tauri/labRuntime.ts`: IPC validation and active-room tracking.
- `src-tauri/src/services/lab_runtime.rs`: placeholder catalog and quiz runtime.
- `src-tauri/src/services/lab_room.{html,css,js}`: browser room presentation.
- `src-tauri/src/commands/lab_runtime.rs`, `src-tauri/src/lib.rs`: IPC/lifecycle.
- `src/lib/purpleLabs.ts`: legacy plus track catalog, duplicated content.
- `src/components/ScenarioLabs.tsx`: competing compatibility entry points.
- `src-tauri/tests/lab_runtime_verify.rs`, `src/components/ScenarioLabs.test.ts`:
  existing HTTP/mock checks; add real acceptance coverage instead of deleting them.
- `src/components/Sidebar.tsx`, `src/App.tsx`: main Labs route already present.

No delegated tasks remain pending. Do not restart, install, delete old labs,
provision environments, or change code until the user resumes implementation.

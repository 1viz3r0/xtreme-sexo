# NET0ZE install-to-use workflow

## Delivered scope (2026-10-04)

Linux local-monitoring working model: install, launch, and view actual host hardware, network counters, TCP sockets/process attribution, and accessible native logs. SQLite and backend logs initialize on first launch. The compiled UI is embedded: end users need no localhost server, Node, Rust, SDK or developer commands.

This is not a claim that every legacy feature is production complete. Windows runtime validation, live packet-capture validation, complete protocol support, and advanced investigation workflows remain release gates for those capabilities.

## Parallel implementation ownership

Three independent implementation agents used the account's available default model (runtime reported GPT 6 Astra). No alternative vendor/model was selected without availability evidence.

| Track | Responsibility | Delivered |
|---|---|---|
| Capture/flows | Capture session ownership, stop/restart, processing and persistence | Exclusive handles, timeout restart guard, nonblocking event sends, host capture without promiscuous mode, unsupported datalink rejection, cumulative flow snapshots |
| Native sources | Linux/Windows host observations, journal, devices | Structured bounded journal collection, timeout/error diagnostics, Linux addresses and ARP neighbors, removal of fabricated Windows services/paths/speed and unsupported JA4 reputation claims |
| Install readiness | Passive backend diagnostics and UI | Storage/schema access checks, native tool presence, library/interface enumeration distinguished from capture permission, expandable setup guidance |
| Integration owner | IPC contracts, package builds, tests and user workflow | Registered readiness, corrected diagnostics object shape, integrated readiness card, verified tests and Linux packages |

## User workflow

1. Install `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb` using the OS package manager. On Debian/Kali, from that folder: `sudo apt install ./NET0ZE_2.0.0_amd64.deb`. The package declares `libpcap0.8`, `libwebkit2gtk-4.1-0`, and `libgtk-3-0` dependencies. Administrator approval is entered in the OS, not the app.
2. Launch NET0ZE from the application menu. Host Activity is the default screen; local observations refresh every three seconds while it is open.
3. Expand Desktop readiness if data is unavailable. It checks actual storage access, native executable availability and capture enumeration. Enumeration alone never means capture permission was granted.
4. Enable API refresh if wanted. Connectivity refreshes every minute, public IP every ten minutes, and public threat feeds hourly while this screen remains mounted. Pause stops future polls; in-flight calls finish. API refresh is not currently a persistent background service.
5. In Global Intel, select an Ethernet-format interface and Start Live. Normal host traffic requires no Wi-Fi monitor mode. Capture permission is separate and may require OS configuration. Non-Ethernet datalinks (including Linux cooked `any`) are explicitly rejected until supported.
6. Use Network Engine for explicit private/loopback TCP checks and passive neighbor refresh. No automatic subnet or external-port scans run on installation.
7. Stop capture before closing when capturing. If stop times out, the previous worker must finish before restart can succeed.

Alternative: `NET0ZE_2.0.0_amd64.AppImage` is packaged in the same folder; make it executable and launch. FUSE restrictions can prevent mounted AppImage execution in containers. Latest AppImage creation is verified; mounted execution is not.

## Data and failure contract

- Real observations retain native timestamps and provenance where available.
- Unavailable journal access produces an explicitly labeled collector diagnostic, not a host event masquerading as evidence.
- Initial throughput is measuring, not synthetic traffic. Subsequent values use cumulative counters divided by measured elapsed time.
- Permission failures, unsupported capture formats and external errors are surfaced.
- Threat indicators are external intelligence, not proof of compromise. Only observed endpoint matches become matches.
- SQLite is the actual persistence engine; legacy modules named `duckdb` do not establish a DuckDB deployment.
- Tests use isolated data directories so fixture records are not installed as user observations.

## Release workflow

1. Contract gate: `node --test scripts/ipc-contract.test.mjs scripts/native-release.test.mjs`.
2. UI gate: `npm run build`.
3. Native gate: `cargo test --manifest-path src-tauri/Cargo.toml --release --lib -- --test-threads=1`, with isolated XDG_DATA_HOME. See BACKEND_GUIDE for project-local SDK environment.
4. Host observation check: opt-in `host_model_verify` integration test; no capture/scans.
5. API check: opt-in `backend_api_verify`; explicit requests to public providers only.
6. Package: `npm run dist:linux`; `-- --backend-only` reuses an already verified `dist/` bundle.
7. Inspect manifest/checksums, extract DEB into an isolated directory, launch with an empty data directory, verify initialization and continued process life. This is a startup smoke test, not an exhaustive UI interaction test.
8. Windows: use the Windows CI job/native machine with Npcap SDK and runtime, then verify actual startup and IPC on Windows before publishing as tested. Windows source paths are preserved; current release evidence is Linux-only.

CI in `.github/workflows/desktop-build.yml` includes frontend command parity, packaging tests, geography tests, isolated Linux unit tests and Windows/Linux build jobs. Workflow execution on a remote runner has not been claimed here.

## Verification receipts for this revision

- Frontend TypeScript/Vite build: passed; bundle-size/import warnings remain.
- Rust release library tests: 58 passed, 0 failed.
- IPC/release Node tests: 3 passed, 0 failed.
- Linux executable, DEB and AppImage: built and staged successfully; checksums in `releases/linux/2.0.0-x64/manifest.json`.
- Fresh extracted-DEB startup on the host display: alive after six seconds; intentionally terminated after the observation. SQLite initialized in a fresh isolated profile.
- An earlier Xvfb startup attempt returned 137 (killed), so it is not counted as passed. Host-display startup above was checked separately.
- Earlier working-model live API and host-read checks passed; live capture and Windows runtime have not been tested.

## Remaining work, in priority order

1. End-to-end native UI tests (including API pause/unmount, capture failure and database failure), actual install/upgrade/uninstall testing on clean Linux and Windows machines.
2. Permission-isolated capture helper and cooked/raw datalink support; idle-flow expiration and PCAP replay coverage.
3. Persisted configurable enrichment coordinator with provider backoff, budget limits, data-age metadata and lifecycle independent of mounted screens.
4. Durable detections/rules, historical flow queries, explicit evidence-linked storylines, schema migrations and retention policy.
5. Optional vulnerability intelligence and external analyzer integrations only after each source and UI contract is tested.

Each feature ships only when its native command, source data, UI failure state and installed-artifact test are connected. Empty panels are not populated with generated records.

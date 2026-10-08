# NET0ZE backend activity logbook

Timezone: **Asia/Kolkata — Indian Standard Time (UTC+05:30)**.
Entries record observed work, outcomes and blockers. Earlier actions whose exact
execution time was not recorded are summarized under their recording time.
Runtime backend logs are separate files in the application's local `logs/` folder.

## 2026-10-07 — Labs benchmark fixes and durable checkpoint resume

Implementation resumed on explicit user request. Inventoried both functional
rooms and legacy static catalogs; compared public official PortSwigger,
TryHackMe, Juice Shop, BTLO and VulnHub sources. Results saved in
`docs/LABS_BENCHMARK_AND_REMAKE.md`; no claim to have played all online rooms.

Fixed Red state/report authorization disclosure, added private Blue holdout
verification, bounded browser failure/reconciliation behavior, CSV evidence,
workflow guidance and debriefs. Added bounded schema-versioned local training
action journals and resume UI/storage warnings; both browser/native actions
share checkpointing. Stop retains healthy checkpoint; reset persists reseed.

Main verification: 206 app + 13 script tests, 8 native room + 10 persistence +
1 legacy regression passed; typecheck/build/lint/diff passed with unrelated
existing warnings. Happy DOM with real Rust service completed both rooms;
separate native processes completed/resumed/reset/restarted both successfully.
No rendered-browser or packaged-app restart acceptance claimed.

DEB rebuilt/staged. Installed binary hash still differs; OS-admin installation
remains pending. No user processes restarted, no repository commit/reset/clean.
Latest hashes and next steps are in `docs/NETOZE_HANDOFF.md`.

## 2026-10-07 — Labs research and implementation pause

User rejected the current Labs experience and requested research plus saved
state. Source inspection confirms repetitive phrase-based rooms, disconnected
app/browser progress, ephemeral state, and an installed/release hash mismatch.
Native browser launching remains unverified; mocked tests cannot prove it.

Saved findings and source references in `docs/LABS_RESEARCH_AND_RECOVERY.md`.
Reran runtime HTTP tests (5), legacy target test (1), ScenarioLabs mocked UI tests
(14), typecheck and room JS syntax check: passed within those limited scopes.
No real end-to-end environment playthrough established. No code changes,
installation, process restart, repository reset or commit in this research pass.
Future work must prove a functional Red room and Blue workbench, not another
static catalog. Full details and reproducible commands are in the research file.

## 2026-10-05 — monitoring, reliability and operational logs

### Scan Buddy content inspection

Added bounded `http-preview` to the existing manual connect/HTTP HEAD/SSH banner
inspection path. It returns sanitized response headers and a capped content
preview for `GET /` only, with no redirects/auth/cookies/scripts/DNS/arbitrary
paths. OS stays unverified. Fixed the missing Rust match arm and timing-sensitive
oversized-response test fixture.

Validation: 181 frontend + 5 script tests; typecheck/build/lint/diff pass; native
inspection 7/7, all-targets pass with external API/host-journal intentionally
ignored, live-services 10/10. DEB rebuilt/staged; no real scan initiated.

### PurpleLabs 20-room challenge catalog

Reorganized Practice Rooms into the primary guided challenge workspace. The
catalog is exactly 10 Easy, 7 Medium, and 3 Hard rooms. Rooms include ordered
synthetic evidence tasks, challenge questions, progressive hints, scoring and
penalties, fictional flag submission, completion debrief/remediation, reset,
bounded replay, and exportable reports. Individual labs and combined exercises
remain secondary views. No room invokes live network, capture, exploit, upload,
credential, or external scan behavior.

Validation: PurpleLabs engine 54/54, ScenarioLabs UI 7/7, full frontend 190/190,
typecheck/build pass, lint completed with existing warnings, and DEB rebuilt and
staged.

### Labs promoted with separate Blue Team and Red Team tracks

Promoted Labs to the main navigation and removed the Experimental framing.
Added separate runnable Blue Team and Red Team catalogs, six labs per track,
with independent engines and evidence namespaces. Blue Team exercises focus on
synthetic alert/log/timeline investigation, containment and detection. Red Team
exercises focus on fictional local-only target reconnaissance, validation and
remediation. Content is original and does not copy branded training platforms.

Validation: full frontend 196/196, targeted track/UI 72/72, typecheck/build and
diff checks passed; lint passed with existing warnings. Safety boundaries remain
static/local-only with no live target, exploit, credential, upload or external
scan behavior.

### Advanced Scan Buddy — bounded inspection build

Added Conservative/Balanced/Intensive TCP profiles and explicit manual built-in
inspection checks (connect, HTTP HEAD, passive SSH banner) for selected OPEN
results. All actions require fresh authorization and remain bounded; no arbitrary
scripts, exploit/Nmap aggressive modes, authentication, DNS/UDP/raw packets or
OS fingerprint claims. Fixed the oversized response fixture timing assertion.

Validation: 181 frontend + 5 script tests; typecheck/build/lint/diff pass; native
all-targets 114 pass, including scan inspection 6/6 and live-services 10/10.
External API and unavailable host journal remain intentionally ignored. DEB
rebuilt/staged; no real network scan initiated.

### Local loopback PurpleLabs target

Added a dependency-free loopback-only local target with bounded HTTP training
routes, explicit lifecycle IPC, safe synthetic evidence and cleanup. Scenario Labs
can start/stop/status/refresh this target without LAN exposure, credentials,
downloads, exploits, scans, captures or uploads. Fixed the frontend adapter to
call the registered `purple_team_*` commands and map native evidence correctly.

Validation: 181 frontend + 5 script tests, typecheck/build/lint/diff pass; native
`purple_team_verify` lifecycle test pass; DEB rebuilt and smoke passed.

### Deep black-box / white-box verification

Deep audit fixed Capture Buddy investigation semaphore double-acquisition and
bounded port-scan input before de-duplication. White-box: 180 frontend + 5
script tests; geography/release/typecheck/build/lint/diff pass. Native all-targets
passed library/helper, auth, capture/DNS, runtime logs and live-services 10/10.
Black-box native smoke/navigation verified Dashboard, Watchtower, Overview/globe,
Capture, Scan and PurpleLabs room surfaces; no capture/scan/upload/privileged
action. External API and host-journal checks remain intentionally unavailable or
ignored. Logs under `target/deep-final-*` and `target/all-final-*`.

### PurpleLabs full verification

Complete current room build validation passed: 180 frontend + 5 script tests,
geography/release, typecheck/build/lint/diff; native all-targets passed library,
helper, auth, capture/DNS, runtime-log and live-services 10/10 checks. External
API and unavailable host-journal tests remain intentionally ignored.

Old deleted process was closed normally and current installed binary relaunched as
PID 107154. Running/installed SHA-256:
`97abec1e20d6b5a7be3f4c08cf77f36fe2133cc58346c096b8ee47e98dedd9c2`. Receipt:
`target/all-final-installed-receipt.json`. No capture or scan started.

### PurpleLabs room practice mode

Added THM/HTB-style local practice rooms over the ten individual and eight
combined synthetic exercises: briefing, rules, ordered task progression,
synthetic evidence, challenge answers, progressive hints, scoring, debrief,
remediation, reset/replay and report export. Existing lab modes remain. No live
network, exploit, credential, capture, upload or real scan behavior was added.

Validation: 180 frontend + 5 script tests, typecheck/build/lint/diff pass;
existing unrelated lint warnings remain.

### Combined purple-team labs

Scenario Labs expanded with eight combined exercises across the ten synthetic
labs. Combinations support ordered stages, cross-stage evidence, partial/validated
outcomes, bounded replay/reset, evidence links and local report export. Individual
labs remain available. No live network, exploit, credential, capture, upload or
backend integration was added.

Validation: 140 frontend + 5 script tests; typecheck/build/lint/diff pass. Existing
lint warnings remain; no new errors.

### Regression recovery pass

Fixed `LIVE` capture state handling in Overview and ensured SQLite read/write
connections run schema initialization, restoring audit-chain reliability and
correct app-config database paths. Updated live test expectations to the explicit
local GeoIP classification and added no-CAP_NET_RAW skip behavior for packet
tests. No privilege escalation, automatic scan, upload or capture was added.

Frontend 128 + 5 script tests, geo/release, typecheck/build/lint/diff pass.
Native all-targets passed safe/live-services checks (10/10); runtime logs passed
with required isolated test data. New DEB hash:
`6ef02053a48343f7da6cf3299f62e4f7e38f9dcbb4bca56ef2453c43a7e71317`.
AppImage packaging timed out and is not claimed. Native smoke passed without
capture/scan.

### Globe pixel-burst fix installation verified

Saved globe fix installed successfully. Package and installed binary match SHA-256
`206321d9c31df62face9bee4c870265a82d9a7599c834f326754640012d67a48`.
Updated app launched as PID 243110 and remained alive after 12 seconds. Receipt:
`target/asap-globe-installed-receipt.json`. No capture or scan started.

### Globe pixel-burst fix — saved

Extreme zoom was pushing the 2048px country texture beyond useful resolution.
Closest camera distance is now bounded at 1.85; texture is 3072×1536 with
mipmaps/linear filtering/capped anisotropy. Tiny markers, hover labels, zoom
stages and monochrome styling remain unchanged. No backend/data behavior changed.

Full frontend/script tests, typecheck/build/lint/diff pass; Globe3D tests 8/8;
packages rebuilt/hash-verified; smoke passed without capture/scan. Latest hashes
are recorded in the handoff. Source state saved; system installation still needs
the new DEB authentication step.

### Globe clutter fix installation verified

Corrected globe clutter and primary Overview build installed successfully. Package
and installed binary match SHA-256 `8c20ee50989b4cbc48e474c9ed1dec368387e1913c7c78898678bdf9482649b1`.
Updated app launched as PID 220057 and remained alive after 12 seconds. Receipt:
`target/overview-globe-clean-installed-receipt.json`. No capture or scan started.

### Overview promoted and globe clutter removed

Overview moved into primary Monitoring navigation; Evidence and Graph remain
Experimental pending separate verification. Persistent region/city text sprites
were removed from the globe. Only tiny bounded dots and invisible hover targets
remain, with a single contextual tooltip. Country outlines and continuous zoom
are preserved; unavailable API/source states remain explicit.

122 frontend + 5 script tests, typecheck/build/lint/diff pass. DEB/AppImage
rebuilt and hashes verified:
`ae8f485dcc7d7660295c0f1f95e49993dd52cc72dd03e78a2c2dbab5331d1de8`,
`00a1997df57da96b8f4f81cfb04f5353ce368230d8b0c360beb485ab0487567e`.

### Neutral globe labels build installation verified

Globe deep-label and neutral-Overview DEB installed successfully. Package and
installed binary match SHA-256 `1ef15f50c135632606262a869a7b37ce123da8b8371e35da485d370412431925`.
Updated app launched as PID 201634 and remained alive after 12 seconds. Receipt:
`target/neutral-globe-installed-receipt.json`. No capture or scan started.

### Globe deep labels and neutral Overview

Added bounded decluttered white/gray region and city/capital labels at deeper
zoom while keeping visible dots tiny and hover hit targets separate. Country
names stay hover-only at world zoom. Removed purple/violet styling from Overview
and Endpoint map controls; neutral black/white/gray replaces it.

Full tests/typecheck/build/lint/diff pass; DEB/AppImage rebuilt and hashes
verified; native smoke passed without capture/scan. Latest package hashes are
recorded in the handoff entry above.

### Final globe quality build installation verified

Final globe quality DEB installed successfully. Package and installed binary
match SHA-256 `3dbbea14cefd38d965abfe92ccbad1f6cc1278e574c523f022494080f0fb1a3d`.
Updated app launched as PID 181945 and remained alive after 12 seconds. Receipt:
`target/globe-final-installed-receipt.json`. No capture or scan started.

### Globe quality correction

Oversized dots, difficult labels and pixel bursting were addressed. Geography now
uses tiny visible markers plus larger invisible hover hit targets, front-surface
raycast precedence, country fallback labels at all zooms, and region/city hover
labels at deeper stages. Renderer uses antialiasing, DPR max 1.25, lower geometry,
linear/mipmap filtering and capped anisotropy. Globe remains monochrome.

Research used official Google Maps, Mapbox, Apple MapKit and Three.js guidance for
zoom-dependent detail, label decluttering/interaction and rendering tradeoffs.
No town data is invented. Full tests/typecheck/build/lint/diff pass; packages and
hashes verified; native smoke passed without capture/scan.

### Monochrome globe build installation verified

Latest globe hover-label DEB installed successfully. Package and installed binary
match SHA-256 `71e9c95298f26bfff82c6d0006b63dc8895e40f68c349effdc7e949daae3c04b`.
Updated app launched as PID 162001 and remained alive after 12 seconds. Receipt:
`target/globe-monochrome-installed-receipt.json`. No capture or scan started.

### Globe monochrome hover labels

Removed purple/cyan globe UI accents and always-visible geography text. Country
names now appear on country hover at world level; closer zoom reveals bundled
regions, then city/capital markers and hover details. Same globe remains active;
country selection is an overlay. No town data is invented.

Design research used Google Maps zoom-level customization and Apple MapKit
annotations/overlays as references for progressive detail disclosure. Validation:
122 frontend + 5 script tests, typecheck/build/lint/diff pass; DEB/AppImage
rebuilt, hashes verified, and native smoke passed without capture/scan.

### Globe zoom build installation verified

Globe zoom/context geography DEB installed successfully. Package and installed
binary match SHA-256 `8c98820f96a26c301431e3d14a9e70ea3ce783123ea2c4f0a2d0853f2cfaa9e9`.
Updated app relaunched as PID 148508 and remained alive after 12 seconds. Receipt:
`target/globe-zoom-installed-receipt.json`. No capture or scan started.

### Purple-team Overview installation verified

Latest DEB installed successfully; package and `/usr/bin/netoze-desktop` match
SHA-256 `3f848a33754fffb2094afbf14d0b094af44cef526680e5ee9785281e3b64f2f3`.
Updated app launched as PID 131447 and remained alive after 12 seconds. Receipt:
`target/purple-overview-installed-receipt.json`. No capture or scan started.

### Purple-team Overview and automatic inventory

Overview now leads with host/resources, passive local network identity,
current-session flows/findings/capture metrics, cached devices, source freshness
and concise navigation. Endpoint map and Findings remain below; verbose status is
collapsed. No ATT&amp;CK/security coverage score is invented from counts.

Watchtower automatic inventory and strict unavailable/error handling are retained.
Design research used MITRE's Adversary Emulation Library (repeatable authorized
behavior tests and telemetry evidence) and CISA/ASD event-logging guidance
(visibility and source context). No automatic attack execution, scanning, upload or
privilege escalation was added.

115 frontend + 5 script tests, typecheck/build/lint/diff pass. DEB/AppImage rebuilt
and hashes verified:
`4b02a4bf2dac0950646571c4499f213a0beb2f15ebdacbf9cd4ee92ba9cede5a`,
`7d3c85c335f18e8983eec8b8248a0609abc6fd3880ab2d18e41438b446897c32`.

### Watchtower automatic inventory and coverage fix

Local interfaces and existing neighbor records now load automatically on view
open and refresh on visibility; buttons are optional retries. Coverage includes
flows, findings, graph, interfaces and neighbors, with per-source counts and
clear zero/not-loaded/unavailable states. Passive local reads only; no scan,
probe, upload, inference or privilege request.

110 frontend + 5 script tests, typecheck/build/lint/diff pass. DEB/AppImage
rebuilt and hashes verified: `324e2e600f6809089167ddeaac48653f7061f6ffa0d7ce5458d3c425cace57c3`,
`6967a9f80b3f433dd3a49f0c9c03ce8407952b2d5764b4557d0bd4d9cfa85d30`.

### Watchtower empty-state fix

Screenshot review found the inventory panels were empty until manual buttons were
pressed. Added a single bounded passive interface/device read on view mount,
manual retries, loading/unavailable states and stale/unmount guards. This uses
existing local sources only; no scan, probe, upload, inferred detail or admin
request was added.

Full frontend/script tests, typecheck, build, lint and diff pass. Linux packages
rebuilt/staged and manifest-verified; screenshot smoke passed without capture or
scan. Receipts under `target/watchtower-runtime-*`.

### Futuristic Dashboard installation verified

The updated DEB was authenticated and installed. Package and installed binary
match SHA-256 `b814612fcd3771c0ff2c3b7341e706a12e7232702d2bb4eb184606e31f0f8eb1`.
Old PID 63132 was a deleted older executable and exited normally; new Dashboard
reopened as PID 80842 and remained alive after 12 seconds. Receipt:
`target/dashboard-installed-receipt.json`. No capture or scan started.

### Dashboard rename and network visibility

User screenshot confirmed the visible app was still the old installed build. The
current source/staged build renames primary `Host & Logs` navigation to
**Dashboard** and puts host/system facts first: hostname, OS/architecture,
CPU/RAM, privilege, interface count, local IP, MAC, primary interface and active
connected-device count. Logs, TCP, runtime, readiness, reports and native events
are moved to the bottom `Logs & diagnostics` section. Existing native sources and
truth boundaries remain unchanged.

Full frontend/script tests, typecheck, build, lint and diff pass. DEB/AppImage
rebuilt and hashes verified: `25e8c0ad956770d17b4cca913b37f8cfe9750ec961eae6fbb9cf51894766eee4`,
`244c4e4019684957145ccbe5358b1ce412e06416ab7ade04674050c30592bfdb`.
Installed binary has not yet been replaced; installation requires admin auth.

### Host dashboard and logs layout

Redesigned Host &amp; Logs into a dashboard-first view. Key host identity,
platform, privilege, resource counts, system details, readiness, live sources,
report and interface-speed information appear above the fold; Runtime Logs, TCP
connections and native event tables are moved into the bottom Detailed Logs
section. No data source, refresh behavior, permission boundary or telemetry
claim changed.

Validation: 110 frontend + 5 script tests, typecheck, build, lint and diff pass;
lint has 0 errors and 10 existing warnings. Linux packages rebuilt and hashes
verified; native screenshot smoke passed with no capture/scan. Logs are in
`target/host-dashboard-*.log`.

### Watchtower visual polish

Kept the black/charcoal theme and tightened the Watchtower layout: compact hero,
coverage cards, recent signals, host interfaces, same-network neighbors,
responsive table treatment and concise limitation text. Removed redundant copy
without removing provenance, authorization, or unverified-service boundaries.
No backend, polling, scan, upload, or privilege behavior changed.

Full frontend/script tests, TypeScript, build and diff checks pass; lint remains
0 errors with 10 existing warnings. Receipts under `target/watchtower-polish-*`.

### Watchtower local network inventory

Added user-triggered local interface and neighbor inventory to Watchtower. Host
addresses, MAC/link state and same-network IP/MAC/hostname/vendor/seen metadata
come only from existing native local sources. No automatic discovery, CIDR
inference, upload, password or privilege escalation. Full port/service detail is
still only from an explicit authorized Scan Buddy job and remains unverified.

Watchtower tests 4/4; full frontend + script tests 107 + 5 pass; typecheck,
build, lint (0 errors/10 existing warnings), diff and screenshot smoke pass.
DEB/AppImage rebuilt and hashes verified:
`596bb1b0731b2d0a4c197e3cc89ef5d0f5c2ff1c666a7f140d15ff573bcd42cc` and
`d93d5ab22ca44592a434f21db68bfa89cedcfe7e0ed3715e31edb5c4208891f0`.
No capture or scan started; updated package remains staged, not system-installed.

### Native test harness continuation

Added explicit Linux `CAP_NET_RAW` prechecks to `capture_verify` and
`capture_dns_verify`; unavailable privilege now produces a truthful SKIP before
packet-socket creation, without password escalation. Native compile, library,
helper and safe integration tests pass. The full live-services sweep remains
non-green for documented environment/contract reasons: live packet parsing needs
CAP_NET_RAW, audit CRUD requires initialized test DB state, and one private-GeoIP
assertion expects `local` while the current implementation intentionally returns
`local-classification`. No capture, scan or external API verification was run by
the agent.

### Full stop, rerun and verification

Stopped the running desktop process normally and reran the full available suite.
Frontend: 107 + 5 script tests pass; typecheck/build pass; lint has 0 errors and
10 existing warnings; diff check passes. Native lib/helper: 105 + 1 pass. Auth
and runtime-log integration checks pass when runtime logs use their required
isolated test-data directory. Live capture integration tests fail closed in this
environment because opening a packet socket needs `CAP_NET_RAW`; no password or
privilege escalation was requested. A concurrent ephemeral-port assertion was
rerun focused and single-threaded successfully. External API test remains ignored.

DEB/AppImage rebuilt, staged and manifest hashes independently verified:
`a5a308b3a29637dfea21e7508344e7e7a21e2f3923f850e2b9596b8b5f54be91` and
`d898358f570bac2ccdd78f9833b5ee91ec738974fbafad24875a67d7463d2a35`.
Native screenshot smoke passed without capture/scan: `target/studio-ui-smoke/`.
Receipts/logs: `target/final-rerun-*.log`. No data deletion or network scan ran.

### Watchtower local observation dashboard

Added a black/charcoal **Watchtower** view as the first Monitoring item. It is a
truthful bounded snapshot of currently loaded flows, detection findings and graph
records: coverage and record metrics plus at most five recent signals. It does
not claim omniscience, make threat verdicts, scan, upload, poll independently or
use administrator privileges. Capture Buddy remains the default view.

Validation: 107 frontend/mounted + 5 script tests pass; build/typecheck pass;
lint 0 errors/10 existing warnings; diff check pass. DEB/AppImage rebuilt and
manifest hashes verified. Screenshot smoke passed with no capture/scan started.
No password was requested for the source/build/test work. New packaged system
installation was not attempted; the existing installed black build was left
available.

### Black UI refresh and final installation

User requested the blue UI be removed. Studio shell, header/sidebar and the
Capture/Investigation/Scan Buddy workspace surfaces are now black/charcoal with
neutral gray/white accents. The isolated native screenshot visibly confirms the
change: `target/studio-ui-smoke/capture-workspace.png`.

Validation: 105 frontend/mounted + 5 script tests pass; build pass; lint 0 errors
and 10 existing warnings; targeted typecheck/lint pass; diff check pass. Linux
DEB/AppImage rebuilt and staged with manifest verification. Correct DEB installed;
package status is `install ok installed`; package and `/usr/bin/netoze-desktop`
match SHA-256 `9df6f5f0343d5214351e047e70377591e9af86e99680cd1fdcbef081660630d2`.
Old PID 36873 exited normally and black build reopened as PID 51371. Receipt:
`target/black-ui-installed-receipt.json`. No agent-started capture/scan.

Standalone Cargo lib tests could not run because the environment lacks the system
`gobject-2.0 >= 2.70` pkg-config metadata; this is recorded as an environment
gap, not a passing native-test claim. Release packaging did compile successfully.

### Final Studio UI install verification

The initial installer invocation used the wrong workspace path and exited 2. The
correct DEB was then installed from `releases/linux/2.0.0-x64`; package status is
`install ok installed`. Extracted package executable and `/usr/bin/netoze-desktop`
match SHA-256 `adbc40269b23962989d09ac012fb8f5a6d2f76258e9f0385ae69b4b988e5766f`.
Old PID 9528 was `/usr/bin/netoze-desktop (deleted)` and exited normally; updated
app reopened as PID 36873 and remained alive after 10 seconds. Receipt:
`target/studio-ui-installed-receipt.json`. No capture/scan started; native visual
click/export behavior still not independently verified.

### Studio UI — visible shell and workspace redesign

User still could not see a sufficiently new UI and requested clear visible change
and less unwanted text. Prior installed binary checks were correct, but visual
acceptance had not been exercised. This phase makes a substantial visible shell
and workspace change, not just panel reordering.

- `TopNavbar.tsx`, `BrandLogo.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`: single
  header replacing the double-row host/driver strip, no ticking clock, original
  brand retained, compact runtime badge and identifiable Studio UI marker.
  Readable Monitoring navigation, stronger active styling, collapsed Experimental
  group, scoped navy Studio shell/card CSS and responsive controls. Capture Buddy
  is the initial view so the redesign is visible after reopening. Search/auth/
  role/navigation callbacks preserved. No fabricated live-health statuses.
- `CaptureBuddy.tsx`, `CaptureInvestigation.tsx`, `ScanBuddy.tsx`: compact new
  prominent stage/navigation bars, recording controls accessible, investigation
  top-first, short empty state, collapsible technical/long guidance. Redundant
  descriptions removed; authorization, data privacy, limits and evidence caveats
  retained. Existing tabs/search/bookmarks/evidence links/exports/lifecycle remain.
- New `AppShell.test.ts` and adapted mounted workspace tests validate shell marker,
  default capture view, navigation/auth callbacks, concise copy and evidence flow.
- `npm test`: **104 frontend/mounted + 5 script PASS**. Build and TypeScript pass;
  lint zero errors/ten existing warnings; diff check passes. Receipts:
  `target/studio-ui-tests.log`, `target/studio-ui-build.log`,
  `target/studio-ui-lint.log`. No claim of measured end-to-end performance speedup.
- `npm run dist:linux` underway `target/studio-ui-linux-build.log`.
  New `scripts/studio-ui-smoke.py` prepares an isolated extracted-DEB X11/Xvfb
  screenshot check with separate XDG data. It does not drive existing app, capture
  or scan. Rendered visual inspection/package install awaits build completion.

### Top-first Capture Buddy UI refresh

Completion: Linux rebuild **PASS**. DEB/AppImage hashes independently verified:
`a54b12c1c2e570e58ae151d3f8e43d9db4e15d6ce1edd66ac39aa2e2eedca4aa` and
`f76c7fd8023de6520bdc8b16baf7e581e70b8fde65274badacf8aa776897a4d7`.
User reported no visible changes; confirmed old installed/running binary rather
than assuming a frontend bug. Opened OS-authenticated installer; installation
verified via package status and executable hash matching extracted DEB.
Old PID 86966 confirmed deleted older executable; no capture helper running.
Closed normally and reopened updated installed app PID 91154, alive after 12s,
running SHA-256 `08d57489d9992a64d6abcbf0acf51b6014745e6f29a5ed988d63a03afc46dd7d`.
Receipt `target/capture-ui-refresh-installed/receipt.json`; capability intact,
no new scan/capture/data deletion. Native visual interactions not independently
verified. Latest top-first UI is now installed and loaded, not only staged.

User requested additional useful controls, latest features at the top, no numbered
headings and a clean responsive layout. Implemented focused UI/lifecycle changes:

- `CaptureBuddy.tsx`: investigation workspace immediately after header; packet
  evidence near the top with instant scroll; compact source/search/table; brief
  collapsible near top, duplicate bottom panels removed. Packet evidence links
  now invoke native packet detail even for off-page packets, with stale result
  ownership guards. Existing original-byte inspection/capture/save remain.
- `CaptureInvestigation.tsx`: top summary/search/export toolbar, named Conversations/
  Timeline/Review tabs rendering only the active section, 50-row pages, newest-first
  timeline sort, most-bytes/packets conversation sort, metadata search and temporary
  packet bookmarks (max100). No numbered headings; actual measurement/packet ids
  preserved. No automatic model generation or new background polling.
- Child lifecycle repaired for StrictMode and session replacement; synchronous
  request gate, scoped generations, stale responses ignored, session filters/
  bookmarks/data reset. Projections memoized; bounded rendering is not a measured
  whole-app latency guarantee.
- Presentation exports escape Markdown, preserve null/unknown metadata, disclose
  filtered/truncated metadata-only bundle limits, append download anchors and
  defer URL cleanup. Typed IPC validation matches real native nullable DTO and
  bounds; deadline covers import. No fabricated confidence or payload export.
- Scan Buddy headings now Scope/Preview/Start without enumerated numbers; explicit
  blocking reason remains. Corresponding tests updated; first test rerun caught
  the old numbered-title assertion, fixed and rerun successfully.
- New mounted UI tests exercise top placement, off-page native evidence selection,
  session/stale detail ownership, active-tab rendering, metadata search, temporary
  bookmarks, StrictMode and late model response isolation.
- `npm test`: **101 frontend/mounted + 5 script PASS**;
  `target/capture-ui-refresh-tests.log`. Build passes:
  `target/capture-ui-refresh-build.log`. Lint zero errors/ten existing warnings:
  `target/capture-ui-refresh-lint.log`. `git diff --check` passes.
- Native engine unchanged; native tests not rerun in this UI-only phase. Linux
  package rebuild underway: `target/capture-ui-refresh-linux.log`. Installed app
  not yet updated; native click/download/GPU behavior not manually verified.
- No capture, scan, upload, user-data deletion or permission changes performed.

### Capture Investigation board — 2026-10-05

Installation on user request verified: `dpkg-query` reports `install ok installed`;
installed executable independently matches the staged DEB extraction, SHA-256
`f579131113438cf30913ae15d195fc595152c554dccb30b9044d0220b9a24513`.
Capture helper retains `cap_net_raw=ep`. Existing running application was not
terminated; reopen NET0ZE to load the installed update. Installation does not
verify investigation clicks/exports or change the outstanding native test gaps.

Continuation: added a user-triggered **Save case bundle** action. The versioned
`netoze.capture-investigation.v1` JSON includes UTC generation time, evidence-only
flag, explicit `source_bytes_included=false`, limitations and the bounded filtered
board projection. Raw PCAP/PCAPNG bytes are excluded; no upload/overwrite occurs.

- Case-bundle rerun: **98 frontend/render + 5 script PASS**; build pass; lint zero
  errors/ten existing warnings; diff check pass. Receipts:
  `target/case-bundle-tests.log`, `target/case-bundle-build.log`,
  `target/case-bundle-lint.log`.
- Investigation Linux package completed/staged. Manifest generated
  `2026-10-05T18:32:40.987Z`. DEB 11047668 bytes SHA-256
  `e6d1fd9c6d9119f50715a6a5f03e1d2bfa7700313d22308703dae78a5b5e56bc`;
  AppImage 115857912 bytes SHA-256
  `37a6c6b098e900d2a77cc05812b93bb9b1494300f98a6beb5c71cb9157a64dab`.
  Both independently match the staged manifest.

Implemented the next distinct Capture Buddy layer above packet inspection:

- New native `capture_investigation.rs` creates bounded `InvestigationModel`
  projections from decoded packets: up to 100 endpoint conversations, 500 timeline
  events and 100 explainable anomalies. Conversations carry packet-number evidence
  links, time/byte/packet counts and protocol. Timeline kinds are DNS/TLS/HTTP/
  CONNECTION/ERROR/OTHER. Anomalies are observed metadata only (large frame,
  missing timestamp, decode warning, TCP payload), with reason, severity,
  confidence and evidence packet numbers. No payload/decryption/network/threat
  verdict is added.
- New `capture_investigation.rs` command module and `buddy_investigation_model`
  IPC reuse the existing decoded Capture Buddy source. No duplicate reader or
  capture lifecycle was introduced.
- New `CaptureInvestigation.tsx`, typed adapter and presentation tests provide an
  on-demand native-only Conversation Board, Evidence Timeline, Explainable Anomaly
  Queue, filters, packet links and bounded JSON/Markdown exports. Mounted inside
  an active Capture Buddy session. Browser mode never fabricates data.
- Native verification: **105 library + 1 helper tests pass**;
  `target/capture-investigation-native.log`.
- Frontend verification after correcting nullable native timestamps and textual
  confidence: **98 frontend/render + 5 script tests pass**;
  `target/capture-investigation-frontend-2.log`, build
  `target/capture-investigation-build-2.log`, lint
  `target/capture-investigation-lint-2.log` (zero errors, ten existing warnings),
  and `git diff --check` pass.
- Linux package rebuild started: `target/capture-investigation-linux.log`.
  Native packaged click/export verification remains open. No live capture, public
  scan, upload, user-data deletion or automatic network activity was performed.

### Capture Buddy backend hardening and Investigation Brief — continuation

User authorized independent product improvements and asked to make Capture Buddy
more useful without copying Wireshark. The selected direction is an evidence
workspace: guided investigation, bounded synthesis and reproducible exports above
the native packet reader, while retaining raw packet/evidence access.

- **Scan Buddy backend hardening completed:** `scan_buddy.rs` now uses real async
  executor wakers (removed unsafe manual Noop polling), wakes cancellation through
  limiter and in-flight waits, prevents new starts after cancellation/shutdown,
  uses deterministic fair target/port scheduling, canonicalizes mapped IPv4 IPv6,
  rejects loose numeric syntax, records finite safe connection reasons, enforces a
  10-minute job deadline and bounds shutdown waiting. Existing limits and public
  methods remain. `ScanResult.reason` is additive with serde default.
- New `scan_buddy_journal.rs`: private bounded SQLite history, eight-job retention,
  2 MiB/job and 16 MiB active JSON limits, atomic upsert/prune, 250 ms busy timeout,
  strict model validation, private file/link checks and interrupted RUNNING-job
  recovery to FAILED without resuming probes. Only startup loading and explicit
  worker checkpoints touch it; no automatic scan. A private lock prevents two
  NET0ZE instances sharing the journal. Storage status is exposed to UI with safe
  warning text. Calls avoid engine locks and run SQLite saves in blocking workers.
- `scan_buddy_storage_status` IPC and Scan Buddy UI now show whether history is
  persistent/available and surface safe recovery/storage warnings. Connection
  reasons appear in the result evidence section and JSON/CSV/Markdown exports.
- New `capture_brief.rs` and `buddy_investigation_brief`: on-demand bounded native
  synthesis over decoded recording packets. Returns packet/captured/wire bytes,
  time bounds, top 12 protocols/talkers, top 20 conversations, 20 DNS strings and
  explicit review notes for large frames/missing times/HTTP-like/TLS metadata.
  No threat verdict, decryption, external request, source mutation or upload.
- `CaptureBuddy.tsx`: added **Build investigation brief** and an evidence-oriented
  summary card. `docs/CAPTURE_BUDDY_PRODUCT_DIRECTION.md` records the product
  architecture and future layers: conversation board, evidence timeline,
  explainable anomaly queue, case bundle, capability matrix and safe replay.
- Native tests: **103 library + 1 helper PASS** in `target/capture-next-native-2.log`.
  New scanner persistence/cancellation/deadline tests and capture-brief test pass.
- Frontend: **94 TypeScript/render + 5 script PASS** in
  `target/capture-next-frontend-3.log`; build pass in `target/capture-next-build.log`;
  lint zero errors/ten existing warnings in `target/capture-next-lint.log`;
  `git diff --check` pass. Existing large chunk/Tauri import warnings remain.
- No live capture, external scan, packet upload, user database deletion, install or
  automatic network activity performed in this continuation. Native interaction
  and report download still need mounted packaged-app verification.
- `npm run dist:linux`: **PASS**. Manifest generated `2026-10-05T17:56:05.922Z`;
  staged hashes independently verified. DEB 11022458 bytes,
  `106e1f93224cf622c8d8d2a6d9596d604df4fead054008083c91e9d180947739`;
  AppImage 115845624 bytes,
  `af0f51e2be3ef56921b42c4e6e279489751ecd00e459bda4c2b1b87d382ddd48`.
  Packages staged, not installed; no native click/live capture performed.

### Scan Buddy reported failure — interaction remake and IPC recovery

Package completion: `npm run dist:linux` **PASS**; both manifest hashes independently
verified. DEB: 10925240 bytes, SHA-256
`19953e289478426a67030e0f06c7b8d66e2c26673d6c18c2fbdb41cbfd9c3873`;
AppImage: 115755512 bytes, SHA-256
`9286f8d902dca542e38d659d8fdaeb51c2002a58502c2dfa4ffea406426048ac`.
Both are in `releases/linux/2.0.0-x64/`. Isolated extracted-DEB startup passed
(12s, SQLite/private logs), receipt `target/scan-buddy-repair-package/receipt.json`.
Expected new executable SHA-256
`8c2ecf9b1c0d82932a7df5ed4be7f7d31422eb8b4cc0acb4ba73d1073ba4f777`.
Installed executable differed at first check. OS terminal opened for authenticated
`sudo dpkg -i`; no password requested in chat. Install/reopen and original native
reproduction remain pending verification.
Completion update: remade build installed and reopened, independently verified
system package status and installed/running executable SHA-256
`8c2ecf9b1c0d82932a7df5ed4be7f7d31422eb8b4cc0acb4ba73d1073ba4f777`.
Old PID 39471 was verified as deleted old executable; no capture helper running,
last observed history empty. SIGTERM normal close, no forced kill. New PID 54757
alive after 12 seconds; receipt `target/scan-buddy-repair-installed/receipt.json`.
User data preserved; no agent-initiated scan. Original reported native failure
remains unverified pending user's exact flow/error, not merely package startup.

User reported Scan Buddy not working. Requested exact failing step/error/screenshot;
none supplied during this phase. Installed safe runtime logs showed successful
plan/history calls but no Start call. Original mounted mocked-IPC Preview/Start
test passed. **Exact user failure/root cause remains unconfirmed**; no claim of
a verified repair of that unspecified reproduction.

Changes:
- `src/components/ScanBuddy.tsx`: visible Scope → Preview → Start together,
  explicit disabled/next-action reason, pending labels, traffic-free Use loopback.
  Preview needs no consent; Start requires it. Checkbox changes preserve preview;
  scope edits invalidate preview/reset consent. SSR external-store fallback fixed
  after a failing combined test caught its missing server snapshot argument.
- New `src/lib/scanBuddyWorkflow.ts`: observable controller owns scope fingerprint,
  gates, mounted generations, poll/history reconciliation and cancel versions.
  Running-job polling survives history selection/other actions. Uncertain Start
  requires explicit history reconciliation; no automatic repeated write.
- `src/services/tauri/scanBuddy.ts`, new `src/lib/scanBuddyTransport.ts`: eight-second
  IPC deadlines (including import), timed-out read releases shared lane, late
  responses ignored, no automatic start/cancel retries, uncertain-outcome warnings,
  exact envelopes and native payload validation without coercion/fake defaults.
- New tests: `src/components/ScanBuddy.interaction.test.ts`,
  `src/components/ScanBuddy.workflow.test.ts`, `src/lib/scanBuddyWorkflow.test.ts`,
  `src/lib/scanBuddyTransport.test.ts`. Added Happy DOM **development-only** to
  `package.json`/lockfile for mounted React tests. No scanner/runtime dependency.
- Tests cover original controlled flow, unauthorized preview/explicit Start,
  checkbox retention, cancellation/revisit, late responses, polling continuity,
  hung reads, lane recovery, uncertain writes, malformed payloads and IPC envelopes.
  These are synthetic IPC tests, **not installed native-webview verification**.

Checks:
- `npm test`: **94 TypeScript/render/mounted + 5 script tests PASS**;
  receipt `target/scan-buddy-repair-tests.log`.
- `npm run build`: **PASS**, receipt `target/scan-buddy-repair-build.log`; existing
  large overview chunk/Tauri mixed-import warnings retained.
- `npm run lint`: **0 errors, 10 existing warnings**, exit success;
  receipt `target/scan-buddy-repair-lint.log`. `git diff --check`: **PASS**.
- Local SDK `cargo test --manifest-path src-tauri/Cargo.toml --release --lib
  services::scan_buddy::tests -- --test-threads=1`: **5 PASS**, actual loopback
  OPEN/CLOSED, authorization, pacing/history/cancellation/shutdown;
  receipt `target/scan-buddy-repair-native-tests.log`. Native scanner unchanged.
- Linux rebuild started `target/scan-buddy-repair-linux-build.log`; repaired build
  not yet claimed installed. Exact user native flow still needs verification.
- No public/LAN scan, capture, private target report, dependency on Nmap, automatic
  uncertain scan retry, git write/reset or user-data deletion. Logs/handoff/guide
  updated. Existing app runtime/capture permissions left intact during source work.

### Scan Buddy — independent native architecture, 2026-10-05

User requested replacing Network Engine with a fully remade **Scan Buddy**, in
the style of an authorized network scanner but **not dependent on Nmap**.
Implemented an original native TCP-connect engine and a new workspace; no Nmap
execution, library, wrapper, command translation, external scanning executable or
new dependency was added. Full Nmap protocol/script/OS-detection parity is not
claimed by this first independent architecture.

#### New files and integration

- `src-tauri/src/services/scan_buddy.rs`: pure target/port planner, managed
  `ScanBuddyState`, bounded job store, globally paced start gate, bounded Tokio
  workers, cancellation/shutdown and real TCP outcome classification.
- `src-tauri/src/commands/scan_buddy.rs`: typed `scan_buddy_plan`,
  `scan_buddy_start`, `scan_buddy_status`, `scan_buddy_cancel` and
  `scan_buddy_history` commands. Plan/status/history do not initiate traffic.
- `src/services/tauri/scanBuddy.ts`: typed request/result/job models and serialized
  native read lane; rejects browser mode rather than simulating results.
- `src/components/ScanBuddy.tsx`: redesigned scope editor, common/web/dev port
  presets, explicit authorization, exact preview, native background job progress,
  cancellation, bounded history, result search/filter/sort, exports and honest
  unavailable states. Synchronous action gates and lifecycle guards suppress
  stale results and duplicate starts. Navigation does not silently stop jobs.
- `src/lib/scanBuddyPresentation.ts`, its test and `src/components/ScanBuddy.test.ts`:
  preliminary UI validation, request fingerprints, projections, progress and
  JSON/CSV/Markdown exports. A parent review corrected CIDR counting to match the
  native exclusion of network/broadcast endpoints and added oversized-input guards.
- `scripts/scan-buddy-contract.test.mjs`: regression checks for native state/exit
  wiring, route replacement and no external scanner spawning/dependency.
- `src/App.tsx`, `src/components/Sidebar.tsx`: replaced the routed HybridIntel
  component with ScanBuddy; visible label **Scan Buddy**, directly accessible.
  Internal `network_engine` key kept for compatibility. Legacy HybridIntel source
  remains unrouted; old APIs/data were not destructively removed.
- `src-tauri/src/services/mod.rs`, `src-tauri/src/commands/mod.rs`,
  `src-tauri/src/lib.rs`: module/IPC wiring, separately managed scanner state and
  app-exit shutdown. `src-tauri/src/services/logging.rs`: allowlisted safe Scan
  Buddy operations. No targets/queries/raw errors added to runtime logging.
- `docs/SCAN_BUDDY.md`: architecture, operator flow, bounds, outcomes and gaps.
  Existing logbook/handoff updated rather than replacing earlier history.

#### Behavior/data contract

Requests contain literal targets/CIDRs, custom ports/ranges, timeout/concurrency
and authorization. Start revalidates all fields and rejects authorization=false.
Only one job may run or settle cancellation. Limits: 32 hosts, 256 unique ports,
4,096 probes, 1–16 workers, 100–2,000 ms timeout, global connection-start spacing
of at least 20 ms, eight retained in-memory jobs. CIDRs /27–/32; /30 and wider
exclude network/broadcast, /31-/32 retain hosts. Unspecified, multicast, limited
broadcast and unscoped IPv6 link-local are rejected. No DNS lookup. Literal
directed broadcast requires operator subnet knowledge; it cannot be inferred.

Plans list normalized exact targets/ports and warnings. Jobs retain id,
RUNNING/COMPLETED/CANCELLED/FAILED, UTC start/finish times, plan, observed count,
bounded rows and optional worker-failure message. Rows contain target, TCP port,
OPEN/CLOSED/TIMEOUT/UNREACHABLE/ERROR, unverified port-based service hint,
TCP-connect milliseconds and observed UTC timestamp. Cancel preserves completed
observations and stays RUNNING until workers settle; no second scan during that
window. Exit cancels queued work. History resets on app exit; no persistence
migration or automatic scan was introduced.

JSON preserves full job metadata. CSV preserves all observed rows with formula
escaping and sensitivity warning; Markdown includes job scope/timing/counts and
rows. Exports are user-triggered downloads and contain endpoints; no automatic
upload or private endpoint samples are written into repo documentation.
No UDP, raw SYN, ping discovery, OS fingerprinting, banner/service verification,
NSE-style scripts or vulnerability testing is implemented. TIMEOUT is not proof
of filtering; OPEN is connection evidence only, not a safety verdict.

#### Checks so far

- `npm test`: initial integrated **80 TypeScript/render + 3 script tests PASS**;
  later source contract tests and final export/CIDR refinements are checked below.
  Receipt `target/scan-buddy-frontend-tests.log`.
- Initial `npm run build`: **PASS**; existing large lazy-overview/Tauri import
  warnings retained. Receipt `target/scan-buddy-frontend-build.log`.
- `npm run lint`: **0 errors, 10 existing warnings**, exit success. Receipt
  `target/scan-buddy-lint.log`. `git diff --check`: **PASS**.
- Local SDK `cargo test --manifest-path src-tauri/Cargo.toml --release --lib
  --bin netoze-capture-helper -- --test-threads=1`: **84 library + 1 helper PASS**.
  Receipt `target/scan-buddy-native-tests.log`; isolated XDG app data.
  New five native tests cover validation/scope bounds, authorization, actual local
  OPEN/CLOSED connections, history retention, cancellation preserving rows, global
  pacing, bounded worker counts and shutdown preventing queued starts.
- Test connections used loopback endpoints only. No user-network/public-host scan,
  live capture, privileged setup, dependency installation, git reset/commit/push
  or existing desktop termination was performed.
- Linux DEB/AppImage rebuild underway, receipt `target/scan-buddy-linux-build.log`.
  Full native click/download and Windows runtime checks remain unverified.
- Final source `npm test` rerun: **80 TypeScript/render + 5 script tests PASS**,
  including route/state/no-external-scanner contracts. Final `npm run build` and
  lint pass (zero errors, ten existing warnings); `git diff --check` passes.
  Markdown exports now retain scope, timing and partial-result counts. UI CIDR
  counting and input-length guards match native limits; boundary tests pass.
- Initial `npm run dist:linux`: **PASS**, both packages staged. Comparing the
  bundled ScanBuddy chunk with the final source build identified that the first
  package had preceded the final report-metadata refinement. A final full rebuild
  was started rather than treating the earlier packages as current. Receipt:
  `target/scan-buddy-linux-final-build.log`; final integrity/startup checks pending.
- User requested completing Scan Buddy in NETOZE now. Final DEB compilation and
  packaging completed. Extracted DEB's native `scan_buddy_start` handler marker
  verified; isolated X11/Xvfb launch **PASS** (alive 12 seconds, SQLite and private
  logs initialized). Receipt `target/scan-buddy-package-smoke/receipt.json`.
  Final DEB SHA-256 `3d4c7321d49757acef6e8c53b04370fe27c2cb6743bcac881ed0951e62180dbd`.
  An initial byte-marker check looked for a literal UI label in the compressed
  embedded frontend and was unsuitable; it was replaced by the native command
  marker check. No native click/download verification is inferred from that marker.
- Existing NETOZE was running from `/usr/bin/netoze-desktop`; system package
  remained installed. `sudo -n true` required authentication. An OS terminal was
  opened for the user to authenticate and run `sudo dpkg -i` on the final DEB.
  No password/token was requested or read in chat. Installation success is
  **pending independent verification**, and the old running process was not killed.
  Reopen the app after successful installation to load the new frontend/engine.

#### 16:46 IST — Scan Buddy rebuild/install/reopen completed

- Final `npm run dist:linux`: **PASS**. Receipt
  `target/scan-buddy-linux-final-build.log`. Manifest generated
  `2026-10-05T11:15:42.301Z`; both artifact sizes/hashes independently verified.
- Final DEB: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`, 10923094 bytes;
  SHA-256 `3d4c7321d49757acef6e8c53b04370fe27c2cb6743bcac881ed0951e62180dbd`.
- Final AppImage: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage`, 115751416 bytes;
  SHA-256 `c4b3384e75a5addb6020e0e6a16762310648ff8c5667cc39bf87128a0ee4f567`.
- System installation **verified**, not inferred from terminal receipt:
  `dpkg-query` reports install ok installed, and `/usr/bin/netoze-desktop` hash
  matches the final extracted-DEB executable
  `10815e6d1cae99d5db470cd8b4db664f46a6313fc2c3acec6bd7276c4a0471ac`.
- Helper permissions retained root:netdev 0750 / cap_net_raw=ep. No capture helper
  process was running. Confirmed old desktop PID 25603 referenced a deleted older
  executable; sent SIGTERM and waited for normal exit (no forced kill). Launched
  the updated installed app with normal user app data/display environment.
- New installed app PID **39471**, alive after 12 seconds; running `/proc` binary
  hash matches the final DEB. Receipt `target/scan-buddy-installed/receipt.json`.
  App remains running for the user. No user data cleared; no scan/capture initiated.
- This completes engine/UI integration, Linux rebuild, verified system installation
  and reopened current native runtime. It does not claim clicked native export or
  real remote-network scan verification. AppImage build/integrity passed; current
  AppRun startup and Windows runtime remain unverified.

### 15:59 IST — continued capture reliability and local host reports

User requested continuation. Existing modifications, application data and capture
permissions were preserved. Two independent implementation tasks were completed,
then their actual code and checks were reviewed and integrated.

- `src/components/CaptureBuddy.tsx`, new `src/components/captureWorkflow.ts` and
  `src/components/captureWorkflow.test.ts`: synchronous action leases prevent
  duplicate start/open/save/stop actions before React rerenders. Lifetime/session/
  view/detail tokens reject stale asynchronous results. One poll queue survives
  query-effect restarts; cancelled queued polls do not run. Engine rechecks no
  longer change component ownership. Query/page changes invalidate details
  immediately. Action errors are not silently erased by successful polling.
  Replaced/unmounted sessions still request backend cleanup. Eight regression
  tests exercise gating, lifetime/session/detail scopes, serialization and cleanup.
- New `src/components/HostReport.tsx`, `src/lib/hostReport.ts` and
  `src/lib/hostReport.test.ts`, mounted by `src/components/SystemLogs.tsx`:
  **Host & Logs → Local host report** collects existing native reads on request
  and exports a bounded Markdown or JSON snapshot. Seven tests cover redaction,
  explicit inclusion, Markdown escaping, partial failure, empty/browser states,
  row/string/output limits and invalid measurements.
- Report sources: detailed system information, detailed interfaces, active TCP
  sockets, backend readiness and runtime **log status only**. Native source reads
  use `Promise.allSettled` and have individual UTC started/collected timestamps.
  Reads are independent, not atomic. Partial failures remain visible; raw error
  messages, readiness diagnostic messages, host event records and application log
  contents are excluded. No scan, capture, probe, feed refresh or upload is started.
- Default report redacts hostname, username, interface names/descriptions, IP/MAC,
  endpoints/ports, process identifiers/names, native tool names and paths. A local
  opt-in checkbox permits those bounded fields. Opt-in reports remain sensitive;
  neither default redaction nor this exporter is a guarantee of anonymity.
  Changing inclusion invalidates the old snapshot before export.
- Report schema version 1 includes collection timestamps, identifier-inclusion
  flag, provenance, limits and five named source sections with status, source,
  timestamps, note and allowlisted data. Limits: 64 interfaces, 128 sockets,
  32 tools, eight addresses/family/interface, 160 characters/string, 12,000-character
  preview and 2,097,152-character serialized output. Counts of omitted rows are
  explicit. Unknown enum values remain Unknown; nonfinite/negative numeric
  observations become null. No threat or host-health score is fabricated.
- Markdown contains escaped JSON in a fixed code fence so native metadata cannot
  inject HTML or close the fence. Downloads are user-triggered Blob exports via
  the webview/browser; actual native download interaction remains unverified.
- `npm test`: **PASS — 68 TypeScript/rendering + 3 script/IPC/release tests**.
  Receipt: `target/continuation-tests.log`.
- `npm run build`: **PASS**. Receipt: `target/continuation-build.log`; existing
  overview chunk-size and Tauri mixed-import warnings remain.
- `npm run lint`: **0 errors, 10 existing warnings**, exit success. Receipt:
  `target/continuation-lint.log`. `git diff --check`: **PASS**.
- Native Rust was not modified in this continuation; the prior 81 native test
  receipt remains historical, not a newly rerun result. Frontend literal IPC
  registration checks passed including the report's runtime-log status command.
- `npm run dist:linux` started with receipt `target/continuation-linux-build.log`.
  Package completion/checksum receipts will be added after completion. No latest
  installer claim is made while the build is in progress.
- No administrator installation, live recording, active scan, dependency install,
  reset, commit, push, or existing desktop process termination was performed.
  Windows runtime, mounted native interaction/export and real capture remain open.

#### Completion receipt for the 15:59 continuation

- `npm run dist:linux`: **PASS**, frontend/native build plus DEB/AppImage staging.
  Receipt: `target/continuation-linux-build.log`. Both staged sizes and SHA-256
  hashes independently match `releases/linux/2.0.0-x64/manifest.json`.
- Current DEB: **10864424 bytes**; SHA-256
  `c36fee9bebe1f0461fcc471ef57a18548dd6b867f99000b54809db87aea5df72`.
- Current AppImage: **115698168 bytes**; SHA-256
  `2fa963921d93b45bb36a28776e65128d290f8c9de3c55e38d7e48428d687ed2e`.
- Extracted current DEB, launched with child-only `GDK_BACKEND=x11` via Xvfb and
  isolated XDG directories: **PASS**, alive 12 seconds with SQLite and private
  mode-0600 runtime logs initialized. Receipt:
  `target/continuation-package-smoke/receipt.json`. Only the spawned smoke process
  group was stopped. No installation or live recording was performed.
- Current AppImage build/integrity verified; AppRun startup was not rerun for this
  continuation. Native report/download/capture interactions and Windows remain
  unverified. Older artifact hashes below describe their earlier builds only.

### 14:11 IST — implementation and integration verification

User resumed development and authorized analysis, optimization, useful basic network
features, text/feature cleanup, and updating this existing change-tracking file.
The latest handoff was read before changes: native Capture Buddy and the restricted
Linux helper already existed. Extensive prior modified/untracked work was preserved.
No reset, commit, push, dependency installation, active scan, external speed test,
live packet capture, privileged installer action or existing-process termination
was performed in this improvement phase.

#### Changes and file inventory

| Area | Files | Result |
| --- | --- | --- |
| Passive speed monitoring | `src/lib/passiveInterfaceSpeed.ts`, `src/components/PassiveInterfaceSpeed.tsx`, `src/components/SystemLogs.tsx` | Selectable per-interface RX/TX Mbps and KiB/s, recent graph, measured session byte totals and peaks, explicit CSV export |
| Speed checks | `src/lib/passiveInterfaceSpeed.test.ts`, `src/lib/passiveInterfaceSpeedView.test.ts` | 11 checks: units, elapsed time, identity, resets, churn, missing/down interfaces, errors/gaps, safe counters, bounds, CSV escaping and rendered states |
| App lifecycle | `src/App.tsx`, `src/lib/appLifecycle.ts`, `src/lib/appLifecycle.test.ts` | Bounded deduplicated flow state, batched streamed updates, nonoverlapping completion-based polling, cancellation and late subscription cleanup; six tests |
| Navigation and copy | `src/components/Sidebar.tsx`, `src/components/TopNavbar.tsx`, `index.html` | Short labels, optional unfinished views grouped as Experimental, decorative/unproven database or online claims removed, NET0ZE favicon instead of Vite branding |
| Operational log engine | `src-tauri/src/services/logging.rs` | Five-slot 1 MiB private rotating log ring, bounded reads/status, single-writer lock, safe disk failure, allowlisted structured fields and nine unit tests |
| Log IPC | `src-tauri/src/commands/runtime_logs.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src/services/tauri/runtimeLogs.ts` | Two registered native commands; UI reads no arbitrary path or filename |
| Log viewer | `src/components/RuntimeLogs.tsx`, `src/components/RuntimeLogs.test.ts`, `src/components/SystemLogs.tsx` | On-demand read/status, bounded selectable text, snapshot download, explicit native-only/unavailable states; rendered browser-state regression check |
| Capture operations | `src-tauri/src/commands/capture_buddy.rs`, `src-tauri/src/services/logging.rs` | Import/search/export/start/stop outcome and duration records, including early errors; worker completion records without paths, queries or payloads |
| Native log round-trip | `src-tauri/tests/runtime_logs_verify.rs` | Tracing to private ring to command response; real read-back, success/failure outcomes, byte clamps and secret exclusion |
| Repeatable checks | `package.json` | `npm test` runs all local TypeScript and script tests using the existing tsx dependency |
| Progress documentation | `docs/BACKEND_LOGBOOK_IST.md`, `docs/NETOZE_HANDOFF.md`, `docs/MONITORING_AND_LOGS.md` | This inventory, actual checks, usage/data contracts, privacy/retention and remaining gaps |

#### Data contracts and limits

- Speed reads existing native cumulative interface counters; sends no network test
  traffic and does not measure ISP capacity, application goodput or remote latency.
  Interface identity is name plus normalized MAC; interfaces are never summed.
  Loopback is excluded. History is 120 measured intervals/interface and at most
  32 interfaces. Session totals/peaks are view-local; skipped gaps are not counted.
- CSV contains interface, UTC timestamp, elapsed seconds, RX/TX byte deltas,
  decimal Mbps, binary KiB/s and a gap marker. Only selected retained samples
  are exported; exports are user-triggered. Formula-like labels are escaped.
- Runtime files are app-data `logs/runtime-0.log` through `runtime-4.log`;
  newest is slot zero. New ring retention is at most 5 MiB. Legacy `backend-*.log`
  files are preserved, not exposed and not covered by the new retention bound.
  Unix logs directory mode is 0700 and files/lock are 0600. Symlinks and Unix
  hardlinks are rejected. No caller-supplied path is accepted by read commands.
- Structured records retain IST timestamp, level, source/line and allowlisted
  operation/state/provider/platform/timezone plus success/availability/count/
  indicators/duration_ms where supplied. Free-form messages, errors, tokens,
  credentials, query strings, paths, URLs, packet fields and span values are
  excluded. `count` means sessions/files for import/export/start/stop, returned
  packet rows for search; completion indicates worker outcome, not packet count.
- Read responses include availability/reason, generated/initialized/last-write
  timestamps, timezone, file count, retained bytes, limits and oldest-to-newest
  returned tails. Default is 64 KiB, clamped to 1–256 KiB. Truncation is explicit
  and the first returned line may be partial. No read or export starts capture.

#### Verified checks

- `npm test`: **PASS — 53 TypeScript/rendering tests + 3 script/IPC/release tests**.
- `npm run build`: **PASS — TypeScript + Vite** at initial integration. Initial
  entry JS 268.17 kB / 82.93 kB gzip with log viewer; heavy overview is lazy-loaded
  but remains a 1,448.03 kB chunk. Existing Tauri mixed-import/chunk warnings remain.
- `npm run lint`: **PASS exit status — 0 errors, 10 existing warnings**. Warnings
  concern unused legacy view/search variables and one SearchModal ref cleanup.
- `git diff --check`: **PASS**.
- Local SDK: `cargo test --manifest-path src-tauri/Cargo.toml --release --lib
  --bin netoze-capture-helper -- --test-threads=1`: **PASS — 79 library + 1 helper**.
  First invocation exceeded 120 seconds during compile; it was inspected and rerun
  with a longer limit. Final receipt: `target/improvement-native-tests.log`.
- Local SDK: `cargo test --manifest-path src-tauri/Cargo.toml --release
  --test runtime_logs_verify -- --test-threads=1`: **PASS — 1 integration test**.
  Receipt: `target/improvement-runtime-verify.log`; isolated XDG data only.
- Frontend receipts: `target/improvement-frontend-tests.log`.
- `curl --fail --silent http://127.0.0.1:4173/`: served production preview HTML.
  Built-in browser open timed out and tab listing remained empty; rendered browser
  interaction, native downloads and GPU behavior are **not verified** by that read.
- Existing installed helper retained root:netdev 0750 and `cap_net_raw=ep` on a
  read-only inspection. This verifies setup metadata, **not live recording**.
- `npm run dist:linux`: started; native build/package receipt pending below.
- Final frontend refinement: Host & Logs also skips hidden-window polling and
  retains its one-in-flight gate across effect restarts; visibility return
  requests a fresh read. `npm test`, lint and TypeScript were rerun successfully.
- A rendered-log test initially caught a missing React import under the node/tsx
  JSX test configuration; it was corrected and the complete test suite rerun.
  An initial native DEB/AppImage build completed. A final full build was then
  started to include the last visibility/copy refinements; no stale package is
  labelled as the final result before its receipt.

#### Deliberate remaining boundaries

No active Internet capacity test was added. A future opt-in test needs an explicit
endpoint, transfer-size/time bounds and consent for paid/metered links. No protocol
coverage expansion, automatic capture/scan, authentication redesign or destructive
feature deletion was attempted. Optional views remain recoverable under Experimental.
Logs use Rust standard-library file locking (Rust >=1.89; tested SDK 1.99). Linux
is checked; Windows/macOS runtime behavior and hostile same-user directory races
are not claimed solved. Native UI and real capture/search/save smoke remain needed.

### Final Linux package and isolated launch receipts — 2026-10-05

- Final `npm run dist:linux`: **PASS**, including the last visibility/copy changes,
  frontend TypeScript/Vite build, native helper/application build, DEB, AppImage
  and staging. Receipt: `target/improvement-linux-final-build.log`.
- Final initial entry JS is **268.29 kB / 82.95 kB gzip**; overview stays lazy at
  **1,448.03 kB / 359.42 kB gzip**. These are measured outputs, not a claimed
  startup-latency benchmark. Existing chunk/import and native dead-code warnings
  are retained as known limitations.
- Staging manifest generated at **2026-10-05T08:52:22.916Z**; installer sizes and
  SHA-256 values were independently checked against files on disk:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb` | 10862882 | `a42bb24594c1c78359f1211e0c716880ec3667b7bce63e45725ce32f3e614f4c` |
| `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage` | 115702264 | `c2e5687c92a24621b579f132e4b03d88819899d4b2a15e5be593b70b106f30da` |

- DEB was extracted with `dpkg-deb -x` into an isolated test directory, not
  installed. Both desktop executable and capture helper were present. First
  `xvfb-run -a` smoke failed GTK initialization because inherited
  `GDK_BACKEND=wayland` conflicted with Xvfb. This was inspected, not hidden.
- Retried only the smoke child with `GDK_BACKEND=x11`: **PASS**. Packaged app
  remained alive 12 seconds, initialized isolated SQLite and private mode-0600
  runtime log, and had zero GeoIP, threat-match, device and DNS observations.
  Receipt: `target/improvement-package-smoke/receipt.json`; failed and successful
  launch receipts remain alongside it. This is startup verification, not proof
  of rendered interactions or successful recording.
- AppImage `--appimage-extract`, then `xvfb-run -a squashfs-root/AppRun` with the
  same child-only X11 override and separate XDG directories: **PASS**. Alive
  after 12 seconds with SQLite and logs initialized. Receipt:
  `target/improvement-appimage-smoke/receipt.json`. Direct FUSE mounting was
  **not tested** in this phase; prior environmental limitations still apply.
- Only newly spawned isolated smoke process groups were stopped after checks.
  No existing desktop process, installed binaries, capture permissions or user
  database was changed. The release is built and staged, **not installed**.
- Windows installers were not rebuilt in this phase; existing Windows artifacts
  may be older. Native GUI clicks, file-download flow, GPU behavior and live
  capture remain explicit follow-ups. No claim of full pentesting coverage.

## 2026-10-04

### 11:55:52 IST — Linux native startup observation

- The release executable initialized SQLite in an isolated smoke-test directory.
- It remained running for 15 seconds using the host's system runtime libraries.
- Read-only database verification found no generated GeoIP, threat, device,
  port-scan or DNS observations. No capture or feed workers started automatically.
- Source: `target/native-smoke.log` (its original timestamp is 06:25:52 UTC).

### 12:03:39 IST — Backend priority and supplied branding recorded

- User supplied `/home/kalu/Desktop/code/NETOZE/Netoze-icon.png` for both native
  platforms. Frontend work is deferred; native icons will use this supplied file.
- Verified prior work: shared Tauri state and command registration, read-only
  global-intel snapshot, local SQLite initialization, Npcap/libpcap platform paths.
- Linux release executable and DEB were built. The Rust flow-map eviction borrow
  error was fixed. All 35 then-current native unit tests passed.
- A Linux DEB was staged in `releases/linux/2.0.0-x64/` with a SHA-256 manifest.
- Windows MSVC SDK setup completed after moving generated tooling off the small
  temporary filesystem. Windows EXE cross-compilation is in progress.
- AppImage packaging has not succeeded yet; a verbose attempt hit its command
  time limit. A longer packaging run is in progress.
- New objective: backend APIs, persistent IST runtime logs, and an operating guide.

### 2026-10-04 12:26:20 IST (+05:30)

Verified baseline Linux DEB/AppImage and Windows NSIS packaging completed. Preserved the supplied Netoze-icon.png and generated native icons. Added IST runtime file logging, explicit keyless API refresh handlers, bounded/validated API responses, shared graph/JA4/detection handlers, TCP port checks, RDAP lookup and capture-rate fixes. Latest backend unit and real API checks are in progress; frontend files remain unchanged in this phase.

### 2026-10-04 12:26:58 IST (+05:30)

PASSED: 40 native Rust unit tests, including private-address protection, GeoIP response validation, IST date rollover, and real loopback TCP port checks. PASSED: explicit live API verification for ipify, ipwho.is, RDAP.org and 3 threat-feed sources; 5 valid public-IP indicators, 0 feed source errors. No capture or external port scan was run. Beginning backend-only Linux and Windows rebuilds using the existing frontend bundle and supplied native logo.

### 2026-10-04 12:27:24 IST (+05:30)

STARTED: linux desktop build; backend-only, reusing packaged frontend.

### 2026-10-04 12:27:24 IST (+05:30)

STARTED: windows cross desktop build; backend-only, reusing packaged frontend.

### 2026-10-04 12:30:16 IST (+05:30)

COMPLETED: windows NSIS-only cross desktop build and artifact staging. See releases/windows/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-04 12:30:18 IST (+05:30)

FAILED: linux desktop build step node (exit 1). Inspect the build output for details.

### 2026-10-04 12:38:22 IST (+05:30)

COMPLETED: backend-only native artifacts. Windows NSIS installer staged at releases/windows/2.0.0-x64/NET0ZE_2.0.0_x64-setup.exe. Linux DEB and AppImage staged at releases/linux/2.0.0-x64/. AppImage packaging required a host-path environment correction for linuxdeploy GTK; the build helper now separates compile and packaging environments. Both release directories include SHA-256 manifests. Native installers are unsigned; Windows MSI and runtime smoke testing on Windows remain platform-specific follow-ups.

### 2026-10-04 12:56:33 IST (+05:30)

STARTED: linux desktop build; backend-only, reusing packaged frontend.

### 2026-10-04 13:28:12 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-04 14:12:55 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-04 15:26:00 IST (+05:30)

STARTED: linux desktop build; backend-only, reusing packaged frontend.

### 2026-10-04 15:34:58 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-04 15:58:49 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 14:08:05 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 14:15:18 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 14:15:52 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 14:22:22 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 15:59:26 IST (+05:30)

STARTED: linux desktop build; full packag2:22 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 15:59:26 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 16:07:06 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 16:25:50 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 16:36:28 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 16:36:40 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 16:45:42 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 17:04:34 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 17:12:02 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 23:18:36 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-05 23:26:05 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-05 23:54:39 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 00:02:41 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 00:26:22 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 00:33:23 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 00:51:40 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 12:59:09 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 13:08:28 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 13:38:41 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 13:48:02 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 14:06:03 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 14:14:26 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 14:47:09 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 14:55:48 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 20:48:24 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 20:57:31 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 21:19:08 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 21:28:28 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 21:46:57 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 21:58:46 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 22:23:36 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 22:33:40 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 22:52:27 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 23:02:39 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 23:25:23 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-06 23:36:25 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-06 23:57:55 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 00:09:52 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 00:21:54 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 00:31:28 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 00:57:58 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 01:11:39 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 01:30:06 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 01:49:50 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 02:08:19 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 02:18:31 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 02:33:31 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 02:45:09 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 02:49:07 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 03:03:46 IST (+05:30)

COMPLETED: linux desktop build and artifact staging. See releases/linux/ and its manifest for exact files and checksums. Runtime validation is a separate check.

### 2026-10-07 10:50:05 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 10:52:32 IST (+05:30)

STARTED: linux desktop build; full packaged application.

### 2026-10-07 10:57:51 IST (+05:30)

STARTED: linux desktop build; full packaged application.

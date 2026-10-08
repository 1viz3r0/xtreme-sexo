# NET0ZE Project Handoff

**Resume entry point:** `docs/NETOZE_LABS_RESUME_MANUAL.md` is the consolidated
Labs manual, including where work stopped, exact next steps, checks, and a
next-session starter prompt. The scoped source/manual/DEB archive is
`docs/NETOZE_LABS_RESUME_2026-10-08.zip`. At the manual's save-time check,
NET0ZE was not running; Docker 28.5.2 was available and no lab containers remained.

## Current Labs direction — 2026-10-08 (supersedes historical sections below)

Labs was rebuilt from scratch with no active Red/Blue or simulated-room engine.
See `docs/LABS_LOCAL_REBUILD.md` for the new Docker Web Exposure target,
research, actual tests, package hashes, and remaining blockers. Docker 28.5.2
and the final DEB are installed, the old process is stopped, and the restarted
app's executable hash matches the installed binary. Real native container
lifecycle/isolation checks passed; packaged-app visual/IPC acceptance remains
for the user. Historical room descriptions
below are not the current runtime design.

## Latest cleanup: keep only the current Labs experience

User requested: keep the latest Red/Blue topic catalog and remove old rooms.
Primary Labs now contains the 30-topic catalog with only Room 1 runnable;
queued topics remain explicitly disabled. Removed from source/UI:

- legacy `purpleLabs` static catalog and tests
- generic `localTarget` adapter and tests
- generic Purple-Team native service, commands, module wiring and regression test

Latest Labs no longer exposes Compatibility Views, Practice Rooms, Individual
Labs, Combined Exercises or the generic loopback target. The `lab_runtime`
compatibility catalog still recognizes old active sessions/checkpoints internally
so existing saved data is not silently destroyed; it is not user-visible and
cannot be started through the desktop command. Remove it later only after an
explicit migration decision.

Verification after cleanup: 161 application tests + 14 script tests passed;
typecheck and diff check passed; native Room 1 10 + persistence 11 tests passed.
DEB rebuilt/staged. Release SHA-256:
`456ba28290f1168983047b348faffa5122aa338eec2871f1fe703a50bc0d539e`.
Installer SHA-256:
`118559a528bf71ff3c44b928cce40171c81ac71972a747727225f7bf9d052926`.
Installed binary remains older (`9b827f4a...`); OS-authorized installation is
still required. No app process was stopped and no saved progress was deleted.

## Current resumed work: Room 1 deep implementation

User resumed with an explicit one-room-at-a-time requirement. Room 1 is now a
complete bounded local training range around Red Easy — Network Scanning and
Asset Discovery. See `docs/LAB_ONE_RESEARCH.md` for benchmark research,
protocol boundary and remaining VM/range gap.

Start atomically creates one loopback room listener with a fictional inventory,
read-only web surfaces (Aurora Ledger page/API/headers/routes/robots-style
metadata/findings) and a banner-only SSH surface returning an SSH identification
line. The UI exposes readiness/endpoints and buttons to inspect both service
surfaces. It does not bind fictional ports, scan the host, open an SSH shell,
accept credentials, execute commands, upload files or use outbound networking.

Workflow is server verified: inventory -> web inspection -> SSH banner
inspection -> exact evidence -> allowlist/decoy exclusion -> computed report.
Persistence/replay/reset and shared browser/native state remain enabled.

Native checks after the service implementation: 10 room tests + 11 persistence
tests + 1 legacy regression passed. Browser scripts: 9 focused room tests; live
Happy DOM/actual Rust HTTP passed for Red, Blue, discovery, and separate-process
resume/reset scenarios. The first native attempt found a Rust delimiter error;
it was fixed before the passing run. Frontend suite remains 219 + 14 passed;
typecheck/diff had passed before the final backend-only adjustments. No rendered
browser or installed-app visual acceptance performed.

Do not describe this as a real VM, actual scanner, full SSH implementation or
30 completed rooms. Continue only after the user accepts Room 1; then proceed
to the next topic one at a time.

## Latest: replacement topic catalog — old rooms retired

User requested clearing existing rooms and starting from their new topic list.
The list contains 30 topics: 15 Red and 15 Blue, each 7 Easy/5 Medium/3 Hard.
`src/lib/labTopicCatalog.ts` is now the primary catalog. Only
`red-network-discovery` is enabled; the other 29 entries are explicitly queued
and cannot start/open. This enabled room remains a seeded inventory simulation,
NOT actual network scanning or a freshly provisioned VM; practical replacement
is still incomplete. Do not claim 30 functional environments.

Primary Labs defaults to Red Easy discovery. Old Dispatch Desk/Signal Bureau,
phrase rooms, compatibility panels and generic target are not catalog choices.
Native `lab_runtime_start` also rejects retired room IDs. Legacy code and old
checkpoints remain internally for regression/compatibility; they were NOT deleted.
An already-running old room is displayed only as a generic stop notice.

Main checks: 219 app tests + 13 script tests passed; 9 native room + 11 persistence
tests passed; frontend typecheck/build and DEB packaging passed; lint passed with
existing warnings. No installed-app visual acceptance performed.
Installer: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
Latest binary SHA-256:
`52bfa616cf8af5b19f2ca429780fcfa64a6f4cc73e23124fccadef00981d7376`.
Installed binary remains older (`9b827f4a...`). OS-authorized installation pending.
Next: replace seeded discovery with a genuine bounded owned service environment,
verify normal launcher/browser interaction, then build topics one at a time.
Named third-party machines are references, not copied challenge content.

## Latest: Labs benchmark fixes and durable resume — 2026-10-07

User explicitly resumed and requested comparison/remake/fixes. Read
`docs/LABS_BENCHMARK_AND_REMAKE.md` for complete current/legacy inventory,
official online references, findings, changes, limitations and reproduction.
This section supersedes the older paused/in-memory-only sections below.

Primary Labs now has three runnable environments: Red Network Scanning and Asset
Discovery (the first simple room), Red Dispatch Desk, and Blue Signal Bureau.
Fixed Red private
job/receipt snapshot disclosure and cleared now-forbidden cached receipt on
repair. Blue rule verification now includes ten private held-out records to
reject session/host/user memorization. Added bounded browser requests,
uncertain-write reconciliation (no automatic POST retries), stale hint rejection,
original Blue CSV export, raw records, workflow help and stage-sensitive debriefs.

Desktop now uses durable per-room training action journals in local user data
`io.netoze.desktop/lab-progress`. Stop retains healthy checkpoints; explicit
Resume reconstructs verified progress with a new run ID/link/generation/token.
Reset reseeds both live and saved progress. Invalid checkpoints are preserved
with visible errors; storage failure permits labelled in-memory work. Tests use
isolated directories; scratch notes remain tab-only, and audit timestamps/IDs
are reconstructed on replay rather than an immutable historical record.

Latest main-session checks: 206 app tests, 13 script tests, 8 room native tests,
10 native persistence tests, 1 legacy native regression passed. Typecheck/build,
lint (existing unrelated warnings) and diff check passed. Both Happy DOM/live
native playthroughs and BOTH separate-process resume/reset scenarios passed.
These are NOT rendered-browser or installed-app restart tests.

DEB rebuilt and staged at `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
Latest release binary SHA-256:
`ba135092b3b7bc4badf1689f5f43e507c7d4d7b0dd9bd52fed0a32095446abe5`.
DEB SHA-256:
`7bb56789d1d5d8a804fe7c2a9f71ae92c5b22e4384db3cd3b5161cc970af38df`.
Installed binary remains different:
`9b827f4aee3ceb4b918cbddb1fca12ce8eafe74cc0ef5350c03f06199b52c447`.
Installation needs OS administrator authentication; no install or app restart
was performed in this resumed pass. No commits, resets or cleanup of user work.

Next: approved installation, normal-launch/default-browser visual acceptance,
then distinct original environment expansion. Remaining 20-room request,
forensic artifact breadth and VM/container ranges are not implemented.

## Resumed implementation — functional Labs replacement

User resumed implementation after the research pause. Primary Labs now exposes
two functional environments only: Red Dispatch Desk and Blue Signal Bureau.
Legacy quiz APIs remain in source but are no longer primary UI entry points.
Red has seeded jobs, receipts, role selection, real access audit evidence, fixed
policy repair and computed access-matrix verification. Blue has 14 event records,
evidence bookmarking, timestamp-verified timeline, fixed-operator detection rules
with computed TP/FP/FN and scoped response selections. These are local training
services, not VMs. Neither performs host exploitation or real response actions.

Desktop progress/reset/report now comes from the same backend state as browser
rooms; independent React quiz engines were removed from the primary flow.
Explicit native open/reset commands added; browser launch no longer uses
window.open. State remains in-memory and only one room runs at a time.

Verification in main session: npm test 201 app + 5 script tests passed;
typecheck/diff passed; native functional runtime 5 + legacy regression 1 passed;
DEB rebuilt/staged. Real installed-browser rendered E2E remains unverified.
System installation attempted but blocked: sudo requires administrator password.
Installed binary hash remains different from latest release. DO NOT describe
the normal launcher as updated. New binary SHA-256:
`a0b34d7504e9b6a862e33caf4044ef8cda31d76d0188c4d10a72236b0e16b42b`.
Installer: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
Next: OS-authorized installation, then actual native launch and browser playthrough
of both environments. Full 20-room distribution is not implemented.

## Historical checkpoint — Labs rejected; implementation paused (2026-10-07)

The user reports nothing is working and requested full research plus a saved
state for a later return. Acceptance is NOT met. Prior entries claiming working
Labs describe HTTP/mock tests, not a verified full environment or deployment.

Read **`docs/LABS_RESEARCH_AND_RECOVERY.md` first**. It records source-backed
failure analysis, current hashes, tests and limitations, architecture research,
original-content considerations, and a precise resume order.

Confirmed gaps: the runtime is a three-question phrase quiz with two summary
artifacts, not functional lab applications; desktop/browser progress and flags
are separate; reset is not shared; state is in memory. Native URL opening is
unverified and uses mocked `window.open` in tests. The observed active app is
`/usr/bin/netoze-desktop`, whose hash differs from the latest release binary.

Next session: reproduce Start from the normal installed launcher, reconcile
deployment/build identity and native URL opening, then prove one original Red
application and one Blue telemetry workbench before expanding the catalog.
Do not continue generating static question rooms or claim them accepted.
Research pass changed documentation only; no install/restart/reset/commit.

## Scan Buddy content inspection — latest

Scan Buddy now provides a professional service-evidence workflow for selected
OPEN endpoints. Added **HTTP preview — bounded GET /**, alongside connect,
HTTP HEAD and passive SSH banner checks. HTTP preview shows sanitized bounded
response headers and content preview; it never follows redirects, sends auth or
cookies, executes returned content, resolves DNS, or probes arbitrary paths.

The inspection card now displays status, protocol evidence, headers, content,
limitations and the explicit OS-fingerprint-unavailable state. Inspection remains
manual, permission-gated, selected-endpoint-only, bounded to two concurrent
checks and three seconds. No arbitrary scripts or exploit/Nmap aggressive mode
was added.

During deep testing, fixed a Rust non-exhaustive match for the new HTTP preview
and a scheduler-sensitive oversized-response fixture assertion. Final checks:
181 frontend + 5 script tests, typecheck/build/lint/diff pass; native inspection
7/7 and all-targets pass except the intentionally environment-gated external API
and host-journal cases; live-services 10/10 pass. DEB rebuilt/staged; no real
network scan initiated.

## PurpleLabs challenge-room workspace — latest

PurpleLabs Practice Rooms is now the primary Labs experience rather than a
text-only catalog. The catalog contains exactly **20 rooms**: **10 Easy, 7
Medium, and 3 Hard**. Each room is a bounded synthetic fixture with a guided
investigation path: briefing, scope and rules, ordered evidence review, task
progression, challenge questions, progressive hints, scoring, a fictional flag
checkpoint, debrief, remediation, reset/replay, and report export.

The room catalog supports search, difficulty filtering, recommended/difficulty/
time sorting, room status and progress cards, and a professional split workspace
for the selected room. Individual labs and combined exercises remain available
as secondary views. All room evidence is static/offline; no live scan, capture,
exploit, upload, credential, or network action is performed by the room engine.

Validation: 54 PurpleLabs engine tests, 7 ScenarioLabs UI tests, full frontend
suite 190/190, typecheck, production build, lint (existing warnings only), and
DEB rebuild/staging completed.

## Labs product direction — separate Blue Team / Red Team tracks

Labs is now a first-class main-navigation destination and is no longer labeled
Experimental. The primary experience is split into separate Blue Team and Red
Team tracks rather than merging both disciplines into purple rooms.

The new catalog contains six original Blue Team labs and six original Red Team
labs. Blue labs use synthetic alerts, logs and timelines for investigation,
containment and detection decisions. Red labs use fictional, local-only targets
and bounded observations for reconnaissance, validation and remediation. Names,
worlds, evidence, links and challenge content are original; no branded training
platform content is copied.

Each track is independently runnable with ordered steps, evidence, challenge
answers, hints, scoring, reset and export. Red Team remains deliberately
non-operational: no live targets, exploit instructions, credentials, uploads,
arbitrary scripts, external scanning or destructive actions.

Validation: full frontend suite 196/196, track/UI targeted suites 72/72,
typecheck/build passed, lint passed with existing warnings only.

## Advanced Scan Buddy — bounded inspection build

Scan Buddy now has three bounded TCP profiles: Conservative, Balanced and
Intensive TCP. Profile changes invalidate the preview and authorization, and the
existing limits remain 32 targets, 256 ports, 4,096 probes and ≤50 starts/sec.

Added explicit built-in inspection checks for a selected observed OPEN endpoint:
connect, HTTP HEAD and passive SSH banner. Each requires a fresh explicit
permission acknowledgement and manual Inspect action. No arbitrary scripts,
Nmap `-A`, exploit modules, authentication, redirects, DNS, UDP, raw packets or
OS claims are used; OS assessment remains unavailable/unverified.

Deep validation fixed one flaky oversized-response fixture assertion and reran it.
Results: **181 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
native all-targets passed **114 tests** with external API and unavailable host
journal tests intentionally ignored. Scan inspection tests: 6/6 passed. DEB
rebuilt and staged; no real network scan was initiated.

## Local loopback PurpleLabs target

Added a working no-dependency local target path for Practice Rooms. It binds only
to `127.0.0.1` on an OS-assigned/bounded unprivileged port, with explicit start,
stop, status and evidence commands. Safe fictional routes are `/`, `/catalog`,
`/api/products`, and `/training/evidence`; request/response sizes are bounded,
training headers identify the loopback scope, and the target never handles
credentials, executes input, downloads content, scans, uploads or exposes LAN.

Scenario Labs now offers **Synthetic offline** and **Local target** modes with
Start/Stop/URL/Open/Copy/Refresh evidence controls. The adapter was corrected to
use the actual native `purple_team_*` IPC commands and normalize the native
status/evidence shape. Browser mode stays stopped/unavailable and never starts a
process.

Checks: **181 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
native local-target lifecycle test passed; DEB rebuilt and native smoke passed.
The current DEB is staged with hash available in `releases/linux/2.0.0-x64/`;
installation still requires administrator authentication.

## Deep black-box / white-box verification

Completed a deep pass across all added features and fixed two confirmed backend
issues: Capture Buddy investigation no longer double-acquires the analyzer slot,
and port-scan extra-port IPC/native inputs are bounded before de-duplication.

White-box checks: **180 frontend + 5 script tests**, geography/release tests,
typecheck/build/lint/diff pass; native all-targets passed library/helper, auth,
capture/DNS, runtime logs and live-services 10/10. External API and unavailable
host-journal tests remain intentionally ignored. Black-box checks verified native
startup and rendered Dashboard, Watchtower, Overview/globe, Capture Buddy, Scan
Buddy and PurpleLabs room navigation with no blank pages or frontend exceptions;
no capture/scan/upload/privileged action was started. Smoke receipt:
`target/studio-ui-smoke/receipt.json`.

Logs: `target/deep-final-*.log`, `target/all-final-*.log`. Remaining limitations
are intentional: external API validation requires opt-in network testing, host
journal availability depends on the machine, and visual globe zoom/hover is
covered by source/geometry contracts plus smoke startup rather than automated
human-level pointer validation.

## PurpleLabs full verification — current build running

Ran the complete verification after rebuilding the room build. Frontend: **180
tests + 5 script tests passed**; geography/release tests, typecheck, build, lint
and diff check passed. Native all-targets passed library/helper, auth, capture,
DNS, runtime logs and all 10 live-services checks; only explicitly external API
and unavailable host-journal tests remain ignored.

The old deleted process was still running after installation, so it was closed
normally and relaunched from the current installed binary as PID 107154. Running
and installed executable match SHA-256
`97abec1e20d6b5a7be3f4c08cf77f36fe2133cc58346c096b8ee47e98dedd9c2` and remained
alive after 12 seconds. Native package smoke passed without capture/scan.
Receipt: `target/all-final-installed-receipt.json`.

## PurpleLabs room practice mode

Labs now work as local THM/HTB-style practice rooms. Practice Rooms cover all 10
individual labs and 8 combined exercises. Each room has a briefing, difficulty,
estimated time, objective, rules, ordered tasks, locked/unlocked progression,
synthetic evidence viewer, challenge questions, accepted answer variants,
progressive hints, score penalties, debrief, remediation, reset/replay and local
report export.

The existing Individual Labs and Combined Exercises views remain available. Rooms
are strictly synthetic/static: no flags imply access to a real system, and no
network, exploit, credential, capture, upload or real scan behavior exists.

Checks: **180 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
lint has existing unrelated warnings only. Changed:
`src/lib/purpleLabs.ts`, `src/lib/purpleLabs.test.ts`,
`src/components/ScenarioLabs.tsx`, `src/components/ScenarioLabs.test.ts`.

## Combined purple-team labs

Scenario Labs now supports both individual and combined exercises. Added eight
bounded combinations built from the ten synthetic labs: discovery→exposure,
DNS→command, credential→lateral movement, staging→validation, detection
engineering→validation, full attack-path tabletop, network visibility→
investigation, and ATT&amp;CK mapping→report.

Each combination has ordered stages, required cross-stage evidence, partial vs
validated state, bounded replay/reset, evidence links, and local report export.
The workspace has Individual / Combined tabs and preserves the original ten
labs. All content is static synthetic fixture data; no live scans, exploits,
credentials, captures, uploads or backend integrations were added.

Checks: **140 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
lint has no new errors and retains existing warnings. Files:
`src/lib/purpleLabs.ts`, `src/lib/purpleLabs.test.ts`,
`src/components/ScenarioLabs.tsx`, `src/components/ScenarioLabs.test.ts`.

## Regression recovery pass — latest

Audited the recent globe/Overview changes and fixed two confirmed regressions:

- `GlobalIntelView` now treats both `RUNNING` and `LIVE` as active capture, so
  the control shows STOP correctly and active flow arcs are not suppressed.
- SQLite `open_conn()` now guarantees the migration schema before read/write
  paths; app config reports distinct SQLite and DuckDB paths. This fixes the
  standalone audit-chain `no such table: audit_log` failure.

Also made live verification truthful: private GeoIP expects the explicit
`local-classification` source, and packet-capture live tests skip when Linux
`CAP_NET_RAW` is unavailable rather than pretending capture was tested.

Verification: frontend **128 tests + 5 script tests passed**, geo/release tests,
typecheck, build, lint and diff pass. Native all-targets passed library/helper,
auth, capture, DNS, live-services (10/10) and other safe tests; the runtime-log
test passed with its required isolated `XDG_DATA_HOME`. External API validation
and host journal remain intentionally ignored. New DEB built, hash verified and
native smoke passed: `6ef02053a48343f7da6cf3299f62e4f7e38f9dcbb4bca56ef2453c43a7e71317`.
AppImage was not claimed because its packaging step timed out.

The corrected DEB is staged; the currently installed/running process is not
updated until administrator authentication installs it.

## Latest reliability pass — source and DEB verified, deployment pending

Globe reliability fixes include bounded camera distance, hemisphere-aware bundled
geography selection, tiny markers with separate hover targets, bounded endpoints
and arcs, drag/click handling, grayscale rendering, and cleanup. Overview and
Watchtower now distinguish browser/unavailable, stale, loading and empty sources.
Unsupported town/road/building detail is not generated.

Actual verification: `npm test`, `npm run test:geo`, `npm run test:release`,
`npx tsc -b --pretty false`, `npm run build`, `npm run lint`, and
`git diff --check` completed successfully (lint warnings remain). Linux native
release compilation and DEB bundling succeeded. AppImage packaging repeatedly
timed out; do not claim the new AppImage is complete. DEB-only staging succeeded.
Isolated native startup screenshot smoke passed; this is not an interactive
globe visual/zoom verification. Latest DEB SHA-256:
`d5b265adf672087cd33d59f502d5395c63ab4e4f8b341b668454811705520fef`.

Noninteractive installation (`sudo -n dpkg -i`) was blocked because a password is
required. Therefore the installed app has NOT been updated to these changes.
Next: authenticate installation of the staged DEB, then verify interactive globe
hover/zoom in the actual desktop before calling the user-visible result complete.
Logs: `target/final-run-*.log`; smoke receipt: `target/studio-ui-smoke/receipt.json`.

## Globe pixel-burst fix installed and running

The saved globe pixel-burst fix is now installed. Package and installed
executable match SHA-256
`206321d9c31df62face9bee4c870265a82d9a7599c834f326754640012d67a48`.
NET0ZE relaunched as PID 243110 and remained alive after 12 seconds. Receipt:
`target/asap-globe-installed-receipt.json`. No capture or scan started.

## Globe pixel-burst fix — saved checkpoint

The screenshot exposed an extreme-zoom failure: the 2048px country texture was
being viewed too close, making outlines burst into pixels. Fixed by bounding the
closest camera distance at **1.85**, raising the country texture to 3072×1536,
and retaining mipmaps, linear filtering and capped anisotropy. Tiny bounded dots,
hover-only labels, zoom stages and monochrome styling remain. No data or backend
behavior changed.

Checks: full frontend/script tests, typecheck/build/lint/diff pass; targeted
Globe3D tests 8/8; DEB/AppImage rebuilt and manifest-verified; native smoke passed
without capture/scan. Latest DEB
`61cf06844b2d0da7694b27b3ec39b14f6698563b79f6e306c66189f094ce630f`; AppImage
`1bd7a266bfa7f4df10c741ce75ec3510e86859c44d7a32db3d148fd2b7a5e37f`.
This checkpoint is saved; the existing installed/running app remains the prior
build until the new DEB is installed.

## Globe clutter fix installed

The corrected globe/primary Overview DEB is installed and running. Package and
installed executable match SHA-256
`8c20ee50989b4cbc48e474c9ed1dec368387e1913c7c78898678bdf9482649b1`.
NET0ZE relaunched as PID 220057 and remained alive after 12 seconds. Receipt:
`target/overview-globe-clean-installed-receipt.json`. No capture or scan started.

## Overview promoted and globe clutter removed

Overview is now a primary Monitoring item, no longer inside Experimental.
Evidence and Graph remain Experimental until separately verified. The globe no
longer renders persistent region/city text sprites: only tiny bounded dots and
invisible hover targets remain, with one hover tooltip for the current country,
region, city/capital or endpoint. This removes the screenshot's label pile-up.
Country outlines and continuous zoom remain. Empty/unavailable snapshot states
stay explicit rather than appearing as successful API results.

Checks: **122 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
Linux packages rebuilt and manifest-verified; native smoke passed with no capture
or scan. Latest DEB `ae8f485dcc7d7660295c0f1f95e49993dd52cc72dd03e78a2c2dbab5331d1de8`;
AppImage `00a1997df57da96b8f4f81cfb04f5353ce368230d8b0c360beb485ab0487567e`.

## Neutral globe labels build installed

The globe-label and neutral-Overview DEB is installed and running. Package and
installed executable match SHA-256
`1ef15f50c135632606262a869a7b37ce123da8b8371e35da485d370412431925`.
NET0ZE relaunched as PID 201634 and remained alive after 12 seconds. Receipt:
`target/neutral-globe-installed-receipt.json`. No capture or scan started.

## Globe labels and neutral Overview update

Deep zoom labels are now visible without making dots large: up to 80 decluttered
white/gray region labels at REGIONS zoom and up to 80 city/capital labels at
CITIES zoom. Dots remain tiny; invisible hit targets preserve hover details.
Labels use geographic buckets to avoid a text burst, and their textures are
filtered/disposed safely. Country names remain hover-only at WORLD level.

Removed purple/violet styling from the Overview and Endpoint map controls,
replacing it with black/white/gray. The Overview title is now neutral
`OPERATIONS OVERVIEW`; semantic severity colors are retained only where useful.

Checks: full frontend/script tests, typecheck/build/lint/diff pass; Linux packages
rebuilt and manifest-verified; native smoke passed without capture/scan. Latest
DEB `2a4b414a5aa9427bd40910c2a23a703e8a2c2cba13c0a77439cc95f676a1a936`;
AppImage `82b7e66d31d6247981eff424d9c470c4819083cbce8be19b657fa4507f3765c8`.

## Final globe quality build installed

The final globe quality DEB is installed and running. Package and installed
executable match SHA-256
`3dbbea14cefd38d965abfe92ccbad1f6cc1278e574c523f022494080f0fb1a3d`.
NET0ZE relaunched as PID 181945 and remained alive after 12 seconds. Receipt:
`target/globe-final-installed-receipt.json`. No capture or scan started.

## Globe quality correction — latest

Fixed the reported globe problems: visible dots are now tiny with separate
invisible hover hit areas, so labels are easy to trigger without oversized
markers. Country names appear on hover at every zoom level; region and city/
capital names appear on hover at their deeper zoom stages. Hover precedence now
handles endpoints, regions, cities and front-facing country surfaces correctly.
Reduced pixel bursting with antialiasing, DPR capped at 1.25, lower-cost globe
geometry, linear/mipmap texture filtering and capped anisotropy. All globe UI is
black/white/neutral; no purple or cyan styling was reintroduced.

Research references: Google Maps collision/zoom label guidance, Mapbox label
placement/zoom guidance, Apple MapKit annotation clustering, and Three.js
WebGLRenderer/Raycaster documentation. Dataset boundary remains explicit:
bundled countries/regions and city/capital points only; no town data invented.

Checks: full frontend/script tests, typecheck, build, lint and diff pass; Linux
DEB/AppImage rebuilt, hashes verified, native smoke passed without capture/scan.
Latest DEB `1ae608bb2e43c9b6f6a367cf431bc0cc7f671f43c2c6e2f296616cf3fe7e3feb`;
AppImage `45b05a7e4191e055776d1d6dc36a1506ef4c675d26fb1096a44b92adde743eca`.

## Monochrome globe build installed

The latest globe hover-label build is installed and running. Package and
installed executable match SHA-256
`71e9c95298f26bfff82c6d0006b63dc8895e40f68c349effdc7e949daae3c04b`.
NET0ZE launched as PID 162001 and remained alive after 12 seconds. Receipt:
`target/globe-monochrome-installed-receipt.json`. No capture or scan started.

## Globe monochrome hover labels

Globe styling is now strictly black/white/neutral. Country names are no longer
always rendered as cluttered labels: hover a country boundary at world zoom to
see its name. Zooming the same globe reveals bundled region markers, then city /
capital markers with hover labels. Country boundaries remain visible and country
selection remains an overlay; no country-only replacement occurs. Town data is
not invented because it is not bundled.

Research basis: Google Maps documentation describes zoom-dependent feature
customization and progressive detail; Apple MapKit documentation describes map
zoom controls, annotations and overlays. This implementation applies the same
progressive-disclosure principle to local bundled geography.

Checks: **122 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
Linux DEB/AppImage rebuilt, manifest-verified and native smoke-tested. Latest
DEB SHA-256 `d3fd2f979940aadc860e27ad775f64f6e1b6e28c4234740fe509621519ea3eb7`;
AppImage `3574631258f52e8ea8b43edf037f2fdb9b49857c66390b8c2e49ce1cb0e6c1b3`.

## Globe zoom build installed and running

The globe zoom/context build was installed successfully. Package and installed
executable match SHA-256
`8c98820f96a26c301431e3d14a9e70ea3ce783123ea2c4f0a2d0853f2cfaa9e9`.
NET0ZE relaunched as PID 148508 and remained alive after 12 seconds. Receipt:
`target/globe-zoom-installed-receipt.json`. No capture or scan started.

## Purple-team Overview installed and running

The latest DEB installation completed successfully. Package and
`/usr/bin/netoze-desktop` match SHA-256
`3f848a33754fffb2094afbf14d0b094af44cef526680e5ee9785281e3b64f2f3`. NET0ZE
was launched as PID 131447 and remained alive after 12 seconds. Receipt:
`target/purple-overview-installed-receipt.json`. No capture or scan started.

## Purple-team Overview and automatic inventory — latest

Overview now has a compact purple-team operations summary: host/OS/resources,
passive local IP/interfaces, current-session flows/findings/capture metrics,
cached device observations, source state/freshness, and navigation to Dashboard,
Capture Buddy, Scan Buddy and Watchtower. The endpoint map and Findings sections
remain available below; long status text is collapsed into technical details.
No ATT&amp;CK or security coverage score is inferred from widget counts.

Watchtower automatically loads passive local interfaces/neighbors, refreshes on
visibility, shows per-source records and labels records separately from detection
or network coverage. Strict native inventory adapters preserve unavailable/error
states and avoid leaking IPC payloads.

Research basis: MITRE Adversary Emulation Library emphasizes repeatable,
authorized behavior tests and telemetry evidence; CISA/ASD event-logging guidance
emphasizes visibility and reliable source context. Sources reviewed externally:
MITRE Center Adversary Emulation Library README and CISA “Best Practices for Event
Logging and Threat Detection”.

Checks: **115 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
Linux packages rebuilt and verified. Latest DEB SHA-256
`4b02a4bf2dac0950646571c4499f213a0beb2f15ebdacbf9cd4ee92ba9cede5a`; AppImage
`7d3c85c335f18e8983eec8b8248a0609abc6fd3880ab2d18e41438b446897c32`.

## Watchtower automatic inventory and working coverage

Watchtower now automatically loads bounded local interface and neighbor inventory
when opened and refreshes passive local data when the view becomes visible.
Manual buttons remain as retry controls. Coverage now counts five actual loaded
source groups: flows, findings, graph, interfaces and neighbors; the dashboard
also shows each count and distinguishes not-loaded/unavailable from zero records.
No scans, probes, uploads, inferred values or admin access were added.

Checks: **110 frontend + 5 script tests passed**, typecheck/build/lint/diff pass;
Linux DEB/AppImage rebuilt and manifest-verified. Latest hashes: DEB
`324e2e600f6809089167ddeaac48653f7061f6ffa0d7ce5458d3c425cace57c3`, AppImage
`6967a9f80b3f433dd3a49f0c9c03ce8407952b2d5764b4557d0bd4d9cfa85d30`.

## Watchtower empty-state fix

The supplied screenshot showed Watchtower technically rendering but displaying
empty inventory because reads only happened after button clicks. Watchtower now
performs one bounded passive read of native interfaces and existing local device
records when the view opens, while retaining manual refresh buttons. It shows
Loading / unavailable states, guards unmounts and late responses, and still does
not scan, probe, upload, infer values or request admin access.

Checks: full frontend/script tests passed, typecheck/build/lint/diff passed;
Linux DEB/AppImage rebuilt and manifest hashes verified; native screenshot smoke
passed without capture or scan. Latest packages are staged in
`releases/linux/2.0.0-x64/`.

## Futuristic Dashboard installed and running

The new Dashboard DEB was installed successfully and verified against the
installed executable. The previous old process (PID 63132) was closed normally;
the rebuilt Dashboard is running as PID 80842 with SHA-256
`b814612fcd3771c0ff2c3b7341e706a12e7232702d2bb4eb184606e31f0f8eb1`.
Receipt: `target/dashboard-installed-receipt.json`. No capture or scan started.

## Dashboard rename and network visibility — latest source

The attached screenshot was from the old installed executable, which still shows
`Host & Logs`. The current source and newly staged build now use **Dashboard**.
The page is black/futuristic but simple: host identity, OS/architecture,
CPU/RAM, privilege, interface count, and a prominent **Network snapshot** are at
the top. Network snapshot shows local IP, MAC, primary interface and active
connected-device count from native interface/local-device data. Detailed logs,
TCP connections, runtime logs, readiness, reports and event tables are grouped
under **Logs & diagnostics** at the bottom.

Checks: 110 frontend + 5 script tests, typecheck, build, lint and diff pass;
Linux packages rebuilt and manifest-verified. Latest DEB SHA-256
`25e8c0ad956770d17b4cca913b37f8cfe9750ec961eae6fbb9cf51894766eee4`; AppImage
`244c4e4019684957145ccbe5358b1ce412e06416ab7ade04674050c30592bfdb`.
The system-installed binary remains older until the new DEB is installed.

## Host dashboard and logs layout

Host &amp; Logs now leads with a distinct dashboard overview: identity, platform,
privilege, observed resources, host system, readiness, live sources, report and
interface throughput. Detailed Runtime Logs, TCP connections and native event
tables are grouped in a clearly separated section at the bottom. Existing native
data, refresh cadence, errors and truthful unavailable states are preserved.

Checks: **110 frontend + 5 script tests passed**, typecheck/build/lint/diff pass
(lint 0 errors, 10 existing warnings). Linux DEB/AppImage rebuilt, hashes
verified, and native screenshot smoke passed without capture or scan. Receipts:
`target/host-dashboard-*.log` and `target/studio-ui-smoke/`.

## Watchtower visual polish

Refined Watchtower without changing its dark theme or behavior. The page now has
a tighter hero, clearer coverage cards, compact recent-signal rows, stronger
host/neighbor inventory hierarchy, responsive tables, and shorter boundary copy.
Important provenance, authorization, and unverified-service limitations remain;
repeated explanatory text was removed. Inventory actions remain explicitly
user-triggered with no automatic polling or privilege requests.

Checks: full frontend/script tests passed, TypeScript/build passed, lint has 0
errors and 10 existing warnings, and `git diff --check` passed. Receipts:
`target/watchtower-polish-tests.log`, `target/watchtower-polish-build.log`,
`target/watchtower-polish-lint.log`.

## Watchtower local network inventory

Watchtower now has explicit **Load local interfaces** and **Refresh local
neighbors** actions. It can display the host's reported IPv4/IPv6 addresses,
interface, MAC and link status, plus same-network neighbor records with IP, MAC,
hostname/vendor when supplied, active state and first/last seen timestamps. It
does not run on mount, infer CIDRs/details, upload data, or request admin access.
The neighbor action uses existing local discovery evidence. Port/service details
remain explicitly tied to an authorized Scan Buddy job and remain unverified.

Checks: Watchtower targeted tests 4/4; full frontend suite **107 + 5 script
tests passed**; typecheck/build/lint/diff pass. Linux DEB/AppImage rebuilt,
manifest hashes verified, and native screenshot smoke passed without capture or
scan. Latest package hashes: DEB
`596bb1b0731b2d0a4c197e3cc89ef5d0f5c2ff1c666a7f140d15ff573bcd42cc`, AppImage
`d93d5ab22ca44592a434f21db68bfa89cedcfe7e0ed3715e31edb5c4208891f0`.
The updated package is staged; system installation was not requested because it
would require administrator authentication.

## Native test harness continuation

Live capture integration tests now detect missing Linux `CAP_NET_RAW` and print
an explicit skip before opening a packet socket; they do not request a password
or hide a verified capture result. Native compilation and the safe test set pass:
library/helper **105 + 1**, auth, capture test harnesses, runtime logs and other
non-network integration checks pass; the host journal test remains intentionally
ignored where unavailable.

The complete `live_services_verify` sweep still exposes environment/product
boundary findings rather than being marked green: packet parsing needs
`CAP_NET_RAW`, audit CRUD needs its initialized test database, and the private
GeoIP assertion expects the old `local` source while production now returns the
more explicit `local-classification` source. These are recorded in
`target/continue-native-tests.log`; no live capture or scan was started.

## Full rerun verification — 2026-10-06

Stopped the running NET0ZE process normally before rerunning checks. Frontend
suite: **107 tests + 5 script tests passed**; TypeScript, production build, lint
(0 errors, 10 existing warnings) and `git diff --check` passed. Native library
and helper tests: **105 + 1 passed**. Safe native integration checks passed for
auth and runtime logs (runtime test used its required isolated test-data path).

The complete native integration sweep exposed two expected environment-gated
capture tests: `capture_dns_verify` and `capture_verify` cannot open a live packet
socket without `CAP_NET_RAW`; no privilege escalation was requested. One parallel
port-check assertion was flaky; the focused single-threaded rerun passed. External
API verification remains intentionally ignored.

Linux DEB/AppImage were rebuilt and staged. Manifest verification passed:
DEB `a5a308b3a29637dfea21e7508344e7e7a21e2f3923f850e2b9596b8b5f54be91`;
AppImage `d898358f570bac2ccdd78f9833b5ee91ec738974fbafad24875a67d7463d2a35`.
Isolated native screenshot smoke passed with no capture or scan started:
`target/studio-ui-smoke/capture-workspace.png`. Logs are under `target/final-rerun-*.log`.

## Watchtower local observation dashboard

Added a new first-class Monitoring view named **Watchtower**. It is a bounded,
local snapshot dashboard inspired by a lookout/watchtower concept, not an
omniscient or threat-verdict feature. It derives coverage, active-flow, finding,
graph-node and graph-edge metrics only from data already loaded by NET0ZE, shows
up to five recent findings, and states that it does not scan, upload or observe
everything. It adds no backend calls, polling loop or privileged operation.

Changed: `src/components/Watchtower.tsx`, `Watchtower.test.ts`, `Sidebar.tsx`,
`App.tsx`, and `AppShell.test.ts`. The new view reuses the existing lifecycle
streams and is the first Monitoring navigation item; Capture Buddy remains the
default startup view.

Checks: **107 frontend/mounted + 5 script tests pass**, build pass, typecheck
pass, lint 0 errors/10 existing warnings, diff check pass. Linux DEB/AppImage
rebuilt and manifest hashes verified. Screenshot smoke passed without starting
capture or scan. A user-level AppImage launch was attempted without requesting
a password; the packaged artifact is ready, while system installation of this
new Watchtower build remains separate from the already-installed black build.

## Black UI refresh — installed and verified

Replaced the blue/navy Studio shell and monitoring workspace styling with black,
charcoal, neutral gray and white. Capture Buddy, Capture Investigation and Scan
Buddy now use the same monochrome surfaces; semantic warning/severity colors are
preserved. The actual native smoke screenshot is at
`target/studio-ui-smoke/capture-workspace.png`.

Checks: **105 frontend/mounted + 5 script tests pass**, build pass, lint 0 errors
with 10 existing warnings, TypeScript and targeted component checks pass, and
`git diff --check` passes. Linux DEB/AppImage rebuilt and manifest hashes verified.
The black DEB is installed and matches the running executable SHA-256
`9df6f5f0343d5214351e047e70377591e9af86e99680cd1fdcbef081660630d2`; updated
NET0ZE reopened as PID 51371. Receipt: `target/black-ui-installed-receipt.json`.

The additional standalone Cargo test command was attempted but is blocked by the
environment lacking `gobject-2.0 >= 2.70` development metadata; the release build
itself completed successfully. No capture or scan was started.

## Final Studio UI package installed and reopened

The first install attempt used the wrong workspace path and failed. The corrected
DEB was installed successfully: package status is `install ok installed`, and the
installed executable matches the package exactly. The previous process was an
older deleted executable; it exited normally and NET0ZE was reopened as PID
36873. Running and installed executable SHA-256:
`adbc40269b23962989d09ac012fb8f5a6d2f76258e9f0385ae69b4b988e5766f`.
Receipt: `target/studio-ui-installed-receipt.json`.
Native visual interaction remains unverified; no capture or scan was started.

## Studio UI redesign — latest source, pending package

User wants clearly visible whole-app UI and less copy. Implemented single-header
Studio shell, readable monitoring sidebar/navy workspace, removed clock/verbose
runtime strip, original branding, Capture Buddy initial view. Core capture/scan
workspaces compact and stage-oriented with short empty states and collapsible
technical guidance. Permission/evidence/privacy warnings retained, no numbered
titles. Prior data/lifecycle/export functionality preserved.
**104 frontend/mounted + 5 script pass**, build/TypeScript pass, lint zero errors/
ten existing warnings, diff pass. Receipts `target/studio-ui-tests.log`,
`target/studio-ui-build.log`, `target/studio-ui-lint.log`.
Linux build underway `target/studio-ui-linux-build.log`; don't claim installed.
Next run `python3 scripts/studio-ui-smoke.py`, inspect returned native screenshot,
then verify package/install/reopen. Script isolates XDG data/display and performs
no scan/capture. No existing-process action performed in this source phase.

## UI refresh installed and reopened — latest runtime

Final top-first UI Linux build passed; DEB/AppImage hashes independently match
manifest. DEB SHA-256 `a54b12c1c2e570e58ae151d3f8e43d9db4e15d6ce1edd66ac39aa2e2eedca4aa`;
AppImage `f76c7fd8023de6520bdc8b16baf7e581e70b8fde65274badacf8aa776897a4d7`.
User could not see changes because the installed/running executable was older.
OS-authenticated install verified; system status install ok installed, executable
matches new DEB extraction. Old PID 86966 confirmed deleted executable, closed
normally (no forced kill); reopened new app PID **91154**, alive after 12 seconds.
Running hash `08d57489d9992a64d6abcbf0acf51b6014745e6f29a5ed988d63a03afc46dd7d`.
Receipt `target/capture-ui-refresh-installed/receipt.json`. Capture capability intact.
No agent-started scan/capture; native visual click/downloads still unverified.
Open Capture Buddy: investigation now directly below header; generate a model
from a recording to see Conversations/Timeline/Review tabs, search and bookmarks.

## Top-first Capture Buddy UI refresh — newest source state

Investigation immediately follows header; compact source/search/table and packet
evidence near top. Named active-only Conversations/Timeline/Review tabs, newest-first
timeline, memoized metadata search/sort, 50-row pages and max100 temporary packet
bookmarks. Evidence links now fetch off-page packet details; session/stale/StrictMode
guards fixed. No numbered headings (Scan Buddy also cleaned); actual metrics remain.
Markdown exports escaped, unknown/null metadata preserved, safe download cleanup.

Checks: **101 frontend/mounted + 5 script pass**, build pass, lint zero errors/ten
existing warnings, diff pass. Receipts `target/capture-ui-refresh-tests.log`,
`target/capture-ui-refresh-build.log`, `target/capture-ui-refresh-lint.log`.
Native engine unchanged; no new native test claim. Linux rebuild underway
`target/capture-ui-refresh-linux.log`; UI changes not yet installed.
Full inventory and boundaries: newest `docs/BACKEND_LOGBOOK_IST.md` entry.

Latest staged Capture Investigation DEB installed on user request; package status
and installed executable hash independently verified:
`f579131113438cf30913ae15d195fc595152c554dccb30b9044d0220b9a24513`.
Capture helper capability retained. Existing app not terminated; reopen to load
the updated executable/frontend. Native investigation click/export checks remain.

## Capture Buddy product continuation — latest

User asked to make the project newer, more capable and more useful without making
Capture Buddy feel like a Wireshark copy. Direction is now explicit in
`docs/CAPTURE_BUDDY_PRODUCT_DIRECTION.md`: local-first evidence workspace,
explainable synthesis, bounded workflows and reproducible exports.

Implemented in this continuation:
- Scan Buddy native backend hardening: real executor wakers, prompt cancellation,
  fair scheduling, mapped-address canonicalization, strict input grammar, finite
  connection reasons, 10-minute deadline and bounded shutdown.
- Private persistent Scan Buddy journal with safe restart recovery, exclusive
  ownership, retention/size limits and UI storage status/warnings.
- Capture Buddy **Investigation Brief**: native on-demand bounded summary of
  protocol mix, top talkers/conversations, DNS questions, byte totals, time bounds
  and explicit review notes. No threat verdict/decryption/upload.
- Capture Buddy UI button/card and product direction document for future
  conversation board, evidence timeline, explainable anomaly queue, case bundle,
  capability matrix and safe replay.

Checks: native **103 library + 1 helper pass**; frontend **94 + 5 script pass**;
build pass; lint zero errors/ten existing warnings; diff check pass. Receipts:
`target/capture-next-native-2.log`, `target/capture-next-frontend-3.log`,
`target/capture-next-build.log`, `target/capture-next-lint.log`.
Final package rebuild is still required. No live capture/public scan/upload or
data deletion. Product layer is implemented; native packaged click verification
and full case/timeline/anomaly layers remain next bounded slices.

Package completion: `npm run dist:linux` **PASS**;
`releases/linux/2.0.0-x64/manifest.json` generated `2026-10-05T17:56:05.922Z`.
DEB 11022458 bytes, SHA-256
`106e1f93224cf622c8d8d2a6d9596d604df4fead054008083c91e9d180947739`.
AppImage 115845624 bytes, SHA-256
`af0f51e2be3ef56921b42c4e6e279489751ecd00e459bda4c2b1b87d382ddd48`.
Both hashes independently verified against the staged files. Packages are staged;
not installed in this continuation.

Latest Capture Investigation slice adds a versioned evidence-only case-bundle JSON
export; raw recordings remain separate. Latest staged installer hashes after this
slice: DEB `e6d1fd9c6d9119f50715a6a5f03e1d2bfa7700313d22308703dae78a5b5e56bc`,
AppImage `37a6c6b098e900d2a77cc05812b93bb9b1494300f98a6beb5c71cb9157a64dab`.

## Scan Buddy user-reported failure — latest remake

User says not working; requested failing step/screenshot/error. Safe installed
logs show successful preview/history and no observed Start. Original mounted
mocked-IPC flow passes; **exact user failure/root cause not reproduced**.

Remade Scope → Preview → Start controls together with explicit disabled reasons.
Preview is traffic-free/no consent required; Start still requires permission.
Checkbox preserves preview; scope edits invalidate/reset consent. New observable
workflow controller owns action/poll/history state. Adapter adds eight-second
deadlines, lane recovery, payload validation and uncertain-write warnings/no retry.
Happy DOM dev-only enables mounted React tests, not native-webview proof.

Checks: **94 TypeScript/render/mounted + 5 script PASS**, build pass, lint zero
errors/ten existing warnings, diff check pass. **Five native scanner tests rerun
PASS**, loopback only. Receipts `target/scan-buddy-repair-tests.log`,
`target/scan-buddy-repair-build.log`, `target/scan-buddy-repair-lint.log`,
`target/scan-buddy-repair-native-tests.log`. Linux rebuild passed
(`target/scan-buddy-repair-linux-build.log`); installer hashes match manifest.
Isolated extracted-DEB startup passed (`target/scan-buddy-repair-package/receipt.json`).
OS-authenticated installation terminal opened; install/reopen not yet verified.
Update: installation/reopen **verified**. System package reports install ok
installed; executable hash matches remade DEB
`8c2ecf9b1c0d82932a7df5ed4be7f7d31422eb8b4cc0acb4ba73d1073ba4f777`.
Old PID 39471 confirmed deleted old executable, no capture helper running, latest
observed scan history empty. Closed normally and reopened updated app, PID 54757,
alive after 12 seconds; running executable hash verified. Receipt
`target/scan-buddy-repair-installed/receipt.json`. No scan initiated by agent.
User's exact native flow remains unverified; ask them to repeat it and share any
visible blocking reason/error. Do not label the unspecified original failure fixed.
Existing runtime/data/permissions preserved. Full inventory in newest logbook entry.
Next: verify installation/reopen after OS authentication, then reproduce the
user's failing native flow. Don't claim repaired before that same flow is checked.

## Scan Buddy — latest implementation, 2026-10-05

User requested a new independent scanner replacing Network Engine, explicitly
without Nmap dependency. Implemented native Rust/Tokio TCP-connect jobs and a
new **Scan Buddy** workspace. App routing/sidebar now use ScanBuddy; old internal
`network_engine` key is retained, legacy HybridIntel is unrouted. Own managed
scanner state and five commands wired in bootstrap; exit/drop cancels pending work.

Supports literal IPv4/IPv6, small IPv4 CIDRs, ports/ranges/presets, authorized scope
preview, bounded background scan, progress/cancel, results/filter/search/sort,
eight-job in-memory history and JSON/CSV/Markdown export. No external scanner or
new dependency; not full Nmap parity. Service labels are port hints, not verified
identities. Limits: 32 targets, 256 ports, 4,096 attempts, 1–16 workers, 100–2,000 ms
timeout, <=50 connection starts/sec. No automatic scan, DNS/UDP/SYN/OS/NSE/banner
probes. Full architecture/data contract: `docs/SCAN_BUDDY.md` and the newest entry
of `docs/BACKEND_LOGBOOK_IST.md`.

Native checks: 84 library + 1 helper tests pass including five new loopback scanner
tests. Final frontend **80 TypeScript/render + 5 script tests pass**; build passes,
lint zero errors/ten existing warnings and diff whitespace check passes.
Final release verification receipts will be recorded on completion.
Receipts: `target/scan-buddy-native-tests.log`, `target/scan-buddy-frontend-tests.log`,
`target/scan-buddy-frontend-build.log`, `target/scan-buddy-lint.log`.
Initial Linux rebuild passed (`target/scan-buddy-linux-build.log`). Final rebuild
underway to include last CIDR/export refinements (`target/scan-buddy-linux-final-build.log`).
No install/public or LAN scan/live capture performed. Native clicks/downloads and Windows remain open.

### Completing installation on user request

**COMPLETED — 2026-10-05 16:46 IST:** final DEB/AppImage rebuild and staging passed;
checksums independently match `releases/linux/2.0.0-x64/manifest.json`.
System install verified `install ok installed`; `/usr/bin/netoze-desktop` matches
the final extracted DEB executable SHA-256
`10815e6d1cae99d5db470cd8b4db664f46a6313fc2c3acec6bd7276c4a0471ac`.
Capture helper remains root:netdev 0750 with cap_net_raw=ep. No helper was running
before restart. Verified old installed process 25603 used a deleted executable;
closed normally with SIGTERM (no force kill), then reopened `/usr/bin/netoze-desktop`.
New PID **39471**, alive after 12 seconds and its `/proc` executable hash matches
the final package. Receipt `target/scan-buddy-installed/receipt.json`.
User data not cleared or migrated destructively; no scan or capture started.
Native clicked/download flows remain unverified; current implementation is bounded
TCP connect, not full Nmap parity. No Windows rebuild/runtime claim.

Latest installers:
- `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`, 10923094 bytes,
  SHA-256 `3d4c7321d49757acef6e8c53b04370fe27c2cb6743bcac881ed0951e62180dbd`.
- `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage`, 115751416 bytes,
  SHA-256 `c4b3384e75a5addb6020e0e6a16762310648ff8c5667cc39bf87128a0ee4f567`.
Final build receipt `target/scan-buddy-linux-final-build.log`; final extracted DEB
startup receipt `target/scan-buddy-package-smoke/receipt.json`. AppImage integrity
and build passed; its extracted runtime was not rerun for this phase.

Historical installation-start note below (superseded by completion above):

Final DEB is built; hash `3d4c7321d49757acef6e8c53b04370fe27c2cb6743bcac881ed0951e62180dbd`.
Its independent Scan Buddy command marker and isolated 12-second startup passed,
with SQLite/private logs initialized (`target/scan-buddy-package-smoke/receipt.json`).
An OS terminal was opened to authenticate `sudo dpkg -i` on
`src-tauri/target/release/bundle/deb/NET0ZE_2.0.0_amd64.deb`; sudo needs the user's
password entered there, never in chat. Installation has not yet been independently
verified. Existing `/usr/bin/netoze-desktop` process was not stopped; close/reopen
after installation. Final AppImage packaging/staging still awaits its receipt.

## Continuation — 2026-10-05 15:59 IST (latest)

User asked to continue work. Capture Buddy frontend now uses synchronous action
leases, scoped lifetime/session/view/detail ownership and serial polling across
effect restarts. Query/page changes invalidate stale details; operation errors
remain visible; replaced/unmounted sessions retain close cleanup. Files:
`src/components/CaptureBuddy.tsx`, `src/components/captureWorkflow.ts` and tests.

Added **Host & Logs → Local host report** with on-demand native source collection,
partial failure/provenance/timestamps, default identifier redaction, explicit
sensitive-data opt-in, bounded preview and Markdown/JSON downloads. It reads
system/interfaces/TCP/readiness/log status only, not payloads or log messages.
Files: `src/components/HostReport.tsx`, `src/lib/hostReport.ts`, tests and mounting
in `src/components/SystemLogs.tsx`. Full limits and inventory are in the 15:59
entry of `docs/BACKEND_LOGBOOK_IST.md`; usage in `docs/MONITORING_AND_LOGS.md`.

Checks: `npm test` **68 TypeScript/render tests + 3 script tests pass**;
`npm run build` passes; lint has zero errors and ten existing warnings;
`git diff --check` passes. Receipts: `target/continuation-tests.log`,
`target/continuation-build.log`, `target/continuation-lint.log`.
No Rust changes; previous native test receipts are not freshly rerun.
Linux rebuild **PASS**, receipt `target/continuation-linux-build.log`. Current
staged artifacts are `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb` and
`releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage`; checksums independently
match the current manifest. DEB SHA-256:
`c36fee9bebe1f0461fcc471ef57a18548dd6b867f99000b54809db87aea5df72`;
AppImage SHA-256:
`2fa963921d93b45bb36a28776e65128d290f8c9de3c55e38d7e48428d687ed2e`.
Isolated extracted-DEB launch under X11/Xvfb passed: alive 12 seconds, isolated
SQLite and private logs initialized. Receipt `target/continuation-package-smoke/receipt.json`.
Only that test process group was stopped; packages remain staged, not installed.
Current AppImage build/integrity passed; extracted launch was not rerun this phase.
No install/capture/scan/dependency install/git writes/existing-process termination.
Native click/download/capture and Windows runtime verification remain needed.

## Resumed improvements — 2026-10-05 (authoritative; supersedes saved pause)

User authorized ongoing improvements, basic network-speed monitoring, cleanup and
tracking all changes in the existing logbook. Prior uncommitted work was preserved.
No reset/commit/push, dependencies installed, active scan, live capture, privileged
setup action or existing installed-app termination was performed in this phase.

### Current result

- Host & Logs has selectable passive per-interface RX/TX Mbps and KiB/s, recent
  graph, view-session byte totals and peaks, reset/gap/error/stale states and
  selected-interface CSV export. This is **not an Internet capacity speed test**.
- Application logs have an on-demand native reader and snapshot download. New
  runtime files are a five-slot 1 MiB IST ring with private Unix permissions,
  single-writer locking and safe structured fields only. Legacy backend logs stay
  intact, outside the new retention bound. Secrets and payloads are excluded.
- Capture Buddy import/search/export/start/stop/completion now emit safe operation
  outcome records without changing the engine or helper permission scheme.
- App views are lazy-loaded where optional; flow state is capped/deduplicated,
  streamed updates batched, polling nonoverlapping/scoped to visible consumers,
  and delayed subscriptions clean up after navigation. Optional unfinished views
  are grouped under Experimental; features were not destructively deleted.
- Removed decorative/unproven statuses and leftover Vite tab branding.
- Full file inventory and change records: **`docs/BACKEND_LOGBOOK_IST.md`**.
  Usage/data/privacy guide: `docs/MONITORING_AND_LOGS.md`.

### Verification in this phase

- `npm test`: 53 TypeScript/render checks plus three script/IPC/release checks pass.
- `npm run build`: pass; existing lazy overview large-chunk and Tauri import warnings.
- `npm run lint`: zero errors, ten existing warnings. `git diff --check`: pass.
- Local SDK `cargo test --manifest-path src-tauri/Cargo.toml --release --lib
  --bin netoze-capture-helper -- --test-threads=1`: 79 library + 1 helper pass.
- Local SDK `cargo test --manifest-path src-tauri/Cargo.toml --release
  --test runtime_logs_verify -- --test-threads=1`: one integration test passes;
  tracing events were read back through registered native command functions.
- Receipts: `target/improvement-frontend-tests.log`,
  `target/improvement-native-tests.log`, `target/improvement-runtime-verify.log`.
- Production-preview HTTP serves correctly; built-in browser open timed out with
  no tab returned. Browser/native interactions and downloads are not yet verified.
- Existing installed helper is root:netdev 0750 with `cap_net_raw=ep` on read-only
  metadata inspection. No live recording was run; metadata is not a capture test.
- Final `npm run dist:linux`: pass. Receipt `target/improvement-linux-final-build.log`.
  Final frontend entry is 268.29 kB / 82.95 kB gzip. Both staged installer hashes
  independently match `releases/linux/2.0.0-x64/manifest.json`.
- Latest DEB: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`;
  SHA-256 `a42bb24594c1c78359f1211e0c716880ec3667b7bce63e45725ce32f3e614f4c`.
- Latest AppImage: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage`;
  SHA-256 `c2e5687c92a24621b579f132e4b03d88819899d4b2a15e5be593b70b106f30da`.
- Isolated DEB-extracted executable and AppImage-extracted AppRun launch smokes:
  pass, alive after 12 seconds each with isolated SQLite and private logs initialized.
  DEB data contained no generated GeoIP/threat/device/DNS observations.
  Initial Xvfb attempt failed with inherited GDK_BACKEND=wayland; child-only x11
  override fixed the display mismatch. No global settings changed.
  Receipts: `target/improvement-package-smoke/receipt.json` and
  `target/improvement-appimage-smoke/receipt.json`. Only test processes were stopped.
  Direct AppImage FUSE mount, rendered UI/downloads and live capture remain unverified.
  Packages are **staged, not installed**; Windows artifacts were not rebuilt.

### Continue safely

Read this section and the 2026-10-05 logbook entry before using older status below.
The newly built application is not automatically installed over the user's data
or running session. Package integrity and isolated startup are now checked; next,
have the person install/reopen it normally and try interface history/export and
a short normal-session Capture Buddy recording.
Preserve existing capture helper permissions; don't reinstall them blindly.
Windows runtime and full protocol coverage remain unverified/incomplete.

Native environment remains the project-local SDK documented below; isolated
XDG_DATA_HOME is `target/improvement-test-data` for this phase. Logs use standard
library file locking (Rust >=1.89; available local toolchain is 1.99).

## Saved pause — 2026-10-04 (historical; superseded by 2026-10-05 above)

User requested **“save it for now”** after the native recording permission fix. Pause implementation. Do not reset, clean, commit, push, or terminate the running app merely to resume this handoff.

### Goal and decisions

- Deliver a directly usable NET0ZE desktop with truthful local telemetry and Capture Buddy. No fabricated observations.
- Conversations was replaced by Capture Buddy with custom duration, save-as, large packet timeline and Buddy Search.
- User explicitly rejected TShark. Current Capture Buddy is a native Rust engine; **no TShark/dumpcap execution or dependency**. libpcap/Npcap supplies adapter access only.
- GUI stays unprivileged. Linux raw capture now runs in our small root-owned helper with CAP_NET_RAW, restricted to the netdev group.

### Repository and local state

- Workspace: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`.
- Branch: `master`; HEAD: `d0886b95a3fac48d31b3fc9d4d4b215d1f3ad3a4`.
- Extensive modified/untracked work remains uncommitted. Much of the backend/platform/frontend migration predates the latest capture work; preserve all of it. No commit or push was made for this pause.
- Running desktop PID at save: **226762**, command `/home/kalu/.local/bin/netoze-desktop`, resolving into `~/.local/opt/netoze/usr/bin/netoze-desktop`. Recheck PID/executable identity before any later process action.
- User launcher: `~/.local/share/applications/netoze.desktop`. Original installs retained as `~/.local/opt/netoze-backup-*`. User data remains separate in normal NET0ZE app data.

### Latest permission issue: resolved setup, live recording still unverified

- User screenshot showed missing native-helper setup, not a parser/UI defect.
- `sudo -n true` required authentication. An installer terminal was opened on the desktop for OS authentication; no password was requested/read in chat.
- Installation completed: `dpkg-query -W -f='${Status}\n' net0ze` returned **install ok installed**. Correct Debian package name is `net0ze`, not `netoze`.
- `/usr/lib/netoze/netoze-capture-helper`: root:netdev, mode 0750; `getcap` returned **cap_net_raw=ep**.
- `/usr/lib/netoze/netoze-capture-helper --check` returned **NETOZE_CAPTURE_V1 net_raw=1 restricted=0**.
- Restarted installed app; `/proc/226762/status` reported **NoNewPrivs: 0**, **CapEff: 0000000000000000**. The GUI is unprivileged; the helper has verified capture access.
- Earlier NoNewPrivs=1/missing-helper blockers are historical, not the latest state.
- No live capture or network scan was performed by the agent during verification. Do not equate the permission probe with a successful recording.

### Current implementation files

- `src-tauri/src/services/buddy_engine.rs`: bounded PCAP/PCAPNG parsing, link/IP/transport decoding, DNS questions, packet-local HTTP/TLS, byte evidence and connection grouping.
- `src-tauri/src/services/buddy_search.rs`: original native query AST (AND/OR/exclusions, IP/port/text/size/time), evaluated directly against decoded records.
- `src-tauri/src/commands/capture_buddy.rs`: native command handlers, sessions, helper supervision, searches/statistics/TCP reconstruction, duration and non-overwriting byte-preserving export.
- `src-tauri/src/bin/netoze-capture-helper.rs`: capture-only Rust executable; parent-opened output descriptors, no arbitrary privileged file path, bounded duration/bytes/packets, graceful stop on stdin/EOF, passive --check.
- `src-tauri/install/linux-postinst.sh`, `src-tauri/tauri.linux.conf.json`, `src-tauri/Cargo.toml`, `scripts/build-desktop.mjs`: bundle/build helper and configure its group/capability on administrator-approved DEB install.
- `src/components/CaptureBuddy.tsx`, `src/lib/captureBuddyPresentation.ts`, corresponding test: native capture UI, local search, custom 1–3600-second duration, save copy, larger table and actionable permission messages with recheck.
- `src/App.tsx`, `src/components/Sidebar.tsx`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/services/mod.rs`: routing, naming, state and IPC wiring.
- Prior completed modules include actual Linux host logs/socket inventory, API refresh controls, readiness UI, capture/flow lifecycle improvements and custom logo. These are preserved.

### Checks and build receipts

- **Tests PASS:** `cargo test --manifest-path src-tauri/Cargo.toml --release --lib --bin netoze-capture-helper -- --test-threads=1`: **71 library + 1 helper tests**, log `target/buddy-helper-tests.log`.
- **Tests PASS:** `node --import tsx --test src/lib/captureBuddyPresentation.test.ts` (2 tests); `node --test scripts/ipc-contract.test.mjs` (1 test).
- **Typecheck/frontend build PASS:** `npm run build` (TypeScript + Vite). Existing bundle/import warnings remain.
- **Installer syntax PASS:** `sh -n src-tauri/install/linux-postinst.sh`.
- **Native/package build PASS:** `cargo build --manifest-path src-tauri/Cargo.toml --release --bin netoze-capture-helper`, then `node node_modules/@tauri-apps/cli/tauri.js build --bundles deb --config '{"build":{"beforeBuildCommand":null}}'`; logs `target/buddy-helper-build.log`, `target/buddy-access-package.log`.
- **Lint:** not run on latest changes. Earlier lint results below are stale.
- SDK env: CARGO_HOME=`$PWD/target/native-tooling/netoze-toolchain/cargo`; RUSTUP_HOME=`$PWD/target/native-tooling/netoze-toolchain/rustup`; PATH includes cargo/bin; PKG_CONFIG_SYSROOT_DIR=`$PWD/target/native-tooling/netoze-sysroot`; PKG_CONFIG_PATH points to its `usr/lib/x86_64-linux-gnu/pkgconfig` and `usr/share/pkgconfig`; CARGO_BUILD_JOBS=1. Tests use isolated XDG_DATA_HOME (`target/buddy-helper-test-data`).
- Latest package: `releases/capture-buddy-native-linux/NET0ZE_2.0.0_amd64.deb`; SHA-256 **7072d9ce2dfe69dea0cccc6e5feebf35b2b972ee9f1ad03bc52d4abf27d4b097**. Older packages elsewhere may still use older engines. Latest helper package has no newly verified AppImage/Windows release.

### Boundaries and next step

- Read `docs/CAPTURE_BUDDY.md` for coverage/limits. This is an independent native first release, not Wireshark-level coverage: fragment/application reassembly, complete DNS answers, QUIC/DHCP, decryption, large-file indexing and comprehensive native-UI/Windows tests remain incomplete.
- **Next action when user resumes:** ask them to start a short Capture Buddy recording using the already-running normal desktop session. Verify real packet count, stop state, saved PCAP reopening and search against that recording. Inspect actual errors if any; do not reinstall permissions blindly because the helper probe already passed.
- The pause itself changes only this handoff; running app and user data remain in place.

## Implementation update — 2026-10-04 (supersedes planning state below)

User authorized implementation and running/debugging the app. Changes are uncommitted; no scans or live capture were started.

- Installed project npm dependencies; added `tsx` so tests work on this Node build without native type stripping. App tsconfig now excludes test files.
- Replaced `Globe3D.tsx` stub with interactive Three.js globe; added `globeGeometry.ts` and five geometry tests. Supports geographic selection, rotation, zoom, endpoint arcs, cleanup and WebGL fallback. Visual browser verification remains outstanding.
- Added `src/services/tauri/globalIntel.ts` and integrated `GlobalIntelView.tsx` with bounded nonoverlapping snapshot polling, unavailable/stale/error states, validated locations, and corrected severity handling.
- Added Rust managed `BackendState`, shared library bootstrap, Page 1 snapshot/read handlers and cache migrations; removed unsafe global capture state. Native code has NOT been compiled yet.
- Corrected navbar database labels: browser mode is not an in-memory SQLite/DuckDB implementation. Existing legacy DuckDB initializer only creates a file; actual telemetry persistence is SQLite. Earlier stack descriptions naming DuckDB describe intent, not a verified DuckDB engine.
- Startup performs no capture, active scans, connectivity probes or external feed requests. External enrichment and connectivity currently report NOT_STARTED/UNAVAILABLE. This is a foundation, not a completed live assessment product.

### Latest verification

- `npm run build`: PASS (TypeScript and Vite); large JS chunk warning remains.
- `npm run test:geo`: PASS, 33 tests including five globe tests.
- `npm run lint`: zero errors, 14 existing warnings at first integrated check; targeted new-file lint passed.
- `git diff --check`: PASS.
- `curl --fail --silent http://127.0.0.1:5173/`: served NETOZE HTML.
- Built-in browser open timed out; subsequent tab listing was empty. No rendered UI, interactions, or GPU performance have been verified.
- Native Rust tests/compilation: BLOCKED, Cargo/Rust and Linux desktop development libraries absent. `sudo -n true` requires a password. Do not request the password in chat.

## Linux-first implementation update — 2026-10-04

- Confirmed target is native desktop packaging: `.deb` and AppImage for Linux; `.exe`/MSI for Windows. Vite/localhost remains development-only.
- A prepared project-local Rust toolchain and Linux sysroot were available under `target/native-tooling`; no system package installation was performed.
- Added real Linux host observations: `/proc/net/tcp` and `/proc/net/tcp6` parsing, socket/PID lookup where permitted, Linux interface counters/state/link speed, real hostname/OS/memory/CPU/admin status. Windows-only Event Log/service observations remain explicitly unavailable on Linux.
- Fixed Linux TCP state mapping (`0A` is LISTEN) and made the existing system integration test platform-aware rather than fabricating Linux services.
- Fixed capture lifecycle concurrency: serialized start/stop, generation tracking, bounded stop wait, failed-start cleanup, and no stale worker stop events.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: **PASS — 44 passed, 0 failed** using the project-local toolchain and sysroot. Nonfatal warnings remain for Windows-only/dead code and unused imports.
- `npm run dist:linux`: native release build completed for the Rust binary and DEB; AppImage bundling completed separately after the long build command timed out during its first combined invocation.
- `npm run test:release`: **PASS — 2 passed, 0 failed**.
- `npm run build`: PASS as part of the desktop build; Vite reports a large JavaScript chunk warning.
- Release artifacts staged in `releases/linux/2.0.0-x64/` with SHA-256 manifest:
  - `NET0ZE_2.0.0_amd64.deb`
  - `NET0ZE_2.0.0_amd64.AppImage`
- System-wide `.deb` install was attempted but blocked by the execution environment's no-new-privileges policy. A per-user native installation is active at `$HOME/.local/bin/netoze-desktop`, using extracted packaged files under `$HOME/.local/opt/netoze`.
- Native executable launch smoke test: **PASS**; process remained alive and initialized SQLite at `$HOME/.local/share/NET0ZE/netoze_app.db`.
- AppImage direct mount smoke test: blocked by container FUSE (`fusermount: Operation not permitted`). AppImage extraction plus `AppRun` launch smoke test: **PASS**, native process remained alive and initialized SQLite.

### Linux remaining scope

Linux packaging and the Page 1 foundation are working, but the entire security/pentesting backend is not complete. Remaining major work includes real Linux service inventory, Linux event/log sources, robust capture permission UX, full Page 1 native interaction validation, threat-feed/GeoIP action UX, case/report workflows, authorized assessment modules, and security hardening. Do not claim those as completed.

### Running process

`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` is running in the project directory, shell ID `sh_10570d504001732eQ1vNYsWFWF`. URL: http://localhost:5173 . It lasts only while the host process/session remains alive; restart with the same command if needed.

### Next action now

Obtain user-assisted native toolchain setup (Rust/Cargo and Tauri Linux prerequisites), compile and fix native errors, then run browser/WebGL interaction checks. For actual Npcap capture, use a Windows test environment or explicitly agree on a separate Linux libpcap implementation. Audit missing non-Page-1 IPC handlers before claiming the entire tool is operational. Re-run all checks and update this handoff after native validation.

## Goal

**Packaging target:** NET0ZE is a native Tauri desktop application, not a web application. The deliverables are a Windows `.exe` installer (and MSI as applicable) plus a Linux `.deb` package (AppImage may be an additional Linux artifact). Vite/localhost is development-only and must never be treated as the product runtime.

Continue building NET0ZE into a local-first Windows network security platform for authorized monitoring, assessment, investigation, explainable detection, attack-path visualization, and commercial pentesting/reporting.

The next implementation target is **Page 1 — Global Intelligence**, beginning with its backend. The page must provide trustworthy capture state, flows, throughput, devices, GeoIP, threat intelligence, detections, alerts, and a coordinated data snapshot for the frontend and future 3D globe.

## Current state

- Repository: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`
- Branch: `master`
- Reviewed revision: `d0886b95a3fac48d31b3fc9d4d4b215d1f3ad3a4`
- Working tree was clean before this handoff file was created.
- The separate `/home/kalu/Desktop/code/NETOZE` directory contains six GUI screenshots, not a second source implementation.
- Existing stack: React 19, TypeScript, Vite, Tailwind, Tauri 2, Rust, SQLite, DuckDB, Npcap/libpcap, Three.js.
- Packaging direction: Tauri bundles the compiled frontend into native installers; Windows uses Npcap and Linux uses libpcap. `src-tauri/tauri.linux.conf.json` targets `deb` and `appimage`; the base Windows config targets `nsis` and `msi`.
- Existing backend domains include packet capture, flow reconstruction, JA4, detections, graphs, storylines, GeoIP, devices, threat feeds, Windows telemetry, and forensic queries.
- Existing GUI is visually strong, but Page 1 currently performs many independent refreshes.
- `src/components/Globe3D.tsx` is currently incomplete/stub-like and does not yet render the intended globe; it should be replaced or completed later with an original Three.js cyber-themed globe.

## Decisions

1. Work is divided by product modules, not calendar weeks.
2. Start with Page 1 backend before redesigning the frontend.
3. Page 1 should expose a coordinated `GlobalIntelSnapshot` rather than relying only on many unrelated polling calls.
4. Every displayed value must be marked or internally tracked as live, cached, inferred, or unavailable. No fabricated telemetry.
5. Replace unsafe global capture state (`static mut CAPTURE_ENGINE`) with managed Tauri application state before expanding capture behavior.
6. The future 3D globe can be inspired by a cinematic "God's Eye" concept but must use original implementation/assets: atmospheric glow, wireframe, neon nodes, animated arcs, scan rings, threat colors, HUD, zoom, rotation, selection, and country drill-down.
7. The long-term product has Monitor, Assess, and Report modes. Active testing must be authorized, scoped, rate-limited, auditable, and safe by default.
8. NET0ZE should first become a reliable local network sensor and explainable detection platform, then grow into an authorized assessment engine and commercial pentesting/reporting suite.

## Page 1 backend modules

1. **Capability/environment service** — OS, administrator status, Npcap, permissions, interfaces, database, connectivity.
2. **Capture session manager** — interface selection, start/stop/pause/restart, lifecycle, metrics, errors, shutdown.
3. **Flow aggregation** — TCP/UDP/ICMP, IPv4/IPv6, flow expiration, packets, bytes, RTT, DNS, JA4, severity.
4. **GeoIP enrichment** — country, city, coordinates, ASN, organization, cache expiry, private IP handling, offline state.
5. **Threat intelligence** — IOC storage, feeds, refresh, matching, severity, expiration, provenance, offline cache.
6. **Device/asset discovery** — local host, LAN peers, IP/MAC/hostname, first/last seen, services, confidence.
7. **Detection summary** — severity counts, categories, active/resolved state, latest alerts, evidence, MITRE mapping.
8. **Global Intelligence Snapshot API** — one consistent snapshot containing capture, capabilities, connectivity, throughput, devices, GeoIP nodes, threats, detections, alerts, and active flows.
9. **Persistence/migrations** — stable schemas, indexes, retention, cleanup, and safe reload behavior.

## Proposed snapshot contract

Conceptual model:

```text
GlobalIntelSnapshot {
  generated_at
  capture
  capabilities
  connectivity
  throughput
  devices
  geo_nodes
  threat_summary
  detection_summary
  recent_alerts
  active_flows
  data_provenance
}
```

## Frontend direction

The target is a consistent dark cyber/SOC design system across the tool:

- near-black navy background
- electric cyan and deep blue primary colors
- green healthy, amber warning, orange high, red/magenta critical
- glass-like panels and subtle blue borders
- technical monospace labels with readable headings
- consistent status/provenance indicators

The globe should support manual drag rotation, auto-rotate, zoom, country selection, endpoint selection, threat filters, animated traffic arcs, pulsing nodes, scan rings, atmospheric glow, and detail panels. The current screenshots are the visual reference, but the final visual should be original.

## Important known issues

- `src-tauri/src/commands/mod.rs` still has `unimplemented!()` commands for port checking, WHOIS/RDAP, and traceroute.
- Capture state uses unsafe mutable global state.
- Some Windows service/process values appear hardcoded or inferred and need truthful native implementation.
- The current frontend has many independent polling calls and should eventually use the coordinated snapshot.
- Authentication and local token storage require a later security review before commercial use.
- The project has no verified green build baseline in the reviewed environment.

## Checks run before handoff

Working directory for all commands: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`

### Build — failed

```text
npm run build
```

Observed issues: TypeScript target/configuration incompatibilities, unsupported `erasableSyntaxOnly`, missing `vite/client` and Node types, and `tsBuildInfoFile` without incremental/composite configuration.

### Lint — failed

```text
npm run lint
```

Observed issue: `oxlint:ng, WHOIS/RDAP, and traceroute.
- Capture state uses unsafe mutable global state.
- Some Windows service/process values appear hardcoded or inferred and need truthful native implementation.
- The current frontend has many independent polling calls and should eventually use the coordinated snapshot.
- Authentication and local token storage require a later security review before commercial use.
- The project has no verified green build baseline in the reviewed environment.

## Checks run before handoff

Working directory for all commands: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`

### Build — failed

```text
npm run build
```

Observed issues: TypeScript target/configuration incompatibilities, unsupported `erasableSyntaxOnly`, missing `vite/client` and Node types, and `tsBuildInfoFile` without incremental/composite configuration.

### Lint — failed

```text
npm run lint
```

Observed issue: `oxlint: command not found`.

### Frontend tests — failed

```text
npm run test:geo
```

Observed issue: Node reported `ERR_NO_TYPESCRIPT`; the installed Node binary was not compiled with TypeScript stripping support.

### Rust tests — could not run

```text
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Observed issue: `cargo: command not found`.

No checks should be described as passed until the toolchain is repaired and the commands are rerun.

## Research references considered

- MITRE ATT&CK Enterprise v19/v19.2: current technique, software, detection-strategy, and data-component mapping direction.
- OWASP Web Security Testing Guide: methodology for future web assessment modules and rrc-tauri/Cargo.toml --lib
```

Observed issue: `cargo: command not found`.

No checks should be described as passed until the toolchain is repaired and the commands are rerun.

## Research references considered

- MITRE ATT&CK Enterprise v19/v19.2: current technique, software, detection-strategy, and data-component mapping direction.
- OWASP Web Security Testing Guide: methodology for future web assessment modules and reporting.
- NIST SP 800-115: security testing and assessment planning/reporting foundation.
- Zeek: passive network monitoring and rich protocol logs.
- Suricata: signature-based IDS/IPS and rule ecosystem.
- Wazuh, MISP, TheHive/Cortex, and Security Onion: ecosystem integration and commercial feature benchmarks.

## Next action

When work resumes, first design and implement the Page 1 backend contract and tests without changing the visual frontend:

1. Re-read the current Page 1 services and Rust command registration.
2. Define concrete Rust models for `GlobalIntelSnapshot` and provenance/status values.
3. Replace unsafe capture state with managed Tauri state as part of the backend foundation.
4. Add the snapshot builder and its persistence queries.
5. Add unit/integration tests for empty, offline, unavailable-Npcap, active-capture, and threat-match states.
6. Only after that, connect the frontend to the snapshot and implement the final Three.js globe.

## User direction

The user wants the assistant to act as the project planner, mentor, and implementer. They asked to preserve progress now and continue later; no product code changes were authorized in this handoff session.

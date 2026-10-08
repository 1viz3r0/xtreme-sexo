# Labs benchmark and focused remake

Date: 2026-10-07. Repository: MY-SECRET-NETOZE. Scope: current working tree,
not a clean upstream revision; unrelated work was preserved.

## Scope and evidence limits

The request was to inspect every room made here, compare online rooms, and fix
missing functionality. No defensible review can claim to have played every room
on the internet. This review inventories our catalogs and compares representative
official sources for web exploitation, guided rooms, defensive investigations,
and VM ranges. It does not claim paid-room access or completion of online labs.

Local evidence: source review, native HTTP regression tests, browser DOM tests,
and both actual Rust-service room playthroughs in Happy DOM. Happy DOM is NOT
a rendered browser or a normal installed-app launcher test.

## What actually exists

### Runnable environments in primary Labs

| Room | Working flow | Completion verification | Important limit |
| --- | --- | --- | --- |
| Red Dispatch Desk | Browse workspaces/jobs; compare job denial with foreign receipt access; preserve audit reference; apply supplied owner-aware policy; run access matrix | Five page categories visited, qualifying audited cross-owner read, fix installed after evidence, five computed own/foreign/auditor checks | One deliberately faulty access rule; roles are explicit training selectors, not login sessions; repair is provided, not authored code |
| Blue Signal Bureau | Search/view 14 UTC event records; bookmark four correlated incident records; order timeline; build fixed-operator AND rule; select scoped response | Evidence membership, timestamp ordering, computed visible AND held-out detection results, exact bounded response set | Small synthetic dataset, no full SIEM/query language, response is simulated |
| Red Network Scanning and Asset Discovery | List/filter four fictional loopback records; inspect a seeded asset; save exact three-asset service/port evidence; submit allowlist plus explicit decoy exclusion; verify report | Four server-computed objectives; exact assets/services/ports; decoy rejection; no live sockets or host commands | Inventory is intentionally seeded and bounded; it teaches scope/evidence mechanics, not a real scanner |

Each has four 25-point objectives, one-point unsuccessful verification penalties,
two-point progressive hint penalties, shared browser/native progress and reports,
a reset generation, and a completion receipt after verified objectives.
One listener/room runs at a time. The desktop now journals verified training
actions to bounded local checkpoints. Stop closes the listener; explicit Resume
reconstructs progress with a fresh run ID/link. Reset reseeds the saved checkpoint.
The default test runtime remains deliberately ephemeral. Browser scratch notes
remain tab-only and are not included in saved progress.

### Legacy 20-room catalog (not active environment count)

All use `src/lib/purpleLabs.ts` static fixtures, ordered review/challenge/debrief
tasks, normalized accepted phrases, progressive hints, and predictable fictional
flags. Combination rooms reuse component fixtures; they do not create service
chains or independently derive correlations. The nominal 10 Easy / 7 Medium /
3 Hard split describes metadata, not measured practical difficulty.

| Legacy room | Actual material / task |
| --- | --- |
| Network discovery | Name alpha and bravo from inventory summary |
| Suspicious DNS | Identify stated rarity/high entropy |
| Port and service exposure | Repeat stated administrative-port exposure |
| Command telemetry | Identify stated encoded command |
| Credential access detection | Confirm no actual secret is included |
| Lateral movement | Repeat alpha-to-bravo fixture direction |
| Staging and exfiltration | Identify stated archive marker |
| Detection engineering | Name the stated DNS rarity tuning gap |
| Validation loop | Repeat expected/observed agreement |
| ATT&CK mapping | Name the framework; no independent mapping investigation |
| Discovery to exposure | Reuse discovery/exposure summaries and named correlation |
| DNS to command | Reuse DNS/command summaries and named correlation |
| Credential to lateral movement | Reuse credential/movement summaries |
| Staging to exfiltration | Reuse staging/validation summaries |
| Detection engineering to validation | Reuse rule/validation summaries |
| Full attack-path tabletop | Reuse discovery/credential/movement/mapping summaries |
| Network visibility to investigation | Reuse discovery/DNS/service summaries |
| ATT&CK mapping to report | Reuse mapping/rule/validation summaries |
| Coverage closure tabletop | Reuse discovery/rule/validation summaries |
| Analyst readout rehearsal | Reuse command/mapping/staging summaries |

### Legacy separate-track catalog

Blue: Lantern Signal Review, Alert Weave, Timeline Stitch, Containment Garden,
Rulework Orchard, Readout Harbor. Each uses two summary artifacts and three
phrase checks: investigate, `contain locally`, `document a detection gap`.

Red: Copper Kite Survey, Mosaic Gate Review, Orbit Ledger Review, Paper Bridge
Check, Glass Lantern Audit, Sundial Vault Assessment. Each uses observation
cards and three phrase checks: reconnaissance, `observation is bounded`,
`recommend remediation`. They are not six live vulnerable applications.

The ten base fixture labs, eight combinations, three older combined exercises,
and twenty rooms overlap; adding their counts would inflate the catalog.
The older generic `purple_team` loopback target remains a separate legacy API,
not a provisioned VM and not a replacement for these distinct scenarios.

## Online comparison (official public sources)

| Reference | Publicly documented experience | Comparison to ours |
| --- | --- | --- |
| PortSwigger: access-control labs / user-ID parameter lab | Real vulnerable application requests; supplied fictional account; obtain another user's lab API key through parameter modification | Same horizontal-boundary concept as Dispatch Desk. Ours adds supplied repair and regression checks but lacks independent session/authentication and a realistic multi-endpoint business app |
| TryHackMe: IDOR | Finding/exploiting IDOR to access unauthorized application data | Dispatch teaches that concept through an explicit bounded role-and-record workbench, with much less discovery depth |
| TryHackMe: Splunk 2 | Blue Primer room based on Splunk BOTS v2 | Signal Bureau offers correlation/timeline/rule learning, not a Splunk environment. The accessible public page does not establish all internal tasks |
| OWASP Juice Shop | Real Node/Express/Angular insecure app, many difficulty levels, OWASP Top Ten and additional flaws, challenge scoreboard | Ours has one access-control exercise, not a broad app-security target or scanner/proxy practice suite |
| Blue Team Labs Online | Scenario investigations, dedicated in-browser labs, downloadable memory/email/PCAP/log challenges, incident response/forensics/threat hunting | Our Blue has a small original event corpus with CSV export, not memory/packet/email evidence, full investigative toolchains or broad scenario coverage |
| VulnHub | Downloadable legally exploitable machines for practical host/network learning | Ours is a fixed-action loopback service, not an OS/VM, shell, privilege-escalation or multi-host range |

The useful benchmark is environment depth and evidence quality, not copying
room names, narratives, datasets, copyrighted challenge expression or answers.

## Findings and fixes implemented

### High: Red snapshot bypassed the taught authorization boundary

Before: `Room::state` serialized every receipt's private handoff fields and every
job's protected detail fields. `api/state`, `api/report` and native status therefore
disclosed contents even after the read action denied access. This undermined the
exercise's claim that the provided repair secured receipt access.

Fix: shared snapshots carry metadata indexes, not protected job/receipt contents.
Authorized read actions provide audited details. Repair clears a cached foreign
receipt that is no longer permitted. Historical audit/evidence metadata remains
available deliberately; a repair cannot erase information already seen.

### High: Blue detection rewarded memorization

Before: a rule identifying `S-88` could match the two visible target logins with no
false positives without detecting the replay pattern generally.

Fix: ten private original held-out records (three replay targets, seven benign
records) vary users, hosts and sessions. Acceptance requires both visible and
held-out zero misses/benign matches. Learners see computed aggregate counts,
not hidden rows. Session/host/user-specific memorized rules fail. A finite test
corpus is not proof of production detection performance.

### High: progress disappeared on stop/restart

Fix: desktop uses schema-versioned local action journals, reconstructed against
known original seed data rather than trusting imported scores or completed IDs.
Both HTTP/native actions and hints checkpoint; resets checkpoint the reseed.
Only two fixed room checkpoint files are used. File and journal sizes are capped;
replacement is atomic and Unix directories/files are 0700/0600. Invalid,
oversized, symlinked, unreadable or externally modified checkpoints produce a
visible warning and are not silently overwritten. Storage failure allows clearly
labelled in-memory play, not false durable-success claims.

Saved summaries and Resume are visible before launch. Resume requires an explicit
Start action, creates a new listener/link, and does not resurrect old URL/token
locators. Audit timestamps/IDs are reconstructed on replay; logical evidence,
verified progress, penalties and decisions are preserved. Local checkpoints are
not signed certificates and are not an anti-cheat trust boundary against the
machine owner. Windows atomic replacement was not exercised on Linux.

### Medium: browser failure/reset handling was weak

Fix: eight-second request deadline including response parsing, abort support,
uncertain-write messaging, no automatic POST retry, explicit state reconciliation
before further writes, actionable stopped/disconnected guidance. Hint requests
include run/reset generation and stale hints are rejected without penalties.
Shared resets clear transient forms/filter/selections/page. Storage health is
shown in both desktop and room browser without exposing local file paths.

### Medium: evidence portability and learner feedback were thin

Fix: original unfiltered Blue event CSV with formula-safe cells, readable raw
records, beginner workflow guidance separate from scored solution hints, tab-only
analyst scratchpad, and stage-sensitive debriefs explaining evidence/detection
limits. CSV export does not claim to provide a PCAP/memory image or a SIEM.

## Remaining product gaps (not silently marked complete)

1. Normal installed launcher, actual default-browser opening, visual rendering,
   and packaged-app restart/resume must be exercised with OS installation approval.
2. Three runnable environments do not meet the earlier 20-room 10/7/3 content request.
   Legacy quizzes must not be promoted as replacement environments. Build new
   original rooms with distinct data/behavior and acceptance tests, not renames.
3. Red remains a guided policy workbench, not independently authenticated
   application sessions, an open-ended vulnerable app, or a host/network range.
4. Blue lacks original PCAP/email/memory/process artifacts, a full query language,
   rule-format interoperability, larger ambiguous corpora, and branching cases.
5. Replay/holdout fixtures are deterministic. No randomized assessment variants,
   broad coverage map, calibrated difficulty or demonstrated learner outcomes.
6. No container/VM provisioning, terminal, multi-host range or arbitrary execution.
   Those require a separate least-privilege isolation design; never add them to
   the unrestricted desktop host merely to imitate a training platform.

## One-room-at-a-time build order

The requested topic list is now treated as a backlog, not as completed rooms.
The first newly remade room is the simplest Red topic and is the only new topic
being advanced in this pass:

1. **Red Easy — Network Scanning and Asset Discovery**: implemented and verified
   through native tests plus a real loopback HTTP/Happy DOM flow.
2. Red Easy — Anonymous FTP & SMB Misconfigurations: not started.
3. Red Easy — Basic Web Brute-Forcing: not started.

After room 1 is accepted in the installed app, continue one room per cycle.
The same rule applies to the Blue list: no topic becomes a runnable room merely
because a legacy fixture has a similar name.

## Official sources consulted

- https://portswigger.net/web-security/access-control
- https://portswigger.net/web-security/access-control/lab-user-id-controlled-by-request-parameter
- https://tryhackme.com/room/idor
- https://tryhackme.com/room/splunk2gcd5
- https://owasp.org/www-project-juice-shop/
- https://blueteamlabs.online/
- https://www.vulnhub.com/about/

Public pages were read during this review; descriptions/catalogs can change.
Two attempted Hack The Box URLs and an older TryHackMe help URL returned 404;
they are not used as substantive evidence. No online training targets were attacked.

## Verification and reproduction

Executed checks in this pass:

| Check | Actual outcome |
| --- | --- |
| Application tests | 206 passed |
| Script tests | 13 passed (includes eight browser-room tests) |
| Native room tests | 8 passed |
| Native checkpoint tests | 10 passed |
| Legacy target regression | 1 passed |
| Happy DOM against real native HTTP | Both four-objective playthroughs passed; shared state/report, reset, unknown run, stopped guidance |
| Separate native processes | Both rooms completed, exited, resumed, reset, exited and reopened with reset retained |
| Typecheck/frontend build/DEB build | Passed |
| Lint/diff | Passed; lint/native build retain unrelated warnings |

From repository root, frontend checks:

```sh
npm test
npm run build
npm run lint
git diff --check
```

Native tooling for this checkout (not global configuration):

```sh
export CARGO_HOME="$PWD/target/native-tooling/netoze-toolchain/cargo"
export RUSTUP_HOME="$PWD/target/native-tooling/netoze-toolchain/rustup"
sysroot="$PWD/target/native-tooling/netoze-sysroot"
export PATH="$CARGO_HOME/bin:$sysroot/usr/bin:$PATH"
export PKG_CONFIG_SYSROOT_DIR="$sysroot"
export PKG_CONFIG_PATH="$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/share/pkgconfig"
export CARGO_BUILD_JOBS=1
cargo test --manifest-path src-tauri/Cargo.toml --release --test lab_runtime_verify --test lab_runtime_persistence_verify --test purple_team_verify
cargo build --manifest-path src-tauri/Cargo.toml --release --example lab_runtime_smoke
node scripts/lab-room-live-smoke.mjs --binary "$PWD/src-tauri/target/release/examples/lab_runtime_smoke"
npx tauri build --bundles deb
node scripts/stage-native-release.mjs linux --formats deb
```

The live script executes only this project's trusted room JavaScript and uses
isolated test checkpoint directories. Happy DOM warns that its evaluation VM
is not a security sandbox; never use this harness to execute downloaded online
room code. It is not a substitute for visual browser acceptance or native opener
validation. No full native all-targets suite was run for this change.

Release: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
SHA-256: `54ef990914326d5054fe3e4c01aa934267b21f144a63ba073c07762d2fee9b75`.
Release executable: `ca160f2d40a737ee8dc7b881d23ec43afd52a1a2fb6d24021c2c18714bab68a7`.
Installed executable: `9b827f4aee3ceb4b918cbddb1fca12ce8eafe74cc0ef5350c03f06199b52c447`.
Version remains 2.0.0; hashes, not version alone, distinguish these builds.
OS administrator authentication is required to install. Normal launcher update
and installed visual room acceptance are still pending.

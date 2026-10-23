# NET0ZE continuation handoff

## Goal

Continue polishing the NET0ZE desktop cybersecurity platform. The current user priorities are: keep CTF flags in `NET0ZE{...}` format, keep beginner rooms simple but not answer-leaking, preserve isolated room backends, and perfect Overview plus the globe as the main product experience.

## State

- Repository: `/home/addie/omnirush.ai/xtreme-sexo`
- Branch: `master`
- Latest committed revision: `6d23ff2 docs: record windows installer build session`
- The working tree is **clean**; all pending work is committed and queued for push to `origin/master`.
- The launcher artifact has been rebuilt at `/home/addie/Applications/NET0ZE.AppImage`.
- Current AppImage SHA-256: `a75ffcbfccaf0335901e4a27adfb66a6b4d339939e0ac96dafb790c5b497a5a8`.
- Fully close the running app before launching the updated AppImage from the application launcher.

## What works now

### CTFs

Seven provisioned rooms remain available:

- Easy: Web Exposure, Northstar Yard Enumeration, Signal Kiosk: Header Trail, First Contact, Service Signals.
- Medium: Ledger Sync Permission Review.
- Hard: Copperline Protocol Archive.

The catalog uses the black/charcoal application theme, shows room IDs and difficulty, surfaces the two new beginner rooms, and includes selected-room/runbook guidance. Beginner target pages now have dark terminal-style presentation, START HERE route maps, readable clue paths, and safe hints without generic full-answer leakage.

Flag and safety decisions:

- Generated flags use the bounded `NET0ZE{...}` shape.
- Flags are validated server-side against the current run.
- Docker rooms remain isolated, nonroot, read-only, capability-dropped, and no-new-privileges.
- Do not turn walkthrough copy into a direct answer or expose flags in generic catalog metadata.

### Overview

`src/components/OverviewSummary.tsx` and `src/lib/overview.ts` now distinguish native unavailable, loaded snapshot, and empty states; show a truthful investigation brief; and provide deterministic next actions to evidence or Watchtower without inventing telemetry.

### Globe

`src/components/Globe3D.tsx` now has zoom/reset controls, Home/0 shortcuts, clearer native/reference provenance, responsive overlays, reduced-motion behavior, hidden-document render suppression, and a lower high-DPI pixel ratio. Existing geometry, coordinate, occlusion, marker bounds, and disposal behavior were preserved.

## Important files

- `src/components/LabRuntimeWorkspace.tsx`: CTF catalog, room cards, filters, runbook, runtime controls, and black theme.
- `src/components/ScenarioLabs.tsx`: CTF/tutorial landing shell and onboarding.
- `src/lib/labTopicCatalog.ts`: CTF metadata, stages, steps, and prompts.
- `src/components/OverviewSummary.tsx`: Overview UI.
- `src/lib/overview.ts`: Overview next-step decision logic.
- `src/components/Globe3D.tsx`: globe rendering and controls.
- `src/components/Globe3D.test.ts`: globe behavior tests.
- `src-tauri/src/services/lab_runtime.rs`: Docker provisioning, ownership, health, cleanup, and seven-room allowlist.
- `labs/web-exposure/`: Harborline static pages and backend.
- `labs/network-enumeration/`, `labs/linux-permissions/`: guided dark target pages and README walkthroughs.
- `labs/header-trail/`, `labs/protocol-archive/`, `labs/first-contact/`, `labs/service-signals/`: newer target rooms and tests.

## Checks

- Frontend tests: `npm test` from the repository — **176 tests passed; 7 script tests passed**.
- Focused CTF/runtime tests: `node --import tsx --test src/components/ScenarioLabs.test.ts src/lib/labTopicCatalog.test.ts src/services/tauri/labRuntime.test.ts` — **8 passed**.
- Globe tests: `node --import tsx --test src/components/Globe3D.test.ts src/components/globeGeometry.test.ts` — **15 passed**.
- Typecheck/build: `npm run build` — **passed**.
- Room tests: all seven `python3 -m unittest discover -s labs/<room> -p test_target.py` suites — **16 passed**.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml --lib` — **144 passed, 1 transient loopback-port test failed in the full run and passed when rerun alone; 2 ignored Docker tests**. The direct rerun command was `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::tests::port_check_reports_real_loopback_listener_and_rejects_invalid_input -- --exact`.
- Whitespace: `git diff --check` — **passed**.
- AppImage packaging: standard Tauri AppImage step still fails at existing `linuxdeploy`; the AppImage was successfully repackaged from `src-tauri/target/release/bundle/appimage/NET0ZE.AppDir` using the cached `appimagetool` and copied to `/home/addie/Applications/NET0ZE.AppImage`.

## Next step

Launch `/home/addie/Applications/NET0ZE.AppImage`, manually inspect Overview and Globe, then check one Easy CTF and one Hard CTF for visual clarity and answer non-leakage. If the user requests more work, preserve the current local changes, run focused tests for the touched area, and rebuild/repackage the same launcher path before reporting visible completion.

## 2026-10-21 globe and Overview pass

The current source-only pass is limited to the requested globe and Overview surface:

- `src/components/Globe3D.tsx`: added clearer telemetry/source panels, active-flow destination counts, responsive controls, grab/grabbing interaction feedback, stronger keyboard metadata, hidden-tab work suppression, truthful unavailable capture metrics, and removed the globe background gradient to preserve the no-gradient product rule.
- `src/components/Globe3D.test.ts`: added checks for telemetry normalization, no-gradient styling, source labels, flow summary copy, reduced motion, visibility handling, and existing geometry/resource behavior.
- `src/components/OverviewSummary.tsx`: added explicit unavailable/stale/loaded/awaiting states, bounded snapshot age, invalid timestamp handling, high+/active/medium finding counts, source/freshness readouts, clearer next actions, and responsive/accessibility refinements.
- `src/components/OverviewSummary.test.ts`: added state and timestamp boundary tests.
- `src/lib/overview.ts`: retained the deterministic next-action policy used by Overview.

Checks for this pass:

- Focused tests: `node --import tsx --test src/components/Globe3D.test.ts src/components/globeGeometry.test.ts src/components/OverviewSummary.test.ts` — **22 passed**.
- Typecheck: `npx tsc --noEmit --pretty false` — **passed**.
- Production frontend build: `npm run build` — **passed**. Existing Vite large-chunk and dynamic-import warnings remain.
- Focused whitespace check: `git diff --check -- src/components/Globe3D.tsx src/components/Globe3D.test.ts src/components/OverviewSummary.tsx src/components/OverviewSummary.test.ts src/lib/overview.ts` — **passed**.

Earlier packaging gap (resolved below): the first `npm run dist:linux` attempt stopped because that shell had no usable Rust toolchain (`cargo: command not found`). The later continuation installed the required build toolchain/dependencies and rebuilt the launcher artifact.

## 2026-10-21 full globe and Overview redesign continuation

The requested replacement pass is now integrated, still limited to the requested surfaces:

- `src/components/Globe3D.tsx`: replaced the luminous atmosphere with a restrained monochrome wire reference shell; rebuilt the overlay hierarchy into provenance, capture telemetry, zoom state, controls, and responsive endpoint/country selectors; added native flow destination/active-flow summaries; added truthful live/stale/stopped/unavailable capture states; improved selection rings and country/endpoint camera focus; added Escape-to-clear selection; preserved front-side raycast occlusion, bounded markers/arcs, reduced motion, hidden-tab suppression, and resource disposal.
- `src/components/Globe3D.test.ts`: added/updated checks for no gradients, no shader atmosphere, source boundaries, accessibility instructions, Escape selection clearing, focus treatment, telemetry truthfulness, and cleanup.
- `src/components/OverviewSummary.tsx`: rebuilt the Overview around evidence state/freshness, investigation brief, actionable next step, host/local-network/session evidence, observed capture throughput, and source/freshness cards. Throughput is explicitly observed capture traffic, not Internet capacity or a speed test.
- `src/components/OverviewSummary.test.ts`: covers the redesigned evidence boundaries, throughput formatting, freshness edge cases, responsive structure, and keyboard-visible controls.
- `src/lib/overview.ts`: keeps the next-step policy bounded to loaded evidence.

Latest verification:

- `node --import tsx --test src/components/Globe3D.test.ts src/components/globeGeometry.test.ts src/components/OverviewSummary.test.ts src/components/ReadinessPanel.test.ts` — **24 passed**.
- `npm test` — **180 frontend/lib/service tests passed; 7 script tests passed**.
- `npx tsc --noEmit --pretty false` — **passed**.
- `npm run build` — **passed** with the existing Vite large-chunk and ineffective dynamic-import warnings.
- `git diff --check -- src/components/Globe3D.tsx src/components/Globe3D.test.ts src/components/OverviewSummary.tsx src/components/OverviewSummary.test.ts src/lib/overview.ts` — **passed**.

Packaging is now complete. A Rust 1.98.1 toolchain and Linux WebKit/GTK development packages were installed in the build container. `PATH=/root/.cargo/bin:$PATH RUSTUP_TOOLCHAIN=1.98.1 npm run dist:linux` produced the native DEB and then `npx tauri bundle --bundles appimage` produced the AppImage after the first combined run timed out while downloading AppRun. The launcher artifact was replaced at `/home/addie/Applications/NET0ZE.AppImage`.

- AppImage SHA-256: `c19faeb0e11d2c9b7b84316065422f5d457f4a02818cc14be94cb4920b30aaa3`.
- AppImage size: `106703352` bytes.
- The AppImage was extracted successfully with `--appimage-extract`; its embedded desktop binary timestamp is `2026-10-21 09:49:08 UTC` and matches the latest native build.
- A live desktop visual smoke test still requires launching the AppImage in the user's desktop session; source tests and packaging do not prove visual acceptance by themselves.

## 2026-10-21 launcher correction after visible no-change report

The user reported that the application still looked unchanged. Investigation found the actual problem: the project-root launch artifacts were stale. `NET0ZE-latest.AppImage` was from **October 14, 2026**, and `NET0ZE-x86_64.AppImage` was from **October 13, 2026**, while the rebuilt artifact in `/home/addie/Applications/NET0ZE.AppImage` was from **October 21, 2026**. There was also no user desktop entry pointing to the rebuilt artifact.

Corrective actions completed:

- Replaced both project-root artifacts with the rebuilt AppImage:
  - `NET0ZE-latest.AppImage`
  - `NET0ZE-x86_64.AppImage`
- Both now have SHA-256 `c19faeb0e11d2c9b7b84316065422f5d457f4a02818cc14be94cb4920b30aaa3`.
- Created `/home/addie/.local/share/applications/netoze.desktop` pointing directly to `/home/addie/Applications/NET0ZE.AppImage`.
- Verified the rebuilt AppImage extracts successfully and its embedded `netoze-desktop` binary differs from both stale October 13/14 artifacts.

The user should close any old NET0ZE window, then launch **NET0ZE** from the refreshed application menu or launch `/home/addie/Applications/NET0ZE.AppImage` directly. Do not use a previously opened file-manager window or a stale pinned shortcut that still references an old inode; reopen it from the application menu or the exact path above.

## 2026-10-21 GODMODE visibility correction

The user reported that Overview still appeared unchanged. The current source and production `dist` both contain `GODMODE`, but an additional stale extracted runtime existed at `squashfs-root/` from an earlier AppImage inspection. That generated runtime has now been refreshed from the current AppImage build as well.

All likely local launch targets now point to the same GODMODE build:

- `/home/addie/Applications/NET0ZE.AppImage`
- `NET0ZE-latest.AppImage`
- `NET0ZE-x86_64.AppImage`
- `squashfs-root/AppRun` and `squashfs-root/usr/bin/netoze-desktop`
- `/home/addie/.local/share/applications/netoze.desktop`

Current artifact SHA-256: `8dc8761530f873f8aaeadd46ecf8362c285a4da395537023332f742c2a91c0fe`.

No NET0ZE process was running during verification, so a live GUI screenshot could not be taken from this shell. The user must close any old NET0ZE window and start a fresh process from the application menu or the exact AppImage path above; the first visible Overview heading should now read `GODMODE`.

## 2026-10-21 installed-package correction after screenshot

The attached screenshot showed the pre-GODMODE Overview (`NET0ZE / OPERATIONS`, `Overview`, and the old Investigation Brief). That confirms the visible app was coming from an older installed/system package rather than the source workspace alone. The current staged DEB was installed with `dpkg -i` so the system launcher now uses the freshly built package:

- Installed package: `net0ze` version `2.0.0`.
- System binary: `/usr/bin/netoze-desktop`.
- System desktop entry: `/usr/share/applications/NET0ZE.desktop`.
- User desktop entry remains available at `/home/addie/.local/share/applications/netoze.desktop` and points to the current AppImage.

The next fresh launch from the system application menu should use the installed current package, not the stale process shown in the screenshot. Close any existing NET0ZE window first; the old process cannot hot-reload the new embedded frontend.

## 2026-10-21 GODMODE Overview redesign

The Overview surface was cleared and rebuilt as the primary `GODMODE` evidence-operations cockpit. Scope remained limited to `src/components/OverviewSummary.tsx`, `src/components/OverviewSummary.test.ts`, and `src/lib/overview.ts`.

- `OverviewSummary.tsx`: replaced the prior Overview hierarchy with GODMODE identity, evidence state/freshness, command brief, attention triage, bounded network picture, evidence boundary, prioritized P1/P2/P3 action queue, host/network/capture telemetry, observed capture throughput, source availability/freshness metadata, explicit limitations, and the shared readiness diagnostic.
- `overview.ts`: added a bounded action queue helper that only navigates to existing tabs and labels priority as workflow order, never as a threat/compliance score.
- `OverviewSummary.test.ts`: added GODMODE, queue, evidence-boundary, throughput, freshness, responsive, and accessibility assertions.

Verification:

- Focused Overview/Readiness tests: **9 passed**.
- Full `npm test`: **181 frontend/lib/service tests passed; 7 script tests passed**.
- `npx tsc --noEmit --pretty false`: **passed**.
- `npm run build`: **passed** with existing Vite large-chunk/dynamic-import warnings.
- `git diff --check`: **passed** for the Overview files.

Packaging:

- Rebuilt with `PATH=/root/.cargo/bin:$PATH RUSTUP_TOOLCHAIN=1.98.1 npm run dist:linux`.
- Replaced `/home/addie/Applications/NET0ZE.AppImage`, `NET0ZE-latest.AppImage`, and `NET0ZE-x86_64.AppImage`.
- Current SHA-256 for all three: `8dc8761530f873f8aaeadd46ecf8362c285a4da395537023332f742c2a91c0fe`.
- Current launcher size: `106699256` bytes.

Research direction for future GODMODE work: use NIST CSF 2.0's Govern/Identify/Protect/Detect/Respond/Recover lifecycle as optional navigation language, NIST continuous-monitoring concepts for evidence freshness and coverage, CISA logging guidance for log-source completeness and review, and MITRE ATT&CK/STIX for evidence-linked technique views. Do not turn any of these into unsupported compliance, threat, or risk scores.

## 2026-10-21 Overview replaced with NET0ZE God's Eye

The old Overview content was removed rather than layered over. The Overview now opens directly into a NET0ZE-themed God's Eye workspace:

- `src/components/OverviewSummary.tsx` is now the compact God's Eye header/HUD: native snapshot state, host, interface, endpoint, flow, finding, capture-rate, and workspace navigation telemetry.
- `src/components/GlobalIntelView.tsx` is now map-first: the existing working 3D globe is the primary surface, with capture controls, observed signals, selectable contacts, recent findings, search, country/endpoint detail, refresh, and auto-rotation in the same view.
- The old command brief, action queue, readiness panel, source-health wall, limitations wall, and full flow table were removed from Overview. Readiness remains on Watchtower and Scan Buddy.
- The implementation follows the referenced God's Eye View project's globe-first/operator-console direction without copying its standalone shell, live-provider backend, bundled datasets, or credentials. NET0ZE continues to render its own passive local evidence through the existing Three.js globe and Tauri snapshot APIs.

Verification completed:

- `npm test` — 181 frontend/lib/service tests plus 7 script tests passed.
- Focused God's Eye/Overview/Globe tests — 21 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npm run build` — passed with the existing large-chunk/dynamic-import warnings.
- Updated Linux DEB built and installed over the old package on October 21, 2026. Installed binary: `/usr/bin/netoze-desktop`.

## 2026-10-22 stale AppImage correction after screenshot

The screenshot still showed the old Overview because the user desktop entry was launching `/home/addie/Applications/NET0ZE.AppImage`, which was still the older AppImage even though the DEB had been updated. The focused correction was:

- Rebuilt the AppImage payload from the current `NET0ZE.AppDir` using the existing AppImage runtime and zstd SquashFS payload.
- Replaced `/home/addie/Applications/NET0ZE.AppImage`, `NET0ZE-latest.AppImage`, `NET0ZE-x86_64.AppImage`, and `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage`.
- Verified the rebuilt AppImage extracts and its embedded `/usr/bin/netoze-desktop` SHA-256 matches the current `NET0ZE.AppDir` binary.
- Changed `/home/addie/.local/share/applications/netoze.desktop` to launch `/usr/bin/netoze-desktop`, removing the AppImage/system-launch ambiguity.

The existing open window must still be closed once because its frontend is already loaded in memory; the next launch from the application menu uses the updated system binary.

## 2026-10-22 host environment note

The user's actual desktop is **Ryoku OS with the Hyprland compositor**. Treat the visible NET0ZE window as a host-side Wayland/Hyprland application, not as a process inside the OmniRush worker container. Future runtime verification must therefore use the Ryoku launcher/pinned desktop entry or approved host desktop control, and must not assume that changing `/usr/bin`, `/home/addie/Applications`, or package files inside the worker container changes the user's visible app. The active source path, launcher path, and running process must be confirmed on the host before reporting a visible Overview change.

## 2026-10-22 Overview rebuild and DEB reinstall

The current Overview source and production frontend were rebuilt again after the
user reported that the visible UI still appeared stale. Focused Overview/Globe
tests passed (21), the full frontend/script suite passed (181 + 7), TypeScript
and `npm run build` passed, and `git diff --check` passed.

The Linux bundle was rebuilt with the project Rust toolchain (`cargo 1.98.1`)
and the current frontend, then the DEB was reinstalled with `dpkg -i`:

- `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`
- Installed package: `net0ze 2.0.0`
- `dpkg -V net0ze`: clean
- User launcher remains `Exec=/usr/bin/netoze-desktop`.
- Refreshed AppImage copies all match SHA-256
  `14aabd5b6c5fa0df228d8a81fb47acb31f9e077142cf6fa488ba5ebf43bf4b05`.

No backend source was edited during this pass. The hashes of
`src-tauri/src/services/lab_runtime.rs`, `src-tauri/src/commands/lab_runtime.rs`,
`labs/web-exposure/server.py`, and `labs/web-exposure/Dockerfile` matched the
pre-build snapshot. Visual confirmation in the host Hyprland window remains
unavailable from this worker session.

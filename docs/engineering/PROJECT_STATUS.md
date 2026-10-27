# NET0ZE Enterprise engineering status

Updated: 2026-10-26

## Current pass

This local pass separates guided Learning Labs from practical CTF rooms, makes
Additional tools visibly locked and non-interactive, removes the unreachable
OverviewSummary implementation, and adds source-level originality checks for
Scan Buddy and Capture Buddy.

## Verified

- `Learning Labs` is a separate navigation surface with four beginner-first
  guided exercises and local progress persistence.
- `CTF Arena` is a separate navigation surface backed by the existing honest
  native lab runtime and flag validation flow.
- Additional tools expands to a locked, non-button list; its child entries do
  not route or trigger actions.
- The unreachable `OverviewSummary` component and its stale tests were removed;
  the live Overview remains `GlobalIntelView`.
- Scan Buddy and Capture Buddy contract tests reject prohibited external engine
  invocation patterns in their native runtime paths.
- `npm test` passes 193 frontend/service tests and 16 script tests.
- `npm run build` passes.
- `npm run lint` passes with four existing warnings in
  `landing-page/script.js`.
- `git diff --check` passes.
- The current Linux DEB was restaged from the current source at
  `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb` with SHA-256
  `b14394f2562d20a7f7e2e8d5829e09cbb03f2bcbfc5f56a0b5701f67e4e388d6`.
- The stale staged DEB was the concrete mismatch: it was dated October 23,
  while the current native package was dated October 25. The refreshed package
  was installed and verified in this worker environment; its extracted and
  installed `/usr/bin/netoze-desktop` hashes match.
- An isolated native smoke test launched the refreshed package and rendered the
  current Overview, CTFs navigation, and locked Additional tools state. It did
  not start capture or scanning.

## Not yet verified

- Installed Ryoku/Hyprland visual acceptance.
- The actual Ryoku/Hyprland host launcher process could not be changed or
  visually verified because host screen control is unavailable in this session;
  worker package installation does not modify that host.
- Live Docker Web Exposure Start/Open/submit/Reset/Stop acceptance.
- Live packet capture on a capture-capable host.
- Windows WebView2/Npcap runtime behavior.
- Strict Rust formatting and Clippy checks.

## Local-only policy

No commit, push, release publication, external upload, or deployment was done
in this pass.

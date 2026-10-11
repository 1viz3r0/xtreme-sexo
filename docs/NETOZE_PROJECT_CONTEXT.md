# NET0ZE project context — complete continuation guide

> This file is the single agent-readable project history and continuation
> brief. Read it before changing the repository. It summarizes the work done
> across the project and Labs rebuild, decisions, evidence, current limits, and
> the next action. It intentionally does not copy raw private chat, credentials,
> tokens, local databases, or private machine data.

## 1. Identity, repository, and current objective

- Product/project: **NET0ZE**, a desktop cybersecurity investigation platform.
- Workspace used during development:
  `/home/kalu/Desktop/code/MY-SECRET-NETOZE`
- Stack: React + TypeScript + Vite frontend; Tauri 2 + Rust native backend;
  Docker + Python standard-library target for the first practical lab.
- GitHub backup repository:
  **https://github.com/1viz3r0/xtreme-sexo**
- GitHub owner: `1viz3r0`; default branch: `master`; visibility: Public.
- The product's immediate unfinished objective is to finish user-visible
  acceptance of the installed Labs flow before implementing another lab.

The desired Labs product is not divided into Red Team, Blue Team, Purple Team,
or similar tracks. It is a practical catalog organized by **category**,
**difficulty/level**, and actual **working/planned/setup-required** status.
Targets must be provisioned safely on the user's system or through a future
explicitly approved remote infrastructure. THM/HTB informed the learning
workflow only; their content was not copied.

## 2. What happened from beginning to current state

### Initial state and first failure

The original Labs experience contained legacy Red/Blue/Purple-style concepts,
placeholder rooms, compatibility views, and a generic local target. The user
reported seeing:

```text
Safe Purple-Team Practice
Fictional training content; loopback only.
```

Source searches showed the phrase was not in the intended current source, but a
running old `/usr/bin/netoze-desktop` process was serving it on loopback port
46625. The old process and installed binary had SHA-256:

```text
9b827f4aee3ceb4b918cbddb1fca12ce8eafe74cc0ef5350c03f06199b52c447
```

This proved the problem was a stale installed/running executable, not browser
cache. The old process was later stopped and the new package installed.

### First Labs rebuild attempts

An initial CTF-style catalog/room named Vaultline/Inventory Trail was built,
but it still behaved as a simulated local HTTP training surface. Native tests
passed, but the user specifically requested practical labs comparable in
workflow to THM/HTB and a target running on the user's own system. That design
was rejected as insufficiently real and was replaced rather than presented as
a full machine.

### Current replacement design

The active catalog was rebuilt from scratch:

| ID | Category | Level | State |
|---|---|---|---|
| `web-exposure` | Web | Beginner | Implemented; real Docker target |
| `network-enumeration` | Network | Beginner | Planned; no environment |
| `linux-permissions` | Linux | Intermediate | Planned; no environment |
| `forensics-timeline` | Forensics | Advanced | Planned; no environment |

The implemented first lab is **Web Exposure — Harborline Dispatch**. It is an
original read-only HTTP target. Learners inspect a web page, metadata, crawler
exclusions, release information, an exposed support-export directory, and a
real ZIP backup. The backup contains the per-run flag in a deployment config.
The UI validates the submitted flag server-side/native-side without displaying
the answer in status or catalog metadata.

## 3. Current first-lab architecture

### Frontend

- `src/components/ScenarioLabs.tsx`: route wrapper and adapter injection.
- `src/components/LabRuntimeWorkspace.tsx`: filters, catalog, readiness state,
  Start/Open/Copy/Stop/Reset controls, target URL, flag submission.
- `src/lib/labTopicCatalog.ts`: four category/level entries above.
- `src/services/tauri/labRuntime.ts`: IPC adapter and strict status validation.
- UI uses `setup-required` honestly; it never fabricates a running target.
- Planned cards cannot be provisioned.

### Native runtime

- `src-tauri/src/commands/lab_runtime.rs`: six Tauri commands:
  `lab_runtime_start`, `status`, `stop`, `reset`, `open`, `action`.
- `src-tauri/src/services/lab_runtime.rs`: Docker engine checks, image/build
  context, owned network/container lifecycle, flag generation/checking,
  loopback forwarder, cleanup, and tests.
- `src-tauri/tests/lab_runtime_verify.rs`: ordinary contract tests and ignored
  real-Docker lifecycle test.
- `src-tauri/tests/lab_runtime_persistence_verify.rs`: verifies no old room or
  simulated checkpoint is resumed.
- `src-tauri/examples/lab_runtime_smoke.rs`: manual native lifecycle runner.

Status contract:

```json
{"running":false,"labId":null,"phase":"stopped","targetUrl":null,"message":"No practical lab is running.","runtime":"docker","completed":false}
```

Valid phases are `stopped`, `running`, `setup-required`, and `error`.

- Start frontend payload: `{ "labId": "web-exposure" }`.
- Action payload: `{ "action": { "action": "submit_flag", "flag": "..." } }`.
- No arbitrary command execution, shell, upload, credential, or target-selection
  action exists.
- Deprecated native `track`/`port` inputs are ignored and do not organize labs.

### Target assets

- `labs/web-exposure/Dockerfile`: Python Alpine base pinned by digest;
  nonroot UID/GID 10001.
- `labs/web-exposure/server.py`: fixed read-only routes and generated config.
- `labs/web-exposure/index.html`: original Harborline landing page.
- `labs/web-exposure/test_target.py`: standalone target route/backup tests.
- `labs/web-exposure/README.md`: target-specific documentation.

## 4. Safety and isolation decisions

The target is a container HTTP lab, **not** a full operating-system VM, SSH
lab, kernel-exploitation lab, or remote hosted machine. Do not claim otherwise.

- Requires local Docker CLI/daemon >=28; remote Docker endpoints are rejected.
- Image build uses `--network none` and a pinned base image digest.
- Runtime uses an internal Docker network and **no Docker port publishing**.
- Rust creates an ephemeral host `127.0.0.1` listener and forwards only to the
  ownership-checked container private IP on fixed port 8000.
- Forwarder bounds: 8 connections, 64 KiB request, 1 MiB response, 16 KiB
  buffers, 2-second idle timeout, 10-second connection lifetime.
- Container: read-only root filesystem, no host mounts, no privileged mode,
  dropped capabilities, no-new-privileges, nonroot user, 96 MiB memory,
  32 PID limit, 0.5 CPU.
- The target flag is per-run and rotates on Reset.
- Stop/reset/error/drop clean only ownership-verified NET0ZE resources.
- No global Docker prune/delete is allowed as recovery.
- Internal Docker networking is not a universal host/kernel security boundary;
  future privilege/kernel labs need an appropriate VM boundary.

## 5. Research used

- HTB lab/VPN/provisioning model:
  https://help.hackthebox.com/en/articles/5185687-introduction-to-lab-access
- THM service enumeration and misconfiguration workflow:
  https://tryhackme.com/room/networkservices
- VulnHub local lab isolation and clean-state guidance:
  https://www.vulnhub.com/lab/network/
- Docker port publication and loopback-binding caveats:
  https://docs.docker.com/engine/network/port-publishing/

Research was used for architecture and learning-flow comparison. No third-
party challenge text, flags, target files, or machine content was copied.

## 6. Actual verification evidence

Checks completed during the implementation session:

- `npm test`: passed; 133 frontend/lib tests plus 5 script tests after old room
  browser harnesses were removed.
- `node --import tsx --test src/services/tauri/labRuntime.test.ts`: 2 passed.
- TypeScript build/typecheck: passed.
- `npm run lint`: passed exit status with existing unrelated warnings.
- `npm run build`: passed with existing chunk/dynamic-import warnings.
- Standalone Python target tests: 2 passed.
- Native ordinary integration/checkpoint tests: 3 passed.
- Real Docker lifecycle integration: 1 passed.
- Native runtime tests with ignored tests included: 6 passed. These verified
  sandbox controls, no default route, denied TCP connection to `1.1.1.1:443`,
  flag recovery/rotation, worker cancellation, and teardown.
- `npx tauri build --bundles deb`: passed.
- Linux DEB staging/install: passed.
- `dpkg -V net0ze`: no package mismatches after final install.
- `git diff --check`: passed at the relevant saves.

Not completed:

- Installed GUI Start/Open/submit/Reset/Stop visual/IPC acceptance by an agent.
  The native real-container path passed, but no desktop-control extension was
  available for visual UI confirmation. The next human/agent step is this flow.
- macOS/Windows provisioning.
- Crash-orphan Docker resource recovery.
- Production readiness/cross-platform claims.

## 7. Installation and development commands

Clone the backed-up source:

```sh
git clone https://github.com/1viz3r0/xtreme-sexo.git
cd xtreme-sexo
git checkout master
npm ci
```

Run checks:

```sh
npm test
npm run lint
npm run build
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/web-exposure -p test_target.py -v
```

Run desktop development:

```sh
npm run desktop:dev
```

Docker requirement on Kali/Debian:

```sh
sudo apt update
sudo apt install docker.io docker-cli
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Sign out/in after group changes, or use `sg docker -c 'docker version'`.

Build Linux installer:

```sh
npx tauri build --bundles deb
node scripts/stage-native-release.mjs linux --formats deb
sudo dpkg -i releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb
```

The project's Linux native toolchain used during verification was under
`target/native-tooling`; it is generated/local and intentionally not in Git.

## 8. Git history and backup state

The GitHub repository contains the full tracked source snapshot: 360 tracked
files at the last verification, including frontend, Rust/Tauri backend, Labs,
tests, docs, lockfiles, and config. It intentionally excludes generated or
private state: `node_modules`, `target`, `src-tauri/target`, `dist`, release
staging, databases, environment files, logs, and handoff ZIP archives.

Relevant local/remote commits:

1. Existing project history up to the original NET0ZE development baseline.
2. `37ea734 chore: snapshot project for xtreme-sexo` — safe source snapshot.
3. `ca5bd48 chore: defer workflow upload until github scope is granted` —
   removed the optional workflow after GitHub rejected OAuth without scope.
4. `bab99e7 docs: record github backup and resume state` — recorded the remote,
   branch, files, and continuation instructions.

Remote currently points to commit `bab99e7` on `master`.

The optional `.github/workflows/desktop-build.yml` is not on GitHub because the
authorized CLI OAuth token had `repo` but not `workflow` scope. It was removed
before the successful push. Restore it only after explicitly granting that
scope, then commit and push it separately.

## 9. Exact current continuation order

1. Clone/open the GitHub repository and read this file plus
   `docs/NETOZE_LABS_RESUME_MANUAL.md`.
2. Preserve unrelated project changes; do not reset/clean or revive old rooms.
3. Confirm Docker version/daemon access.
4. Run the installed or development app and perform:
   Labs → Start Web Exposure → Open target → investigate → submit flag →
   Reset → verify new flag → Stop.
5. Record the actual UI outcome. If it fails, debug the IPC/UI message before
   adding any other lab.
6. Add crash-orphan ownership-safe cleanup and failed-build cleanup tests.
7. Decide a Docker Desktop ingress strategy before cross-platform support.
8. Only then implement one next original practical lab at a time. Do not mark
   planned Network/Linux/Forensics cards working until their environments and
   real acceptance tests exist.

## 10. Agent instructions and non-negotiables

- This is the current source of truth for project history and Labs direction.
- Never reintroduce Red/Blue/Purple divisions or simulated fallback rooms.
- Never claim a planned lab, VM, SSH service, full scanner, or remote machine
  exists when it does not.
- Keep setup-required/error states honest.
- Never ask for or store passwords, tokens, cookies, private keys, or raw local
  app data in the repository.
- Never use a user's private memory/session transcript as a committed artifact.
- Preserve unrelated dirty work; inspect status/diff before editing.
- Run the smallest meaningful test after changes and report actual results.
- Do not commit/push broad unrelated changes without inspecting them.

## 11. Primary files

- `docs/NETOZE_PROJECT_CONTEXT.md` — this single comprehensive context file.
- `docs/NETOZE_LABS_RESUME_MANUAL.md` — detailed Labs resume/manual.
- `docs/LABS_LOCAL_REBUILD.md` — research, runtime evidence, and package state.
- `docs/NETOZE_HANDOFF.md` — project handoff with historical notes.
- `src/components/LabRuntimeWorkspace.tsx` — Labs UI.
- `src/lib/labTopicCatalog.ts` — category/level catalog.
- `src/services/tauri/labRuntime.ts` — frontend IPC adapter.
- `src-tauri/src/services/lab_runtime.rs` — native Docker runtime.
- `src-tauri/src/commands/lab_runtime.rs` — native command wrappers.
- `src-tauri/tests/lab_runtime_verify.rs` — real lifecycle tests.
- `labs/web-exposure/` — first practical target.

## 12. Next-session prompt

> Read `docs/NETOZE_PROJECT_CONTEXT.md` first. Continue NET0ZE from the GitHub
> `master` branch in `https://github.com/1viz3r0/xtreme-sexo`. The first real
> Docker Web Exposure lab is implemented and native sandbox/lifecycle tests
> passed. First perform and record the installed GUI flow: Labs → Start → Open
> target → discover/submit → Reset → Stop. Preserve unrelated changes. Do not
> revive Red/Blue or simulated rooms and do not claim planned labs are working.
> If UI acceptance passes, fix crash-orphan cleanup next; only then implement
> the next original practical lab one at a time.

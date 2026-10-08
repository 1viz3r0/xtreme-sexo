# NET0ZE Labs — resume manual

Saved: 2026-10-08. This is the current, self-contained handoff for the Labs
rebuild. Earlier Red/Blue, Purple-Team, inventory-worksheet, and Vaultline
designs are historical and must not be used as the implementation baseline.

## 1. Start here: where we left off

**The first real container lab is implemented, tested, packaged, and installed.**
The remaining immediate task is user-visible acceptance of the installed
React -> Tauri -> Docker -> target flow. Do that before building another lab.

1. Open the installed NET0ZE app.
2. Open **Labs**. Expect **Practical labs**, category/level filters, one
   **Web Exposure** card marked **Ready to provision**, and three planned labs.
3. Press **Start**. Expect a confirmed running state and an ephemeral
   `http://127.0.0.1:<port>/` target URL. Do not reuse an old room URL.
4. Press **Open target**. Expect **Harborline Dispatch**, NOT the old
   "Safe Purple-Team Practice" page.
5. Investigate the target, recover its flag, and submit it in NET0ZE.
6. Confirm completion, then Reset. Confirm the old flag is rejected and a
   newly recovered flag is accepted. Stop and confirm the old URL is closed.

**Not yet established:** installed-app visual/IPC end-to-end acceptance.
Native real-container tests passed; that is not proof of this GUI flow.
There was no desktop-control extension available to perform the visual check.

At this handoff's final read-only check, **no NET0ZE process was running** and
there were **no Docker containers or dedicated lab networks**. Do not assume
earlier PID 149079 is still alive. No processes were started/stopped for this
handoff request.

## 2. Project and worktree

- Project: `/home/kalu/Desktop/code/MY-SECRET-NETOZE`
- Platform verified: Kali Linux Rolling, Linux x86_64.
- Stack: React/TypeScript/Vite frontend, Tauri/Rust native app, Docker target
  implemented with the Python standard library.
- Branch at save: `master`.
- Git HEAD: `d0886b95a3fac48d31b3fc9d4d4b215d1f3ad3a4`.
- The Labs rebuild is **uncommitted**. HEAD alone does not contain this work.
- The worktree has substantial unrelated modifications and untracked files.
  Preserve them. Do not reset, clean, bulk-delete, or stage everything.
- No commit, push, PR, or production deployment was performed.

## 3. User decisions and scope

- Rebuild **Labs only**, preserve the rest of NET0ZE and existing saved data.
- No Red/Blue/Purple division. Organize by category, level, and actual readiness.
- Practical exercises use real locally provisioned targets, not worksheets
  that pretend to be machines.
- Use THM/HTB as workflow references; create original NET0ZE content.
- Begin with one complete lab. Do not present planned labs as implemented.
- User explicitly approved Docker installation, NET0ZE installation/restart,
  and adding `kalu` to the docker group after its root-equivalent access warning.
- Administrator authentication belongs only in OS prompts/terminal, never chat.

## 4. What exists now

| Lab ID | Category | Level | State |
|---|---|---|---|
| `web-exposure` | Web | Beginner | Implemented; provisions a target |
| `network-enumeration` | Network | Beginner | Planned; no environment |
| `linux-permissions` | Linux | Intermediate | Planned; no environment |
| `forensics-timeline` | Forensics | Advanced | Planned; no environment |

Web Exposure is the original **Harborline Dispatch** application. The actual
HTTP misconfiguration is a public deployment/support backup containing the
per-run training flag. Learners use a browser or curl to investigate.

Start generates a fresh flag and private temporary build context, builds an
owned image, creates an internal network and container, and confirms target
HTTP health. Reset tears down/recreates the target and rotates the flag.
Stop removes only ownership-verified resources. Status never discloses the flag.

This is a **container HTTP challenge**, not a full OS VM, SSH service, remote
hosted machine, or completed multi-machine HTB equivalent.

### Isolation and networking

- Local Docker CLI and daemon version >=28; remote engines rejected.
- Image base pinned to the digest in `labs/web-exposure/Dockerfile`.
- Nonroot UID/GID 10001, read-only root filesystem, dropped capabilities,
  no-new-privileges, no host mounts, and no privileged mode.
- Limits: 96 MiB memory, 32 PIDs, 0.5 CPU.
- Internal Docker network; **no Docker ports published**.
- Rust binds an ephemeral `127.0.0.1` listener and forwards only to the
  ownership-checked container IP on port 8000.
- Forwarder limits: 8 simultaneous connections, 64 KiB request, 1 MiB
  response, 16 KiB directional buffers, 2-second idle and 10-second lifetime.
- Error/reset/stop/drop cancels and joins connection workers.
- Internal networking is not a complete isolation boundary against host
  services. Do not use this design for kernel-exploitation challenges.

## 5. Relevant files and responsibilities

| Path | Purpose |
|---|---|
| `src/components/ScenarioLabs.tsx` | Labs route wrapper and injected adapter |
| `src/components/LabRuntimeWorkspace.tsx` | Catalog, filters, lifecycle controls, flag form |
| `src/components/ScenarioLabs.test.ts` | Mounted UI and setup-state tests |
| `src/lib/labTopicCatalog.ts` | Current four-card category/level catalog |
| `src/lib/labTopicCatalog.test.ts` | Catalog/readiness assertions |
| `src/services/tauri/labRuntime.ts` | IPC adapter, serialization and contract validation |
| `src/services/tauri/labRuntime.test.ts` | Exact command envelope/validation tests |
| `src-tauri/src/commands/lab_runtime.rs` | Six native IPC commands |
| `src-tauri/src/services/lab_runtime.rs` | Docker lifecycle, forwarder, flags, cleanup, unit tests |
| `src-tauri/tests/lab_runtime_verify.rs` | Native contracts and real container lifecycle |
| `src-tauri/tests/lab_runtime_persistence_verify.rs` | Reject old checkpoint/simulation resumption |
| `src-tauri/examples/lab_runtime_smoke.rs` | Native manual runner with stdin lifecycle commands |
| `labs/web-exposure/Dockerfile` | Pinned Python base and nonroot target image |
| `labs/web-exposure/server.py` | Actual target HTTP application |
| `labs/web-exposure/index.html` | Original target landing page |
| `labs/web-exposure/test_target.py` | Standalone actual HTTP discovery/route tests |
| `labs/web-exposure/README.md` | Target design and test usage |
| `src-tauri/src/lib.rs` | Existing native state initialization/handler wiring |
| `src-tauri/src/services/mod.rs`, `src-tauri/src/commands/mod.rs` | Existing module wiring |
| `src/App.tsx` | Existing Labs routing; preserve unrelated changes |
| `scripts/stage-native-release.mjs` | Release staging |
| `docs/LABS_LOCAL_REBUILD.md` | Research and historical-to-current evidence |
| `docs/NETOZE_HANDOFF.md` | Project-wide handoff; older sections are historical |

Removed obsolete room assets: `src-tauri/src/services/lab_room.{html,js,css}`,
`scripts/lab-room-browser.test.mjs`, and `scripts/lab-room-live-smoke.mjs`.
The earlier Purple-Team catalog/adapter/native service were already removed.
Do not recreate those as a fallback when Docker setup is unavailable.

## 6. IPC contract for continued development

```json
{"running":false,"labId":null,"phase":"stopped","targetUrl":null,"message":"No practical lab is running.","runtime":"docker","completed":false}
```

Phases: `stopped`, `running`, `setup-required`, `error`.

- `lab_runtime_start`: frontend arguments `{labId: "web-exposure"}`.
  Deprecated optional native track/port inputs are ignored, not lab categories.
- `lab_runtime_status`, `lab_runtime_stop`, `lab_runtime_reset`,
  `lab_runtime_open`: no frontend arguments.
- `lab_runtime_action`: `{action: {action: "submit_flag", flag: "..."}}`.
  No arbitrary execution/action path.
- `setup-required` is a genuine nonrunning state, never a simulation fallback.
- Add a future lab only by updating frontend validation and native dispatch
  together, then testing the same full contract.

## 7. Checks run and actual results

These are results from the implementation session, not checks rerun just to
write this document. Run commands from the project directory above.

| Check | Result |
|---|---|
| `npm test` | Passed: 133 frontend/lib tests + 5 script tests after obsolete room tests were removed |
| `node --import tsx --test src/services/tauri/labRuntime.test.ts` | Passed: 2 adapter tests |
| `npx tsc -b --pretty false` / build typecheck | Passed |
| `npm run lint` | Passed exit status; existing unrelated warnings remain |
| `npm run build` | Passed; existing chunk-size/dynamic-import warnings remain |
| Standalone Python target tests | Passed: 2 |
| Native ordinary integration + checkpoint-rejection tests | Passed: 3; real Docker test separately executed |
| Real Docker lifecycle integration | Passed: 1 |
| Native lab unit tests with ignored tests enabled | Passed: 6, including effective sandbox/egress probe |
| `npx tauri build --bundles deb` | Passed |
| Linux DEB staging and installation | Passed |
| `dpkg -V net0ze` | No mismatches after final installation |
| Installed/running executable hash comparison | Matched after restart; historical PID now exited |
| `git diff --check` | Passed at handoff save |
| Installed GUI start/discover/submit/reset/stop flow | **Not yet confirmed** |
| macOS / Windows target provisioning | **Not tested** |

Real tests verified flag recovery and reset rotation, connection cancellation,
effective container controls, no Docker published bindings, no default route,
denied TCP connection to `1.1.1.1:443`, and proxy shutdown on unexpected target
termination. This egress probe is evidence for that connection, not a blanket
proof against every possible host/network interaction.

### Commands to repeat

```sh
npm test
node --import tsx --test src/services/tauri/labRuntime.test.ts
npx tsc -b --pretty false
npm run lint
npm run build
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning -m unittest discover -s labs/web-exposure -p test_target.py -v
```

On this machine Cargo lives in project-local tooling. In a terminal at the
project root, use the existing setup rather than installing/changing toolchains:

```sh
export CARGO_HOME="$PWD/target/native-tooling/netoze-toolchain/cargo"
export RUSTUP_HOME="$PWD/target/native-tooling/netoze-toolchain/rustup"
sysroot="$PWD/target/native-tooling/netoze-sysroot"
export PATH="$CARGO_HOME/bin:$sysroot/usr/bin:$PATH"
export PKG_CONFIG_SYSROOT_DIR="$sysroot"
export PKG_CONFIG_PATH="$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/share/pkgconfig"
export CARGO_BUILD_JOBS=1

sg docker -c 'cargo test --manifest-path src-tauri/Cargo.toml --release --test lab_runtime_verify --test lab_runtime_persistence_verify -- --test-threads=1'
sg docker -c 'cargo test --manifest-path src-tauri/Cargo.toml --release --test lab_runtime_verify -- --ignored --test-threads=1'
sg docker -c 'cargo test --manifest-path src-tauri/Cargo.toml --release --lib services::lab_runtime -- --include-ignored --test-threads=1'
```

Toolchain directories are intentionally not included in the ZIP. These commands
depend on the existing project/environment. On another system, use its approved
Rust/Tauri setup instead of treating these local paths as portable requirements.

## 8. Installation and current system state

- Docker client and daemon checked at save: `28.5.2+dfsg4`.
- Kali packages installed: `docker.io` and `docker-cli` (plus required dependencies).
- `kalu` is in the docker group. This is root-equivalent access approved by
  the user, not an innocuous app permission.
- New group membership requires sign-out/sign-in for ordinary existing desktop
  sessions. Alternatively launch from a refreshed group session:
  `sg docker -c '/usr/bin/netoze-desktop'`.
- Package name: **`net0ze`**, executable: `/usr/bin/netoze-desktop`.
- Latest built installer: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`.
- The existing AppImage was NOT rebuilt/verified in this work; do not assume
  it contains the latest Labs changes.

Installer SHA-256 (rechecked at handoff save):
```text
b8effeb6fc422d6773fde5d74648e61ce1e838f1d0714748ea476f09c762c756
```
Installed executable SHA-256 (rechecked at handoff save):
```text
01735cb6d8815ed3e6f3c874714563f084bc9ccbab7cf454d52f2e36fe15cef8
```

Tauri packaging strips/patches the executable, so a raw build hash need not
equal the installed hash. Compare with the executable inside the DEB if needed:

```sh
sha256sum releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb /usr/bin/netoze-desktop
dpkg-deb --fsys-tarfile releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb | tar -xOf - usr/bin/netoze-desktop | sha256sum
dpkg -V net0ze
pgrep -a netoze-desktop
```

If continuing code changes, rebuild/stage before installation:

```sh
npx tauri build --bundles deb
node scripts/stage-native-release.mjs linux --formats deb
```

Install only after closing NET0ZE and receiving OS authorization:
```sh
sudo dpkg -i "/home/kalu/Desktop/code/MY-SECRET-NETOZE/releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb"
```
Do not restart/reinstall simply to read the handoff, and never request the
administrator password in a chat.

## 9. Useful failures and troubleshooting

### Old Purple-Team page

The old placeholder was conclusively served by old PID 105538 from
`/usr/bin/netoze-desktop` on `127.0.0.1:46625`. HTTP read and matching old
running/installed hashes proved it was an old binary, not merely browser cache.
The final installed app was restarted; that old listener disappeared.

If the phrase reappears, inspect the process owning that URL's port and compare
installed/packaged/running executable identity. Do not blindly delete saved
files or repeatedly rebuild without identifying the serving process.

### Provisioning failures fixed

1. Original Dockerfile used `COPY --chmod`, which depended on BuildKit.
   Removed that unnecessary dependency for Kali's classic builder.
2. Internal-network target did not get the expected Docker published mapping.
   Replaced publishing with the owned Rust loopback forwarder; kept egress
   restrictions rather than switching to a normal internet-enabled network.
3. Initial subagent test attempts could not find Cargo on PATH. The existing
   project-local tooling was used successfully; native tests are not blocked now.

### Runtime checks

```sh
sg docker -c 'docker version'
sg docker -c 'docker info'
systemctl is-active docker
pgrep -a netoze-desktop
ss -ltnp
sg docker -c 'docker ps --all --format "{{.ID}} {{.Names}} {{.Status}}"'
sg docker -c 'docker network ls'
```

- `setup-required`: missing/old engine, daemon unavailable, or socket permissions.
  Check group-session refresh before assuming an application bug.
- `error`: record the exact UI message. Stop is available for pending cleanup;
  repair Docker access and then reconcile state before retrying provision.
- A new target port is expected after reset. Never hard-code the old port.
- Do not expose target ports on `0.0.0.0`, use privileged mode, add host mounts,
  or grant the target the Docker socket to make a failing lab start.
- Never run global `docker system prune`, image prune, or container/network
  deletion commands as recovery. Ownership-check only NET0ZE resources.

## 10. Remaining work, in order

1. **Immediate:** perform the installed-app acceptance steps in section 1.
   Record actual UI messages/outcomes; fix any IPC/UI mismatch in this same lab.
2. Capture that acceptance in `docs/NETOZE_HANDOFF.md` and this manual.
3. Add ownership-safe crash-orphan resource recovery. Abrupt app/daemon crashes
   can leave run-labeled containers/networks/images; current memory-only state
   does not automatically adopt/clean an earlier process's run.
4. Establish resource cleanup/cache behavior under failed builds without
   deleting unrelated Docker resources.
5. Decide a platform-specific ingress strategy before claiming macOS/Windows
   support. Direct container-IP access is Linux-tested and differs on Docker Desktop.
6. Only after Web Exposure acceptance, choose the next original lab and define
   real target behavior, setup/reset/teardown, flags, and acceptance tests.
   Full-system/privilege-escalation labs need an appropriate VM boundary, not
   arbitrary host execution or this HTTP target's container assumptions.

No delegated implementation tasks remain running or awaiting integration.
Backend/target and UI/adapter work were integrated and checked.

## 11. Research references

- HTB access/provisioned lab networks:
  https://help.hackthebox.com/en/articles/5185687-introduction-to-lab-access
- THM service-enumeration/misconfiguration workflow:
  https://tryhackme.com/room/networkservices
- VulnHub local vulnerable-target network isolation:
  https://www.vulnhub.com/lab/network/
- Docker port-publishing caveats:
  https://docs.docker.com/engine/network/port-publishing/

The final internal-network design uses no Docker publishing; the publishing
research remains relevant background, not a description of current ingress.
No third-party challenge content was copied.

## 12. Compressed handoff contents and use

ZIP: `docs/NETOZE_LABS_RESUME_2026-10-08.zip`.
It contains this manual, the reviewed rebuild notes, Labs-specific source,
target assets/tests, native/frontend lab tests, the smoke example, and the
latest DEB installer. Paths are preserved relative to the project root.

It is **not a full repository backup** or standalone buildable checkout.
Existing routing/module wiring, dependency manifests, approved toolchains, and
the rest of the original app are required for source-based continuation.
The included DEB is the independently installable artifact for this Linux host.

Excluded: credentials, environment files, personal data, app databases, logs,
live flags/build contexts, node_modules, target caches, .git, unrelated source,
and stale AppImage. No raw private session transcript is included.

Validate the archive with `unzip -t` and its sibling `.zip.sha256` checksum.
Extract into a separate review folder first. Compare files with the existing
dirty worktree; do not blindly overwrite the project or delete unrelated work.

### Next-session starter prompt

> Read docs/NETOZE_LABS_RESUME_MANUAL.md first. Continue only the NET0ZE Labs
> rebuild in /home/kalu/Desktop/code/MY-SECRET-NETOZE. The Docker Web Exposure
> target passed real native lifecycle/sandbox tests and the final DEB is installed.
> First confirm the installed Labs -> Start -> Open target -> submit -> Reset ->
> Stop flow with the user. Preserve unrelated dirty work. Do not revive Red/Blue
> simulation rooms or claim the three planned labs are implemented. Use the manual
> for source paths, toolchain setup, verification commands, and remaining gaps.

# Practical Labs rebuild — 2026-10-08

## Current implementation

This supersedes the earlier Red/Blue and fictional inventory lab designs.
The active catalog has one implemented target, Web Exposure (Web, Beginner),
and three clearly planned exercises. No old checkpoint or simulated room is
resumed. Existing saved files and unrelated app features were preserved.

Web Exposure is an original Harborline Dispatch HTTP application with a real
public deployment backup. Learners investigate it with a browser/curl and
submit a per-run flag. Start provisions a Docker target; Reset recreates it;
Stop removes only resources whose ownership labels match this run. The legacy
room HTML/JS/CSS and their browser smoke harnesses were removed.

The target uses a local Docker daemon >=28, an internal network, an ephemeral
127.0.0.1 forwarder port, nonroot execution, read-only filesystem, dropped
capabilities, no-new-privileges, and CPU/memory/PID limits. This is a container
HTTP lab, not a full operating-system VM, SSH lab, or remote hosted machine.
An internal bridge is not a security boundary against every host service;
do not treat containers as suitable for kernel-exploitation exercises.

## Research used

- HTB lab access: https://help.hackthebox.com/en/articles/5185687-introduction-to-lab-access
  — provisioned targets and private lab access; geographic distance is not a
  prerequisite for practical training.
- TryHackMe Network Services: https://tryhackme.com/room/networkservices
  — service enumeration and misconfiguration exercises. No challenge content copied.
- VulnHub local lab networking: https://www.vulnhub.com/lab/network/
  — isolate vulnerable targets from ordinary machines and restore clean states.
- Docker publishing: https://docs.docker.com/engine/network/port-publishing/
  — publishing without an explicit host bind exposes services; loopback binds
  are used, and versions before 28 have a documented same-L2 exposure caveat.

## Checks actually run

- `npm test`: 133 frontend/lib tests and 5 script tests passed after removal
  of obsolete room tests.
- `node --import tsx --test src/services/tauri/labRuntime.test.ts`: 2 passed.
- Typecheck/frontend build passed. Lint exited successfully with existing
  unrelated warnings; native compile also reports existing warnings.
- Release native integration tests: 3 passed, 1 Docker test ignored.
- Release native lab unit tests: 4 passed, 1 Docker test ignored.
- Standalone Python HTTP tests: 2 passed (actual target backup recovery and
  route boundaries). These do not verify container deployment/isolation.
- `npx tauri build --bundles deb` and Linux release staging succeeded.

## Initial installation / real acceptance blocker (resolved below)

Docker was initially absent. Container lifecycle, effective isolation, egress denial,
and packaged-app UI acceptance had NOT been verified at the initial build.
See the completed live verification below for the current state.

An actual HTTP read of the running old app at 127.0.0.1:46625 returned the
Safe Purple-Team placeholder. PID 105538 was running /usr/bin/netoze-desktop,
whose SHA-256 was `9b827f4aee3ceb4b918cbddb1fca12ce8eafe74cc0ef5350c03f06199b52c447`.
This diagnosis is based on the listener, HTTP response, process executable,
and matching running/installed binary hashes, not just a source search.

New installer: `releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb`
SHA-256: `924b5a43bf676996ffc0ef5990cc49063eb16e1b9553a856e3673299fbbecff9`
New binary SHA-256: `8059133f91de731ce6dbd4e6e4dcf82b5b2f534d0dbe6bb7313fb13de482352b`

Next: install/start Docker >=28 with OS authorization, close old NET0ZE,
install the new DEB, reopen it, and run opt-in Docker acceptance tests plus
the UI Start -> discover -> submit -> Reset -> Stop flow. Compare installed
and running binary hashes again. No installation or old process termination
has been performed in this rebuild.

## Completed system setup and live verification

With explicit user approval, installed Kali's `docker.io` and `docker-cli`
28.5.2 packages, started the local engine, and added `kalu` to the docker group.
The user approved the root-equivalent access warning. No global cleanup,
unrelated package upgrade, or private-data deletion was performed.

Two real-test failures were repaired before the passing run: removed
BuildKit-only COPY chmod syntax, and replaced unsupported internal-network
port publishing with a bounded owned Rust loopback forwarder. The forwarder
targets only an ownership-checked private container IP:8000; Docker publishes
no ports. The Python base image is now pinned to its fetched SHA-256 digest.

Real native checks through `sg docker -c`, with the project's toolchain/sysroot:
- Docker lifecycle integration: 1 passed, including recovery, flag submission,
  flag rotation, and connection cancellation on reset/stop/drop.
- Lab unit tests with `--include-ignored`: 6 passed, including effective
  sandbox configuration, no default route, denied TCP connection to
  1.1.1.1:443, and proxy shutdown after unexpected container termination.
- Ordinary integration/legacy-checkpoint rejection checks: 3 passed.
- No remaining test containers or dedicated lab networks after these runs.

Final tested rebuild was staged and installed with `dpkg`; `dpkg -V net0ze`
reported no mismatches. Restarted old PID 105538 with TERM and launched
`/usr/bin/netoze-desktop` in a refreshed docker-group session (new PID 149079).
The old 46625 placeholder listener is gone; HTTP connection now fails there.

Final installer SHA-256:
`b8effeb6fc422d6773fde5d74648e61ce1e838f1d0714748ea476f09c762c756`
Installed AND running executable SHA-256 (verified independently):
`01735cb6d8815ed3e6f3c874714563f084bc9ccbab7cf454d52f2e36fe15cef8`

The current app has Docker access. Normal launcher sessions need a sign-out
and sign-in to pick up new group membership. Packaged-app visual/IPC acceptance
still requires the user to open Labs and press Start; no desktop-control
extension is available to this agent. The native lifecycle passed, but that
does not prove the packaged React-to-Tauri UI flow.

Remaining gaps: automatic recovery of crash-orphan resources and non-Linux
platform verification. The direct container-IP forwarder is Linux-tested;
Docker Desktop on macOS/Windows has different host/container networking.
Do not claim production readiness or cross-platform acceptance.

# NET0ZE Full Setup Guide

This is the complete setup guide for NET0ZE: source development, native desktop
builds, Linux and Windows installation, Docker Labs, packet-capture permissions,
runtime data, verification, troubleshooting, and contribution workflow.

NET0ZE is a local, authorized desktop cybersecurity investigation platform. It
uses a React/TypeScript/Vite frontend, a Tauri 2 desktop shell, and a Rust
native backend. The installed application does **not** require a localhost web
server, MongoDB, or a separate Express backend.

> **Authorization and safety:** Use NET0ZE only on systems, interfaces, Docker
> resources, and data that you are authorized to inspect. Startup is passive;
> capture, connectivity checks, enrichment, threat-feed refreshes, port checks,
> and Labs require explicit user actions.

## 1. What is supported

| Platform | Supported setup | Important limitation |
| --- | --- | --- |
| Linux x86_64 | Development, DEB, and AppImage | The DEB is the normal installed path when capture-helper integration is needed. |
| Windows x64 | Native Tauri packaging with NSIS/MSI; Npcap for live capture | Windows runtime and installer acceptance must be verified on Windows. |
| macOS | No current packaged/runtime claim | Do not treat the Linux or Windows instructions as macOS support. |

The shared UI does not make platform data interchangeable. Linux uses libpcap;
Windows uses Npcap. If an operating-system source or permission is unavailable,
NET0ZE must show it as unavailable rather than inventing telemetry.

## 2. Repository layout

Important directories and files:

```text
src/                         React/TypeScript frontend and frontend tests
src-tauri/                   Tauri configuration, Rust commands and services
labs/                        Local practical Lab targets and target tests
scripts/                     Build, install, staging, and release checks
docs/                        Architecture, handoff, backend, and Lab manuals
server/                      Retired demo backend; do not restore or run it
package.json                npm scripts and dependency declarations
package-lock.json            Locked JavaScript dependency set
Full-Setup-Guide.md          This guide
```

Generated or private paths are intentionally not source dependencies:

```text
node_modules/  dist/  target/  src-tauri/target/  releases/
.env*          *.db  *.sqlite*  logs/  squashfs-root/
```

Regenerate those paths only when needed. Never commit credentials, private
databases, logs, build caches, generated installers, or raw session data.

## 3. Requirements

### 3.1 Required for source development

- Git
- Node.js 22 or newer
- npm
- Rust and Cargo with a working Tauri-compatible toolchain
- Python 3 for standalone Lab target tests
- A C/C++ build toolchain for native packaging

The project was previously verified with Rust/Cargo 1.98.1. Use the approved
toolchain available for the checkout; do not replace a working local toolchain
just to match that version.

### 3.2 Required for Linux native development

On Debian, Ubuntu, or Kali:

```bash
sudo apt update
sudo apt install -y \
  build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libpcap-dev
```

The package names may differ on other distributions. You need equivalent GTK,
WebKit, OpenSSL, AppIndicator, librsvg, patchelf, and libpcap development
packages.

### 3.3 Required for Docker Labs

The practical Labs runtime requires:

- a **local** Docker CLI and daemon;
- Docker Engine version 28 or newer;
- permission for the current user to access the Docker socket.

Remote Docker endpoints are rejected. The first target-image build may need
registry access to obtain the pinned base image. After the image is available,
the target build uses a no-network build step.

### 3.4 Required for Windows packaging

Build Windows natively on Windows when you need a supported MSI/NSIS release:

- Node.js 22 or newer and npm;
- Rust stable with the MSVC toolchain;
- Visual Studio C++ Build Tools;
- the Windows SDK;
- the Npcap SDK, with `wpcap.lib` available for the target architecture.

The Npcap **SDK** is a build-time dependency. The Npcap **runtime** is a
separate end-user prerequisite for live capture and is not silently redistributed
by NET0ZE.

## 4. Clone and install the source

```bash
git clone https://github.com/1viz3r0/xtreme-sexo.git
cd xtreme-sexo
git checkout master
npm ci
```

Before editing, inspect the worktree and the project instructions:

```bash
git status --short --branch
```

Read these files for project-specific continuation and safety rules:

1. `AGENTS.md`
2. `docs/NETOZE_PROJECT_CONTEXT.md`
3. `docs/NETOZE_LABS_RESUME_MANUAL.md`
4. `docs/LABS_LOCAL_REBUILD.md`
5. `docs/NETOZE_HANDOFF.md`
6. `PROJECT_INVENTORY.md`

## 5. Start the application for development

### 5.1 Frontend-only development

```bash
npm run dev
```

This starts Vite for UI work. It does not prove Tauri IPC, native storage,
packet capture, Docker Labs, or desktop packaging.

### 5.2 Native Tauri development

```bash
npm run desktop:dev
```

The native application owns local capture, host/network observations, bounded
enrichment, SQLite persistence, logs, and the desktop IPC boundary.

Startup does **not** automatically:

- start packet capture;
- scan a subnet or public ports;
- request the public IP;
- run connectivity checks;
- download threat feeds;
- expose an HTTP server on the network.

Use the explicit controls in the application for those operations.

### 5.3 The retired `server/` directory

Do not start `server/` and do not install MongoDB for NET0ZE. The old Express+
Mongoose demo backend served fabricated data and was removed from the desktop
architecture. The directory remains only as a retirement note.

## 6. Install a published release

Published releases are intended for end users. End users do not need Node.js,
Rust, npm, or a web server. Download the complete platform directory, keep its
`manifest.json` beside the installer, verify SHA-256 values, and then install.

Release page:

```text
https://github.com/1viz3r0/xtreme-sexo/releases
```

### 6.1 Linux DEB: recommended installed path

From a release directory containing the package:

```bash
cd releases/linux/2.0.0-x64
sha256sum NET0ZE_2.0.0_amd64.deb
sudo apt install ./NET0ZE_2.0.0_amd64.deb
```

If a lower-level recovery is required:

```bash
sudo dpkg -i ./NET0ZE_2.0.0_amd64.deb
sudo apt-get install -f
```

The DEB installs the application and Linux capture helper integration. The
capture helper may require administrator approval during installation. The GUI
itself remains unprivileged.

Launch **NET0ZE** from the application menu after installation. Close every
old NET0ZE window before launching the new package; an already-running Tauri
window keeps its previously loaded frontend.

### 6.2 Linux AppImage: portable alternative

```bash
cd releases/linux/2.0.0-x64
sha256sum NET0ZE_2.0.0_amd64.AppImage
chmod +x NET0ZE_2.0.0_amd64.AppImage
./NET0ZE_2.0.0_amd64.AppImage
```

The AppImage does not install the privileged capture helper. Some locked-down
systems or containers lack FUSE support and cannot mount an AppImage; use the
DEB when system integration or capture-helper support is required.

To copy an AppImage with the repository helper without rebuilding:

```bash
npm run install:linux -- \
  --artifact releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage \
  --destination "$HOME/.local/share/netoze/NET0ZE.AppImage" \
  --force
```

Preview the action without modifying the system:

```bash
bash scripts/install-linux.sh \
  --artifact releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage \
  --dry-run
```

### 6.3 Windows installer

The normal Windows end-user download is the NSIS installer:

```text
NET0ZE_2.0.0_x64-setup.exe
```

Run it once, then launch NET0ZE from the Windows Start menu. The Tauri bundle is
configured with a WebView2 bootstrapper for systems where WebView2 is missing.

From PowerShell, the repository helper can launch one staged installer:

```powershell
.\scripts\install-windows.ps1 -Artifact ".\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64-setup.exe"
```

Use a dry run to validate selection without launching anything:

```powershell
.\scripts\install-windows.ps1 `
  -Artifact ".\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64-setup.exe" `
  -DryRun
```

If an MSI is present in the manifest, it can be installed with:

```powershell
msiexec /i .\NET0ZE_2.0.0_x64_en-US.msi
```

The cross-build path is NSIS-only and does not count as Windows runtime
verification. Native Windows packaging is required when MSI output or Windows
runtime evidence is needed.

## 7. Configure Docker Labs

### 7.1 Debian, Ubuntu, or Kali

```bash
sudo apt update
sudo apt install -y docker.io docker-cli
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Start a new login session after changing group membership. For a one-off
refreshed group session:

```bash
sg docker -c 'docker version'
sg docker -c 'docker info'
```

### 7.2 Arch or Ryoku Linux

```bash
sudo pacman -S --needed docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

### 7.3 Verify Docker before opening Labs

```bash
systemctl is-active docker
sg docker -c 'docker version'
```

If NET0ZE reports `setup-required`, fix the Docker daemon/socket or group
session first. Do not set a remote `DOCKER_HOST` for these local Labs.

### 7.4 First Lab acceptance flow

The implemented baseline is **Web Exposure — Harborline Dispatch**. It is an
original, read-only HTTP target running locally in Docker. It is not a full VM,
SSH lab, remote machine, or kernel-exploitation environment.

Use this exact flow:

```text
Labs
  → Start Web Exposure
  → Open target
  → investigate the target
  → recover and submit the current flag
  → Reset
  → confirm the old flag is rejected
  → recover and submit the new flag
  → Stop
```

The target uses an owned internal Docker network and an ephemeral host
`127.0.0.1` forwarder. Docker does not publish the target port directly. The
container runs non-root with a read-only filesystem, dropped capabilities,
no-new-privileges, and bounded CPU, memory, and PID limits.

Only ownership-checked NET0ZE resources may be removed during stop/reset/error
cleanup. Never use `docker system prune`, global image deletion, or unrelated
container/network deletion as Lab recovery.

## 8. Packet capture setup

### Linux

The DEB is the normal capture-enabled installation path. Select a real supported
interface in NET0ZE and start capture explicitly. Interface enumeration alone
does not prove that capture permission is available.

If capture is unavailable:

1. Confirm that the DEB is installed rather than only an AppImage.
2. Confirm the selected interface is valid and active.
3. Read the app readiness/error message.
4. Check the package and helper state with the operating system.
5. Use saved capture review if live capture permission cannot be granted.

### Windows

Install the Npcap runtime separately on the Windows machine when live capture
is required. The Npcap SDK is only for compiling NET0ZE. A successful build
without the runtime does not prove capture works.

### Safety boundary

Capture is explicit and local. NET0ZE does not claim that a list of interfaces
means packet capture is permitted, and it does not fabricate traffic when the
driver or permission is unavailable.

## 9. Local data, logs, and privacy

Runtime storage locations:

| Platform | Location |
| --- | --- |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/NET0ZE/` |
| Windows | `%APPDATA%\NET0ZE\` |

Typical contents:

```text
netoze_app.db       SQLite configuration, caches, and persisted observations
logs/backend-*.log  Per-session backend logs
```

Runtime log timestamps use Asia/Kolkata / IST (`+05:30`) in the current backend
logging configuration. Database epoch timestamps remain UTC-compatible.

Local databases, PCAP files, endpoint names, logs, and reports may contain
sensitive system information. Review and redact them before sharing. Do not
copy them into Git commits or support bundles unless explicitly authorized.

## 10. Build and package from source

### 10.1 Frontend build

```bash
npm run build
```

This type-checks the project and writes the Vite frontend to `dist/`.

### 10.2 Linux packaging

Normal platform-specific command:

```bash
PATH="$HOME/.cargo/bin:$PATH" \
RUSTUP_TOOLCHAIN=1.98.1 \
npm run dist:linux
```

The helper stages current Linux artifacts under:

```text
releases/linux/2.0.0-x64/
```

Read `manifest.json` for exact filenames, target triple, sizes, and SHA-256
values. If only the native backend needs rebuilding and `dist/index.html`
already exists:

```bash
npm run dist:linux -- --backend-only
```

### 10.3 Native Windows packaging

On Windows, make sure the Npcap SDK directory containing `wpcap.lib` is known:

```powershell
$env:LIBPCAP_LIBDIR = 'C:\npcap\Lib\x64'
```

This builds the native NSIS and MSI bundles and stages them under:

```text
releases/windows/2.0.0-x64/
```

Backend-only packaging, using an already-built `dist/`:

```powershell
npm run dist:windows -- --backend-only
```

### 10.4 Advanced Linux-to-Windows cross-build

```bash
npm run dist:windows:cross
```

This path requires the configured `cargo-xwin`/Windows SDK tooling and stages
NSIS only. It is useful for producing an installer artifact, but it is not MSI
production and does not provide Windows startup, IPC, Npcap, or installer
runtime evidence.

### 10.5 GitHub Actions Windows release

The workflow is:

```text
.github/workflows/windows-installer.yml
```

It runs on `windows-latest`, installs Node/Rust/Npcap SDK build dependencies,
runs release contract tests, builds native Windows installers, uploads artifacts,
and publishes a GitHub Release for a `v*` tag.

The token used to push a workflow file or tag must have the required repository
and workflow permissions. Never put a token in a repository file or command log.

## 11. Verification commands

Run the smallest relevant check first, then the broader suite:

```bash
npm test
npm run lint
npx tsc --noEmit --pretty false
npm run build
npm run test:geo
npm run test:release
```

Standalone Web Exposure target tests:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/web-exposure -p test_target.py -v
```

Native Rust checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib services::lab_runtime
cargo test --manifest-path src-tauri/Cargo.toml \
  --test lab_runtime_verify --test lab_runtime_persistence_verify
```

Opt-in real-Docker checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml \
  --test lab_runtime_verify -- --ignored --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml \
  --lib services::lab_runtime -- --include-ignored --test-threads=1
```

These checks cover target lifecycle, flag submission/rotation, bounded
forwarding, container controls, and ownership-safe teardown. They do not prove
Windows runtime support or installed GUI acceptance.

For backend tests that must not touch normal user data, use a test data root:

```bash
export XDG_DATA_HOME="$PWD/target/native-test-data"
cargo test --manifest-path src-tauri/Cargo.toml --release --lib -- --test-threads=1
```

## 12. Troubleshooting

### The UI still looks unchanged

Close every NET0ZE process/window, then launch the exact new artifact. Do not
compare a newly installed DEB with an old pinned AppImage or a stale desktop
shortcut.

Use exact process matching:

```bash
pgrep -a -x netoze-desktop
```

Before stopping a process, confirm its executable:

```bash
readlink -f /proc/<PID>/exe
```

Do not use `pkill -f netoze`; it can match unrelated commands.

### Labs reports `setup-required`

```bash
systemctl is-active docker
sg docker -c 'docker version'
```

Check that the daemon is local, Docker is version 28 or newer, and the current
desktop session has Docker socket permission.

### The AppImage does not start

```bash
chmod +x path/to/NET0ZE.AppImage
./path/to/NET0ZE.AppImage
```

If the system lacks FUSE or blocks AppImage mounting, install and use the DEB.

### Capture is unavailable

Check the selected interface, OS permissions, the Linux capture helper or
Windows Npcap runtime, and the app readiness message. Saved-file review remains
available without live-capture permission.

### Windows build stops at the Npcap SDK check

Set `LIBPCAP_LIBDIR` to the folder containing `wpcap.lib`, or install the SDK
under `C:\npcap`. The SDK and runtime are separate installations.

### The Windows MSI is missing

Inspect:

```text
releases/windows/2.0.0-x64/manifest.json
```

The cross-build path is NSIS-only. Build natively on Windows with
`npm run dist:windows` when an MSI is required.

### A native command or Cargo test fails

Read the complete error first. Check that the correct Rust toolchain, system
headers, libpcap, WebKit/GTK packages, and Docker permissions are available.
Do not weaken or delete tests, restore retired simulated Labs, or use global
Docker cleanup to hide a failure.

## 13. Git and contribution workflow

Before making changes:

```bash
git clone https://github.com/1viz3r0/xtreme-sexo.git
cd xtreme-sexo
git switch master
git status --short --branch
```

Keep a change focused. After editing:

```bash
npm test
npm run build
git status --short
```

Use conventional commit messages, for example:

```text
docs: add full setup guide
fix: handle unavailable capture permissions
feat: add bounded practical lab
```

Do not stage everything blindly. Stage only intended files:

```bash
git add Full-Setup-Guide.md README.md
git status --short
git diff --cached --stat
```

Push only when GitHub authentication and repository write access are confirmed:

```bash
git fetch origin
git status --short --branch
git push origin master
```

If GitHub returns HTTP 403, the account is authenticated but the token or
repository permission does not allow writing. Refresh repository/workflow
permissions through GitHub authentication rather than placing credentials in
the repository.

## 14. Current limitations to keep honest

- The first real Lab is a bounded local Docker HTTP challenge, not a full VM or
  SSH machine.
- Planned Lab cards must not be called implemented until their environment,
  native lifecycle, and user-visible flow are verified.
- A native Linux build or Windows cross-build does not prove runtime acceptance
  on that operating system.
- Windows installer signing and Windows runtime smoke tests require Windows.
- Linux AppImage execution may be blocked by FUSE/container policy.
- Crash-orphan Docker cleanup and some cross-platform networking work remain
  separate release gates.
- External GeoIP, RDAP, public-IP, connectivity, and threat-feed operations are
  bounded, explicit, and can be unavailable or rate-limited.

## 15. Useful project documents

- [`README.md`](README.md) — concise project and release overview
- [`docs/NETOZE_PROJECT_CONTEXT.md`](docs/NETOZE_PROJECT_CONTEXT.md) — primary continuation context
- [`docs/NETOZE_LABS_RESUME_MANUAL.md`](docs/NETOZE_LABS_RESUME_MANUAL.md) — Lab implementation and acceptance flow
- [`docs/LABS_LOCAL_REBUILD.md`](docs/LABS_LOCAL_REBUILD.md) — Docker/native evidence and rebuild notes
- [`docs/BACKEND_GUIDE.md`](docs/BACKEND_GUIDE.md) — native backend commands, storage, APIs, and logs
- [`docs/NETOZE_DISTRIBUTION.md`](docs/NETOZE_DISTRIBUTION.md) — release artifacts and platform distribution
- [`docs/NETOZE_WINDOWS_INSTALLER.md`](docs/NETOZE_WINDOWS_INSTALLER.md) — Windows installer details
- [`PROJECT_INVENTORY.md`](PROJECT_INVENTORY.md) — durable source versus generated/private state

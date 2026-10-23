# NET0ZE

For a complete source, desktop, Docker Labs, capture, packaging, verification,
and troubleshooting walkthrough, see [`Full-Setup-Guide.md`](Full-Setup-Guide.md).

NET0ZE is a native desktop cybersecurity investigation platform for **local,
authorized** use. It combines a React/TypeScript/Vite interface with a Tauri 2
application and Rust services. The native side owns local capture, host and
network observations, bounded enrichment, SQLite persistence, application logs,
and the desktop IPC boundary; there is no required localhost application server
for an installed build.

The product is intentionally evidence-first. Empty, unavailable, stale, or
permission-denied sources remain visible as such. NET0ZE does not manufacture
traffic, findings, locations, or host telemetry to fill a panel.

The repository also contains Docker-backed practical Labs. The documented
baseline is **Web Exposure — Harborline Dispatch**, a local read-only HTTP
challenge. The current checkout may contain additional original lab cards and
target assets; a catalog card is not a substitute for verifying its native
runtime and packaged workflow. The planned Forensics card is not an implemented
environment.

## Support status

| Platform | What is supported | What is verified here |
| --- | --- | --- |
| Linux x86_64 | Packaged DEB and AppImage; native development and packaging | Linux native build, DEB staging/installation, and package verification are documented. AppImage creation is documented; mounted AppImage execution can be blocked by FUSE or container policy. |
| Windows x64 | Native Tauri packaging path using NSIS and MSI; packet capture uses Npcap | Packaging prerequisites and scripts are present. Windows startup, IPC, capture, and installer runtime acceptance are **not claimed as verified** in this checkout. |
| macOS | No packaged target or runtime claim | Not supported by the current release guide. |

The frontend is shared across platforms, but platform-specific data sources are
not interchangeable. Linux uses libpcap; Windows uses Npcap. Windows Event Log
support is gated, and unavailable OS-specific data must remain unavailable rather
than being presented as successful telemetry.

## Install from a release artifact

End users do not need Node.js, Rust, npm, or a web server.

### Windows — download and run

```text
https://github.com/1viz3r0/xtreme-sexo/releases/latest/download/NET0ZE_x64-setup.exe
```

That link always resolves to the newest installer. Run the file once: it
installs for the current user without an administrator prompt and pulls in
WebView2 when it is missing. Because the build is unsigned, Windows SmartScreen
shows a warning on first run; choose **More info → Run anyway**.

Or install from PowerShell in one command:

```powershell
irm https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/scripts/install-release.ps1 | iex
```

Add `-Silent` by running the script directly to skip the wizard pages:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-release.ps1 -Silent
```

### Linux — one command

```bash
curl -fsSL https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/scripts/install-release.sh | bash
```

The script resolves the latest release, downloads the artifact for your machine,
verifies its SHA-256 against the published checksums, and then installs it. It
uses the `.deb` on Debian-family systems and the AppImage everywhere else.

Prefer an explicit download? Use the permanent links:

```text
https://github.com/1viz3r0/xtreme-sexo/releases/latest/download/NET0ZE_amd64.deb
https://github.com/1viz3r0/xtreme-sexo/releases/latest/download/SHA256SUMS.txt
```

Then install with one command:

```bash
sudo apt install ./NET0ZE_amd64.deb
```

Every release also attaches the per-platform `manifest.json` files and
`SHA256SUMS.txt`. These are development builds: the Linux packages are built and
staged locally, and the Windows NSIS installer is cross-built and has not been
executed on Windows.

For maintainers who already have a staged artifact in this checkout, the
repository also provides strict one-command helpers. They validate the selected
artifact first and never rebuild or delete unrelated files:

```bash
npm run install:linux -- --artifact releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb
```

```powershell
npm run install:windows -- -Artifact ".\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64-setup.exe"
```

See [`docs/NETOZE_DISTRIBUTION.md`](docs/NETOZE_DISTRIBUTION.md) for the full
artifact layout, dry-run options, and platform-specific build/install details.

### Linux: DEB installation

The DEB is the normal installed path on Debian, Ubuntu, and Kali. It installs
the desktop application and the Linux capture helper; administrator approval is
handled by the operating system.

```bash
cd releases/linux/2.0.0-x64
sha256sum NET0ZE_2.0.0_amd64.deb NET0ZE_2.0.0_amd64.AppImage
sudo apt install ./NET0ZE_2.0.0_amd64.deb
```

Launch **NET0ZE** from the application menu after installation. Close any old
NET0ZE window first: an already-running Tauri window keeps its previously
loaded frontend until it is exited and relaunched.

The package declares its native runtime dependencies. If a lower-level package
workflow is required, the equivalent recovery sequence is:

```bash
sudo dpkg -i ./NET0ZE_2.0.0_amd64.deb
sudo apt-get -f install
```

### Linux: AppImage

The AppImage is a portable alternative and does not install the privileged
capture helper used by the DEB.

```bash
cd releases/linux/2.0.0-x64
sha256sum NET0ZE_2.0.0_amd64.AppImage
chmod +x NET0ZE_2.0.0_amd64.AppImage
./NET0ZE_2.0.0_amd64.AppImage
```

Some containers and locked-down systems do not provide the FUSE support needed
to mount an AppImage. Use the DEB when the installed Linux capture path or
system integration is required. When comparing a new DEB with an AppImage,
use one launch path at a time so an old pinned shortcut cannot make the build
appear unchanged.

### Windows: native release artifacts

The normal one-click download is the NSIS installer:

```text
NET0ZE_2.0.0_x64-setup.exe
```

Run that file once. It installs NET0ZE for the current Windows user and uses
the configured WebView2 bootstrapper when WebView2 is missing. The repository
also includes a GitHub Actions workflow that builds, checksums, and publishes
the `.exe`, `.msi`, and `manifest.json` from a native Windows runner. See
[`docs/NETOZE_WINDOWS_INSTALLER.md`](docs/NETOZE_WINDOWS_INSTALLER.md).

A native Windows release is staged under:

```text
releases/windows/2.0.0-x64/
```

Use the exact filenames listed by that directory's `manifest.json`. The normal
Tauri names are:

```text
NET0ZE_2.0.0_x64-setup.exe
NET0ZE_2.0.0_x64_en-US.msi
```

For a normal user installation, run the NSIS installer:

```powershell
Start-Process .\NET0ZE_2.0.0_x64-setup.exe
```

For an MSI-based deployment, use the MSI only when the manifest includes it:

```powershell
msiexec /i .\NET0ZE_2.0.0_x64_en-US.msi
```

The Tauri configuration includes a WebView2 bootstrapper. Npcap is a separate
Windows runtime prerequisite for live packet capture; it is not the same thing
as the Npcap SDK required to compile the application. The installer does not
silently redistribute an unlicensed Npcap package. If Npcap is unavailable,
NET0ZE must show capture as unavailable rather than fabricating live telemetry.

## What the application does

- **Native local evidence:** host details, interfaces, counters, sockets,
  capture state, current-session flows, detections, audit data, and bounded
  local reports where the operating system exposes them.
- **Capture and review:** explicit interface selection and start/stop controls;
  saved capture review does not require live-capture permission.
- **Investigation surfaces:** Global Intel, host/log views, network checks,
  forensic queries, and other navigation exposed by the current build. A quiet
  interface or empty cache is a valid result.
- **Practical Labs:** locally provisioned Docker targets with Start, Open,
  Submit, Reset, and Stop lifecycle controls. The target flag is generated per
  run and validated against that run; status and catalog metadata do not reveal
  the answer.

Startup does not begin packet capture, scans, public-IP requests, connectivity
checks, or threat-feed downloads. Explicit controls are required for those
operations. Threat intelligence is external context, not proof of compromise;
only observed endpoint matches become matches.

## Docker Labs

Labs require a **local Docker CLI and daemon version 28 or newer**. Remote
Docker endpoints are rejected. The first build may need registry access to
obtain the pinned base image; the target build itself uses a no-network build
step once the image is available.

On Debian, Ubuntu, or Kali:

```bash
sudo apt update
sudo apt install docker.io docker-cli
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Start a fresh login session after changing group membership, or use a refreshed
group command for a one-off check:

```bash
sg docker -c 'docker version'
sg docker -c 'docker info'
```

On Arch/Ryoku Linux:

```bash
sudo pacman -S --needed docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

The lab runtime provisions owned resources only. Targets run as a non-root user
with read-only filesystems, dropped capabilities, no-new-privileges, no host
mounts, no privileged mode, and bounded CPU, memory, and PID limits. Docker
does not publish the target port: NET0ZE uses an ephemeral host `127.0.0.1`
forwarder to an ownership-checked private container endpoint.

This is a bounded container HTTP/TCP exercise, not a full operating-system VM,
SSH lab, kernel-exploitation environment, remote hosted machine, or universal
host/kernel security boundary. Do not use it for privilege-escalation or
kernel-exploitation training. Do not recover a failed run with global
`docker system prune`, image pruning, or unrelated container/network deletion;
only ownership-checked NET0ZE resources may be cleaned up.

The documented acceptance flow is:

```text
Labs → Start Web Exposure → Open target → investigate → submit flag
      → Reset → verify a new flag → Stop
```

Reset rotates the per-run flag and target URL. A new URL after reset is expected.
Crash-orphan cleanup and packaged GUI acceptance remain separate release gates;
passing native lifecycle tests does not prove the installed visual workflow.

## Source development

### Prerequisites

- Node.js 22 or newer and npm.
- Rust and Cargo. Linux verification used Rust/Cargo 1.98.1; use the approved
  toolchain for the checkout rather than assuming a particular system path.
- Python 3 for the standalone target tests.
- Linux native build libraries when packaging on Linux.
- Docker 28 or newer for real Lab lifecycle checks.

Clone the public repository and install the locked dependency set:

```bash
git clone https://github.com/1viz3r0/xtreme-sexo.git
cd xtreme-sexo
npm ci
```

`npm run dev` starts only the Vite frontend. It is useful for UI work but is not
the native desktop application and cannot prove Tauri IPC or capture behavior.
Use Tauri development mode for the desktop:

```bash
npm run desktop:dev
```

### Linux native build dependencies

On Debian-based build hosts, install the native headers and packaging tools
before running the Linux bundle:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libpcap-dev
```

### Windows native packaging prerequisites

Build Windows on a Windows machine for the supported native path. Install:

- Node.js 22 or newer and npm;
- Rust stable with the MSVC toolchain;
- Visual Studio C++ Build Tools and the Windows SDK;
- the Npcap SDK, with `wpcap.lib` available under `Lib\x64` (or the matching
  architecture directory).

The build helper accepts either `LIBPCAP_LIBDIR` or an SDK rooted at
`C:\npcap`:

```powershell
$env:LIBPCAP_LIBDIR = 'C:\npcap\Lib\x64'
npm run dist:windows
```

`npm run dist:windows:cross` is an advanced Linux-to-Windows path. It requires
the configured `cargo-xwin`/Windows SDK tooling and stages **NSIS only**; it is
not MSI production and does not provide Windows runtime evidence.

## Build and package commands

Run commands from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run build` | Typecheck and build the Vite frontend into `dist/`. |
| `npm run desktop:dev` | Run the native Tauri development application. |
| `npm run dist:linux` | Build the Linux native helper, DEB, AppImage, and Linux release manifest. |
| `npm run dist:windows` | Build native Windows NSIS and MSI bundles and stage the Windows manifest. |
| `npm run dist:windows:cross` | Advanced Linux-to-Windows NSIS-only cross-build. |
| `npm run stage:release` | Legacy staging helper for the older Windows-oriented `releases/Installer`, `Portable_EXE`, and `Enterprise_MSI` layout; it does not replace platform-specific staging. |
| `npm run dist:release` | Legacy `tauri build` plus the older staging helper; use the platform-specific commands for current manifests. |

On Linux, a build can use the project-local Rust tooling when it is present:

```bash
PATH="$HOME/.cargo/bin:$PATH" RUSTUP_TOOLCHAIN=1.98.1 npm run dist:linux
```

The platform-specific helper writes current artifacts to:

```text
releases/linux/2.0.0-x64/
releases/windows/2.0.0-x64/
```

Each staged directory contains the installers selected for that build and a
`manifest.json` with platform, architecture, target triple, sizes, and SHA-256
hashes. Cross-built NSIS output intentionally does not claim an MSI.

## Verification

The following commands are the repository checks. They report the state of the
checkout you run them against; this README does not turn an unrun command into
a test claim.

### Frontend and release checks

```bash
npm test
npm run lint
npx tsc --noEmit --pretty false
npm run build
npm run test:geo
npm run test:release
git diff --check
```

### Web Exposure target checks

The standalone Python test checks the target surface only; it does not prove
Docker isolation:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/web-exposure -p test_target.py -v
```

Native contract checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib services::lab_runtime
cargo test --manifest-path src-tauri/Cargo.toml \
  --test lab_runtime_verify --test lab_runtime_persistence_verify
```

Opt-in real-Docker checks require a working local daemon and are intentionally
separate from ordinary native tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml \
  --test lab_runtime_verify -- --ignored --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml \
  --lib services::lab_runtime -- --include-ignored --test-threads=1
```

These checks cover the bounded lifecycle, flag submission/rotation, forwarder
limits, container controls, and ownership-safe teardown. They do not establish
Windows runtime support or installed GUI acceptance.

## Security and safety boundaries

- Use NET0ZE only on systems, interfaces, Docker resources, and data you are
  authorized to inspect.
- Startup is passive. Capture, checks, enrichment, and scans require explicit
  user actions; no automatic subnet scan or external-port sweep runs on install.
- The Labs runtime has no general-purpose shell, arbitrary command, credential,
  upload, or arbitrary target-selection action path.
- Lab targets are local-only and read-only by design. They are not a license to
  target third-party systems or a substitute for a VM boundary.
- The Linux DEB grants `CAP_NET_RAW` only to the capture helper through its
  administrator-run post-install step; the GUI remains unprivileged. An AppImage
  does not install that helper.
- Npcap/libpcap access is an operating-system permission boundary. Interface
  enumeration does not prove that packet capture is permitted.
- Local SQLite data, PCAP files, logs, exports, endpoint names, and reports may
  contain sensitive system information. Review and redact before sharing.
- Never commit passwords, API keys, tokens, private keys, cookies, databases,
  environment files, logs, build caches, or generated installers.

## Troubleshooting

### The UI looks unchanged after rebuilding

Exit every NET0ZE window and launch the exact newly built artifact. Do not mix a
stale pinned AppImage with a newly installed DEB. Compare the artifact and
running executable when necessary:

```bash
sha256sum releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb
pgrep -a netoze-desktop
```

### Labs shows `setup-required`

Check the Docker client, daemon, version, and current group session:

```bash
docker version
docker info
systemctl is-active docker
sg docker -c 'docker version'
```

The lab runtime requires a local Docker endpoint and Docker 28 or newer. Fix
daemon/socket permissions or image availability, then retry. Do not configure a
remote `DOCKER_HOST` for these local labs.

### Capture is unavailable

Confirm the selected interface is a supported Ethernet-format interface and
check the app's readiness message. Linux capture permissions are provided only
by the installed DEB helper path; Windows live capture requires Npcap. A list
of interfaces alone is not proof of capture access. Saved-file review remains
available without live capture permission.

### The AppImage will not start

Check executable permission and FUSE support. Some containers intentionally
cannot mount AppImages. Use the DEB on Debian-based Linux when system
integration or the capture helper is needed.

### Windows packaging stops at the Npcap SDK check

Set `LIBPCAP_LIBDIR` to the directory containing `wpcap.lib`, or install the SDK
under `C:\npcap`. The SDK is a build prerequisite; the Npcap runtime is a
separate end-user prerequisite for live capture. A successful build still does
not count as Windows runtime validation.

### A Windows MSI is missing

Inspect `releases/windows/2.0.0-x64/manifest.json`. The cross-build path is
NSIS-only by design. Build natively on Windows with `npm run dist:windows` when
an MSI is required.

## Repository and contribution workflow

The public repository is:

```text
https://github.com/1viz3r0/xtreme-sexo
```

The default branch is `master`. Before changing code or docs:

```bash
git status --short
git diff --stat
```

Keep changes focused, preserve unrelated work, and describe the actual
platform/test evidence in the pull request. For a normal contribution:

1. Fork or clone the repository and create a focused branch.
2. Make one coherent change; keep credentials, private data, generated output,
   and build caches out of the patch.
3. Run the checks relevant to the touched area, then `git diff --check`.
4. Explain Linux/Windows packaging and runtime evidence separately. Do not call
   a cross-build a Windows runtime test.
5. Open a GitHub issue or pull request with reproduction steps, commands, and
   observed results.

Lab contributions must use original NET0ZE content, remain bounded to owned
local resources, preserve honest `setup-required`/`error` states, and include
target tests plus lifecycle/cleanup evidence. Do not restore retired
Red-Team/Blue-Team/Purple-Team room systems, simulated fallbacks, arbitrary
shell execution, remote targets, or claims of a full VM/SSH environment.

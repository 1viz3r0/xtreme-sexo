# NET0ZE Windows installer

## End-user download

For a normal Windows installation, download the single file:

```text
NET0ZE_2.0.0_x64-setup.exe
```

Run it once. The NSIS installer installs NET0ZE for the current Windows user
and uses the configured WebView2 bootstrapper when the Evergreen WebView2
runtime is missing. No Node.js, Rust, npm, or development tools are required on
the end-user machine.

Docker is not needed to launch the application. The current Labs ingress is
supported on native Linux with local Docker >=28; Windows/Docker Desktop and
rootless ingress report `setup-required` rather than a simulated running target.

The release directory also contains an MSI for managed deployment. Use the
NSIS `.exe` for the ordinary one-click download/install path.

## Packet capture prerequisite

NET0ZE can start without packet-capture permissions, but live Windows capture
requires the Npcap runtime and its approved installation policy. The Npcap SDK
is a **build-time** dependency and is not the same as the end-user runtime.
Do not silently download or redistribute an Npcap installer from an unlicensed
copy. For organizations that have an approved Npcap OEM package, add that
package to the organization's software deployment step before enabling live
capture.

If Npcap is unavailable, NET0ZE must report capture as unavailable rather than
pretending that live packets are being collected.

The MSVC build delay-loads `wpcap.dll`. Before any native capture call, NET0ZE
loads and validates the required exports using absolute paths obtained from
Windows' system-directory API, preferring its `Npcap` subdirectory. It does not
search PATH/current-directory DLLs or change the process-wide DLL search path.
Missing/incompatible runtime errors are cached until the application restarts;
saved-file analysis remains separate from live capture.

`scripts/pcap-runtime.test.mjs` inspects the actual built PE import tables and
checks that every delay-imported capture symbol has a pre-call export guard.
The Windows build helper runs this check before staging. This verifies a
packaging property, not Windows execution. On fresh checkouts without a Windows
binary, the ordinary script suite explicitly skips this artifact-dependent case.

Native acceptance, on separate Windows configurations, remains required:

```powershell
# Host WITHOUT Npcap:
cargo test --manifest-path src-tauri/Cargo.toml --test npcap_loader_verify missing_npcap_keeps_the_application_and_saved_file_engine_available -- --ignored --exact
# Host WITH the approved runtime:
cargo test --manifest-path src-tauri/Cargo.toml --test npcap_loader_verify installed_system_runtime_loads_and_enumerates_without_opening_capture -- --ignored --exact
```

Neither test starts packet capture. The installed-app launch, WebView2,
saved-file UI, driver permission, live capture and uninstall matrices are
additional acceptance requirements. No Windows execution is claimed from a
successful cross-build or import-table check.

Primary API references: Microsoft Learn's `/DELAYLOAD (Delay Load Import)` and
`LoadLibraryExW` documentation, plus the Npcap developer guide's DLL-loading
section. The implementation deliberately uses per-load restricted search flags
instead of Npcap's older process-wide `SetDllDirectory` example.

## Build and publish

The repository includes a GitHub Actions workflow at:

```text
.github/workflows/windows-installer.yml
```

It runs on a native Windows runner, installs Node 22 and Rust MSVC, downloads
the Npcap SDK used only for compilation, runs the release contract tests, and
stages both the NSIS installer and MSI under:

```text
releases/windows/2.0.0-x64/
```

Run it manually from the Actions tab, or push a version tag such as:

```bash
git tag v2.0.0
git push origin v2.0.0
```

A tagged run publishes the staged installers and `manifest.json` as a GitHub
release. The manifest contains SHA-256 checksums for every generated file.

## Local native Windows build

On a Windows build host:

```powershell
npm ci
$env:NPCAP_SDK = 'C:\npcap'
$env:LIBPCAP_LIBDIR = 'C:\npcap\Lib\x64'
npm run test:release
npm run dist:windows
```

The native host must have Visual Studio 2022 Build Tools with Desktop
development with C++, the MSVC toolset, and a Windows SDK. Cross-building the
Windows installer from Linux is not the verified release path.

## Install from a staged artifact

```powershell
.\scripts\install-windows.ps1 `
  -Artifact '.\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64-setup.exe'
```

The helper validates the artifact and waits for the installer. It does not
delete old installations, remove unrelated files, or perform cleanup.

## Product navigation note

Overview/GOD'S EYE VIEW is currently hidden from the NET0ZE navigation and
search entry points. The underlying source remains in the repository for
preservation and future product decisions; it is not exposed by the shipped
sidebar or top navigation.

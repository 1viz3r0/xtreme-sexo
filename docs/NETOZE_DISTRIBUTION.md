# NET0ZE distribution and installation

This is the small, artifact-first release flow for NET0ZE. Builds and installs
are separate: the build produces native bundles, `stage-native-release.mjs`
copies them into `releases/`, and the platform installer scripts consume one
staged artifact. The installers do not download code, rebuild the app, or run
destructive cleanup.

## Staged layout

After a successful native build and staging, artifacts are placed under:

```text
releases/linux/<version>-<arch>/   # .deb and/or .AppImage
releases/windows/<version>-<arch>/ # .msi and/or NSIS .exe
```

Use an explicit artifact path when both formats are present. Omitting the path
is intentionally strict: the installer proceeds only when exactly one matching
artifact is staged.

## Linux

Build and stage on Linux:

```sh
npm run dist:linux
```

Install a Debian package (administrator authorization is expected):

```sh
npm run install:linux -- \
  --artifact releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb
```

The script validates the package architecture and runs `dpkg -i`, using `sudo`
when it is not already running as root. It does not automatically repair
dependencies. If `dpkg` reports missing dependencies, inspect that output and
decide whether the host's package manager should repair them.

Install an AppImage for the current user:

```sh
npm run install:linux -- \
  --artifact releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage
```

By default the executable is copied to
`~/.local/share/netoze/NET0ZE.AppImage` with mode `0755`. No system package or
desktop entry is created. Choose another destination with `--destination`; an
existing destination is preserved unless `--force` is supplied. Use
`--dry-run` to validate selection without changing the system.

The Linux script requires Bash, `find`, `dpkg`, and `dpkg-deb` for the
corresponding operation. A staged AppImage does not require root privileges.

## Windows

Install one staged Windows installer from PowerShell:

```powershell
.\scripts\install-windows.ps1 -Artifact ".\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64_en-US.msi"
.\scripts\install-windows.ps1 -Artifact ".\releases\windows\2.0.0-x64\NET0ZE_2.0.0_x64-setup.exe"
```

The `.msi` path is handed to `msiexec.exe`; the `.exe` path is treated as the
staged NSIS installer. The script waits for completion and reports a non-zero
installer exit code. Use `-DryRun` to validate the artifact without launching
it, or `-Help` for the built-in usage text.

### Native Windows build prerequisites

`npm run dist:windows` must run on a Windows build host. Before building,
install or provide:

- Node.js and npm, followed by `npm ci`.
- Rust with the `x86_64-pc-windows-msvc` target and a working Cargo toolchain.
- Visual Studio 2022 Build Tools (or Visual Studio) with **Desktop development
  with C++**, the MSVC toolset, and a Windows SDK. Tauri's MSI/NSIS bundling
  and Rust MSVC linking depend on this native toolchain.
- The Npcap SDK, with `LIBPCAP_LIBDIR` set to its import-library directory (or
  `NPCAP_SDK` set to the SDK root). The build helper checks for `wpcap.lib`.
- WebView2 on end-user systems. The NSIS bundle includes the configured
  Evergreen bootstrapper; MSI deployment should use the organization's normal
  WebView2 provisioning policy.

Build and stage both Windows formats on that host:

```powershell
npm run dist:windows
```

The existing Linux cross-build helper is intentionally narrower:

```sh
npm run dist:windows:cross
```

It requires the configured Rust/cargo-xwin and Windows SDK support and stages
NSIS `.exe` output only. It is not a claim that MSI cross-building or Windows
runtime validation works on Linux.

## Validation

Run the packaging-only checks without installing anything:

```sh
npm run test:release
bash -n scripts/install-linux.sh
```

The release tests validate staging behavior and the installer contracts. A
successful script syntax check or staged-artifact test does not replace running
the installed application on the target operating system.

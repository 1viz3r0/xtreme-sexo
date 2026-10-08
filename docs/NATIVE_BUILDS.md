# NET0ZE native desktop builds

NET0ZE has separate Windows and Linux installers built from the same React UI,
Rust engines, commands, and local SQLite storage. The UI is packaged inside the
Tauri desktop application; users do not need a web server or Node.js to run it.

## Parallel builds

The `Windows and Linux desktop builds` GitHub Actions workflow builds both
platforms concurrently from the same commit, on native OS runners. It uploads
separate `NET0ZE-windows-x64` and `NET0ZE-linux-x64` artifacts. Adding the workflow
does not mean those jobs have already run or that installers have been verified.

## Windows

Install Node.js 22+, Rust stable (MSVC toolchain), Visual Studio C++ Build Tools,
and the Npcap SDK. Set `LIBPCAP_LIBDIR` to the SDK's `Lib\x64` directory, or put
the SDK in `C:\npcap` for the release helper to discover it.

```powershell
npm ci
npm run dist:windows
```

Output: EXE installer and MSI in `releases/windows/2.0.0-x64/`.
Npcap runtime must be installed on the user's machine for packet capture.
The installer retains the existing WebView2 bootstrapper configuration.

## Linux (Debian/Ubuntu)

Install Node.js 22+, Rust stable, and native development libraries:

```sh
sudo apt-get install build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libpcap-dev
npm ci
npm run dist:linux
```

Output: DEB and AppImage in `releases/linux/2.0.0-x64/` on x64 hosts. Other host
architectures get their own staging directory; only x64 is configured in CI.
Linux uses libpcap. Capture permissions are checked when opening an interface;
enumerating interfaces does not guarantee permission to capture.

## Shared behavior and branding

- The same feature code and black theme are included in both applications.
- `public/netoze-mark.svg` is the black-and-white mark used in the existing
  header logo area and local authentication dialog. Native PNG/ICO icons use
  the same source mark.
- Windows uses Npcap and Linux uses libpcap. Windows Event Log APIs are gated;
  a Linux equivalent has not been implemented. OS-specific unavailable data
  remains explicit rather than presented as successful telemetry.
- Starting the application does not start capture, scans, or external feeds.
- `manifest.json` accompanies each staged release with file sizes and SHA-256
  hashes. Staging fails when either expected installer format is missing.

## Checks

```sh
npm run build
npm run test:release
npm run test:geo
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

For native development, use `npm run desktop:dev` with the same OS prerequisites
and SDK environment. The local Vite process serves only the development webview.

Local implementation checks passed for the shared UI build, release staging,
geography tests, icon generation, and Tauri configuration schema. Native Linux
build was attempted but blocked by missing Cargo; GTK/WebKit/libpcap development
libraries are also absent on that machine. Neither native installer build nor
Windows/Linux runtime smoke testing has been completed in this environment.

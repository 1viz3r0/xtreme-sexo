# NET0ZE First Page Test Manual

This manual covers only **Global Intel**, the first native desktop page. It is
intended for testing the current technical “God's Eye” view without claiming
data that has not actually been observed.

## What this page does

Global Intel reads a bounded native snapshot every 3 seconds:

- current packet-capture counters and capture availability;
- current-session flow aggregation;
- current-session detection findings and severity totals;
- read-only cached GeoIP, threat matches and devices;
- explicit unavailable/stale states when a source has not run or failed.

The globe draws only GeoIP entries with real coordinates. It does not create
fake locations for local/private IPs.

## Run it for testing

### Native development mode

From the repository root:

```sh
npm ci
npm run desktop:dev
```

The application window is native Tauri. Vite is used only to serve the bundled
UI during development; telemetry and capture remain native Rust commands.

### Linux release build

The current Linux release files are staged in:

```text
releases/linux/2.0.0-x64/
```

The DEB installs the app and its native runtime dependencies. The AppImage is
portable. Linux capture uses libpcap and may require the user to grant capture
permissions to the installed application.

### Windows release build

The current Windows NSIS installer is staged in:

```text
releases/windows/2.0.0-x64/NET0ZE_2.0.0_x64-setup.exe
```

Npcap must be installed on Windows before live capture can work. The installer
is currently unsigned because it was cross-built from Linux. MSI is not claimed
by this release.

## First-page test sequence

1. Open **Global Intel**.
2. Confirm the banner says `Local snapshot` or shows a clear unavailable/stale
   message. Browser mode must say native desktop is required.
3. In **Capture Engine**, choose a real interface from the dropdown.
4. Click **START LIVE**.
5. Generate ordinary traffic yourself (open a site, DNS lookup, or use another
   normal application). NET0ZE does not generate traffic for the test.
6. Confirm the card counters and `LIVE GLOBAL CONNECTIONS` update over several
   refresh cycles.
7. Confirm the flow table contains actual source/destination/protocol/packet
   values. A quiet interface legitimately remains empty.
8. Click **STOP** and confirm capture stops without fabricated final packets.
9. If GeoIP or threat data is needed, use the explicit backend refresh commands
   from the backend guide. The snapshot itself is read-only and does not call
   external providers.

## Correct unavailable states

- `UNAVAILABLE`: native backend, driver, permission, or platform capability is
  unavailable.
- `STALE`: the last native snapshot exists but its latest refresh failed.
- `NOT_STARTED`: connectivity/threat enrichment has not been explicitly run.
- `CACHE_ONLY`: the page is showing local cache state and made no external call.
- Empty flows/devices/alerts: no observations exist in this session or cache.

These are expected states on a clean install. They are not replaced with demo
numbers.

## Checks completed

- `npm run build` — passed.
- `npm run test:geo` — 33 passed.
- Native Rust backend — 40 passed.
- Explicit API validation — ipify, ipwho.is, RDAP.org and threat feeds passed.
- Linux DEB and AppImage and Windows NSIS packaging completed.

The IST activity record is in `docs/BACKEND_LOGBOOK_IST.md`. Runtime logs are
stored below the app data directory under `logs/`.

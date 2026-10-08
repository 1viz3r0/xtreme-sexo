# NET0ZE backend operating guide

## Scope

One native Rust/Tauri backend serves the Windows and Linux desktop applications.
The frontend is frozen for this work. The supplied native logo is preserved at
`src-tauri/branding/Netoze-icon.png`; generated PNG/ICO files are in
`src-tauri/icons/`. Frontend logo replacement is deferred.

## Build the backend using the existing UI bundle

Run from the project root:

```sh
# Linux DEB + AppImage
npm run dist:linux -- --backend-only

# Windows EXE installer cross-build from this Linux machine
npm run dist:windows:cross -- --backend-only

# On an actual Windows build machine: EXE + MSI
npm run dist:windows -- --backend-only
```

The backend-only switch requires `dist/index.html` from the previous successful
UI build. It does not run Vite or rebuild frontend code. A normal build without
this switch rebuilds the packaged UI as usual.

Project-local tooling is in ignored `target/native-tooling/`. The build helper
uses it if the system Rust/GTK/libpcap development setup is missing. This local
cache was prepared without changing system packages. Native Windows builds need
the Npcap SDK; Linux uses libpcap. Cross-building NSIS is supported by Tauri, but
MSI creation and Windows runtime testing still require Windows.

Releases are staged under `releases/linux/2.0.0-x64/` and
`releases/windows/2.0.0-x64/`. Read `manifest.json` for the exact formats, byte
sizes, target and SHA-256 checksums. NSIS-only output never claims to include MSI.

## Starting the backend

Launch the native executable or install the appropriate package. Startup creates
local storage and managed engines. It does **not** begin packet capture, port
scans, connectivity probes, public-IP requests, or threat-feed downloads.

The capture, flow, JA4, detection, graph and storyline services share the same
managed state. Native IPC commands expose the services to the desktop webview;
there is no HTTP application server to expose on the network.

## Native commands

### Local reads

- `get_global_intel_snapshot({limit})`: bounded current-session engine data and
  read-only cached local intelligence. Default 100 rows, maximum 500.
- `get_capture_metrics`, `get_capture_engine_state`, `get_pcap_interfaces`:
  capture state, counters and real interface enumeration.
- `get_active_flows`, `get_flow_summary`, `get_detections`,
  `get_detection_summary`: live engine observations, empty until traffic exists.
- `get_attack_graph`, `get_storylines`, `get_ja4_observations`, `get_ja4_stats`:
  read shared graph/fingerprint/storyline engines.
- `list_rules`, `get_network_interfaces`, `get_detailed_network_interfaces`,
  `get_dns_records`, `get_audit_log`: native/local reads.
- `get_geoip_lookup`, `get_geoip_for_active_flows`, `get_public_ip`,
  `get_connectivity_status`, `get_threat_intel_status`: read cached state only.

### Explicit operations

- `start_packet_capture({interfaceId})`, `stop_packet_capture`: capture only on
  the selected interface. Driver or permission failures are returned explicitly.
- `refresh_public_ip`: request the device's public IP through ipify; cache 10 min.
- `refresh_geoip_lookup({ip})`: validate the IP, use the local 30-day cache or
  query ipwho.is. Private/reserved addresses stay local with no invented location.
- `check_connectivity`: one bounded HTTPS reachability check; no recurring worker.
- `refresh_threat_intel`: refresh the configured public feeds once. Concurrent
  refreshes are rejected. Valid empty feeds remain EMPTY; partial failures are
  DEGRADED and total failures return errors. No synthetic threat matches are added.
- `evaluate_flows_for_threats`: compare observed endpoints with loaded indicators
  and persist actual matches. Refresh feeds first.
- `check_port({host,port,timeout})`: a single explicit TCP check. Timeout is in
  milliseconds (100–10,000); a timeout is unknown, not proof that a port is closed.
- `whois_rdap({target})`: public-IP registration lookup through RDAP.org and the
  authoritative registry. Domain lookups are not implemented in this command.
- `enable_disable_rule({ruleId,enabled})`,
  `acknowledge_detection({findingId})`, `resolve_detection({findingId})`:
  update the current-session detection engine.
- `execute_forensic_query({sqlQuery,maxRows})`: read-only SQLite queries, capped
  at 500 output rows; `validate_forensic_query`, `get_forensic_schema`, and
  `get_forensic_templates` provide metadata and validation.

These new operations are backend entry points. Frontend controls for explicit
API refreshes are deferred rather than simulated.

## External APIs and limits

| Use | Endpoint | Authentication / behavior |
| --- | --- | --- |
| Public IP | `https://api64.ipify.org` | Keyless, IPv4/IPv6; result validated |
| GeoIP | `https://ipwho.is/{ip}` | Keyless; documentation currently states 1,000 requests/day/client IP, HTTP 429 when exhausted |
| Registration | `https://rdap.org/ip/{ip}` | Keyless bootstrap redirect; documented limit 10 requests/10 seconds |
| Threat indicators | `https://sslbl.abuse.ch/blacklist/sslipblacklist.csv` | Public CSV; only valid public IPs accepted |
| Threat indicators | `https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt` and `ipblocklist.txt` | Public feeds; provider currently reports empty datasets |
| Connectivity | HTTPS `gstatic.com/generate_204` endpoints | Expected HTTP 204, not arbitrary success pages |

API calls have timeouts and bounded response bodies. There are no automatic
retries for rate limits, API keys stored in code, paid subscriptions, or external
lookups during startup. GeoIP is approximate and missing coordinates stay absent.

Sources checked during implementation:
- https://www.ipify.org/
- https://ipwhois.io/documentation
- https://about.rdap.org/
- https://feodotracker.abuse.ch/blocklist/

## Storage and Indian-time logs

Windows data: `%APPDATA%\NET0ZE\`; Linux data:
`${XDG_DATA_HOME:-$HOME/.local/share}/NET0ZE/`.

- `netoze_app.db`: SQLite configuration, caches and persisted observations.
- `logs/backend-*.log`: appended per-session runtime logs, mirrored to stdout.
- Runtime timestamps use **Asia/Kolkata / IST (+05:30)**, including the UTC offset.
- Database epoch timestamps remain UTC-compatible; changing the log display zone
  does not alter forensic event times or existing audit hashes.
- `docs/BACKEND_LOGBOOK_IST.md`: human activity logbook and build/check history.

Logs record operation state and counts, not credentials or complete API payloads.
If file logging fails, the backend reports it and continues writing to stdout.

## Verification

On this machine, the helper's local Rust environment can be used directly:

```sh
export CARGO_HOME="$PWD/target/native-tooling/netoze-toolchain/cargo"
export RUSTUP_HOME="$PWD/target/native-tooling/netoze-toolchain/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
export PKG_CONFIG_SYSROOT_DIR="$PWD/target/native-tooling/netoze-sysroot"
export PKG_CONFIG_PATH="$PKG_CONFIG_SYSROOT_DIR/usr/lib/x86_64-linux-gnu/pkgconfig:$PKG_CONFIG_SYSROOT_DIR/usr/share/pkgconfig"
export XDG_DATA_HOME="$PWD/target/native-test-data"
export CARGO_BUILD_JOBS=1
cargo test --manifest-path src-tauri/Cargo.toml --release --lib -- --test-threads=1

# Opt-in external API check; no capture or network scan is performed.
cargo test --manifest-path src-tauri/Cargo.toml --release --test backend_api_verify -- --ignored --nocapture
```

Use the test data directory so tests do not modify an analyst's normal database.
API checks report actual provider failures instead of treating an unavailable
endpoint as a passed test. Current check results are recorded in the logbook.

## Remaining boundaries

Windows-only Event Log support remains gated. Full Linux service/socket inventory
parity, capture stop/restart stress testing, and remaining unregistered legacy
screen commands still need implementation/verification. Existing standalone live
capture tests require a driver and capture privileges and are not part of normal
unit checks. Traceroute is explicitly unavailable in the current native command.
Windows installer signing and runtime smoke tests have not been performed here.

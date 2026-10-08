# Scan Buddy — independent native scanner

Scan Buddy replaces the **Network Engine** navigation view. It does not execute,
link to, embed or require Nmap. NET0ZE implements validation, scheduling, TCP
connections, result classification, cancellation and presentation itself using
Rust/Tokio and the existing React/Tauri stack. No new scanning dependency or
privileged raw-socket helper is added.

## What this version does

- Literal IPv4/IPv6 hosts and bounded IPv4 CIDR expansion.
- Custom TCP ports/ranges and common/web/development presets.
- Exact scope preview without network traffic.
- Explicit authorization before a scan starts, including loopback.
- Background native jobs, progress, cancel, result filtering/search/sorting.
- Real OPEN/CLOSED/TIMEOUT/UNREACHABLE/ERROR outcomes and observation times.
- Port-based service **hints**, not verified service identities or vulnerabilities.
- In-memory recent-job history and JSON/CSV/Markdown exports.

This is a complete bounded **TCP-connect workflow**, not full Nmap parity.
UDP/SYN scans, ping sweeps, OS detection, banner/version probes, NSE-style scripts,
DNS target resolution and vulnerability testing are not implemented. Silence is
not proof of host absence; TIMEOUT is not proof of a firewall. Connect duration
is not ICMP ping latency. Successful connection is not proof of a safe service.

## Workflow

1. Open **Scan Buddy** in the native app.
2. Enter only endpoints you own or have permission to test. Example syntax:
   `127.0.0.1, ::1`, or a small IPv4 block such as `192.168.1.0/30`.
   These examples are not automatically scanned.
3. Choose ports, timeout and concurrency, then **Preview scan plan**. Preview
   sends no probes and does not require permission confirmation.
4. Inspect expanded targets and ports, counts and warnings. Changing a field
   invalidates the preview/reset permission. Confirm authorization for every
   expanded endpoint, then click **Start TCP scan**. Checkbox changes preserve
   preview; all three controls are together with a visible Start-disabled reason.
5. Filter observations or cancel the job. Cancellation preserves completed rows.
   The state stays RUNNING while already-started connections settle, then becomes
   CANCELLED. A second job cannot start during settlement.
6. Export the current job if needed. Exports include all observed rows, not only
   the visible filter, and contain sensitive endpoint information. Keep private
   unless sharing with an authorized recipient.

Navigation does not silently cancel jobs. Return to Scan Buddy to resume from
history; refresh explicitly if necessary. App exit cancels queued probes. History
is capped at eight jobs and resets when the app closes. It is not a durable audit
archive; export important observations deliberately. Browser mode cannot scan
and does not show simulated observations.

Each IPC request has an eight-second response deadline. A timeout abandons the
frontend result, not the native operation. Start/cancel may have completed: refresh
history before taking further action, and never automatically repeat the write.
Read timeouts release the shared queue; incompatible responses show build-mismatch
guidance. Use loopback only fills the target field and sends no traffic by itself.

## Bounds and address handling

| Limit | Value |
| --- | --- |
| Unique target hosts | 32 |
| Unique TCP ports | 256 |
| Target × port attempts | 4,096 |
| Concurrent workers | 1–16 |
| Connect timeout | 100–2,000 ms |
| Connection-start rate | At most 50/second, shared across jobs |
| Running jobs | One, including cancellation settlement |
| Retained jobs | Eight, memory only |
| Input lengths | 8,192 target and 4,096 port characters |

IPv4 CIDRs must be /27–/32. /30 and wider exclude network/broadcast endpoints;
/31 and /32 preserve all addresses. The address is normalized to its subnet
before expansion, so inspect the preview. No expansion is silently truncated.
Unspecified, multicast and limited broadcast addresses are rejected. IPv6
link-local targets need scopes and are unsupported. Literal directed broadcasts
cannot be recognized without a destination subnet mask: the operator must avoid
them. Public endpoints are not magically authorized by the application checkbox.

## Architecture

```text
ScanBuddy React workspace
  → typed Tauri adapter
    → native command validation
      → independent ScanBuddyState job store
        → shared paced start gate
          → bounded Tokio TCP-connect workers
            → per-attempt observations → status/history → exports
```

- `src-tauri/src/services/scan_buddy.rs`: pure planner, independent managed job
  state, scheduler, cancellation, connection outcome mapping and loopback tests.
- `src-tauri/src/commands/scan_buddy.rs`: plan/start/status/cancel/history IPC.
- `src/services/tauri/scanBuddy.ts`: typed envelopes, serialized read lane.
- `src/components/ScanBuddy.tsx`: original workspace, explicit scope review,
  lifecycle guards and user-triggered actions.
- `src/lib/scanBuddyPresentation.ts`: preliminary UI validation, presets, result
  projection and exports. Native validation is authoritative and reruns at start.
- App bootstrap registers its own managed state; app exit/drop cancels pending work.
- The old `HybridIntel.tsx` is no longer routed or bundled into this view. It is
  retained as legacy source to avoid destructive removal of unrelated work.
  The old `network_engine` routing key remains internal compatibility plumbing;
  its visible name and rendered component are Scan Buddy.

The scanner creates no process command line and uses no shell expression. It
connects directly to validated literal SocketAddr values. No network activity is
performed by plan/status/history reads or automatically on app startup. Runtime
logs keep operation/count/outcome metadata but not targets, port lists or raw
errors. Scan result endpoints stay in bounded memory and explicit exports.

## Verification boundaries

Tests cover UI validation/exports/IPC envelopes and native plans, real loopback
OPEN/CLOSED results, authorization, history bounds, paced starts, cancellation
and shutdown. Test fixtures are not inserted as real user observations. Actual
checks and release receipts are recorded in `docs/BACKEND_LOGBOOK_IST.md`.
Mounted native clicks/downloads, Windows runtime and hostile-network timing still
require validation; neither a successful build nor a loopback test proves these.

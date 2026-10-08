# Network monitoring and application logs

## Measure current network activity

Open the native NET0ZE desktop app and select **Host & Logs**. In **Measured
interface throughput**, select your Ethernet/Wi-Fi interface. Two valid readings
are needed before rates appear; the default refresh interval is three seconds.

- RX is received traffic; TX is transmitted traffic.
- Mbps uses 1,000,000 bits/second. KiB/s uses 1,024 bytes/second.
- Rates are interval averages from operating-system counters, not a benchmark of
  your Internet plan. Downloads, background applications and local LAN traffic
  can all contribute. No speed-test traffic is sent.
- Select a VPN/virtual interface independently. Never add it to the physical
  interface: the same traffic may be counted twice.
- Resets, failures, missing/down interfaces and long sampling gaps are marked.
  Unavailable values are shown as dashes, not fake zeroes. A healthy idle interval
  can correctly report zero.
- Graph history keeps 120 valid intervals per interface, with at most 32
  interfaces. Totals/peaks cover valid intervals while this view is mounted;
  leaving the page resets the view session. Skipped gaps are excluded.

**Export recent CSV** saves the selected interface's retained measured intervals
on request. Columns: `interface`, `timestamp_utc`, `interval_seconds`, `rx_bytes`,
`tx_bytes`, `rx_mbps`, `tx_mbps`, `rx_kib_per_second`, `tx_kib_per_second`,
`gap_before`. The export contains real local observations: keep it private unless
you intentionally choose to share it.

## Read application operational logs

In **Host & Logs → Application logs**, click **Read logs**. This is on-demand:
no log-polling worker or capture is started. **Save log** downloads the currently
read snapshot with its collection time, timezone, byte count and truncation flag.

Logs record structured operation outcomes and durations, not packet contents,
credentials, arbitrary error messages, paths or search input. Recorded Capture
Buddy operations include import, search, export, start, stop and worker completion.
`count` is returned rows for search and completed sessions/files for other
operations. Worker completion does not prove a nonzero packet count. Original
PCAP/PCAPNG recordings and their detailed analysis remain separate private data.

Runtime timestamps preserve the project's IST (`Asia/Kolkata`) contract. Interface
CSV timestamps are UTC ISO strings; don't compare them as unlabelled local times.

The app-data `logs/` directory holds five rotating slots (`runtime-0.log` newest
through `runtime-4.log` oldest), each limited to 1 MiB. On Unix the directory is
0700 and files/lock are 0600. Legacy `backend-*.log` files are deliberately left
alone and do not count toward this new 5 MiB limit. They are not shown in the UI.

The default read is the latest 64 KiB; backend requests clamp to 1–256 KiB. The
oldest returned line may be partial when truncated. Native status includes file
count, retained bytes, timestamps and explicit availability. If disk access is
lost or another new-build process owns the file lock, file logging reports
unavailable; safe structured stdout logging continues. Logs are not a durable
compliance archive and older ring entries are automatically retired.

## Export a local host report

In **Host & Logs → Local host report**, leave identifier inclusion off unless you
need endpoints/hostnames/paths in your own private report. Click **Collect report**,
inspect the preview/source statuses, then **Save Markdown** or **Save JSON**.
No observations are uploaded. Download behavior depends on the native webview's
download permissions; a started download is not independently verified as saved.

The report reads actual system details, interface counters, TCP sockets, readiness
and application-log status. Sources are collected independently, with UTC
timestamps and explicit failures/unavailable states. Empty sockets are not proof
of no traffic. Counters are cumulative, not speed-test results. No threat/health
assessment, automatic capture, external probe or scan is performed.

Identifiers and endpoints are redacted by default. Opt-in includes bounded host,
user, interface/IP/MAC, endpoint/port/process and path metadata. Review before
sharing; even a redacted report can contain distinguishing system characteristics,
so this is not a promise of anonymity. Log contents and freeform diagnostics are
never included. Switching the option clears the old snapshot.

Exports include schema version, limits, source names/status/timestamps, provenance,
observed data and omission counts. Maximum: 64 interfaces, 128 TCP sockets, 32
tools, eight addresses per family/interface, 160 characters/string, 12,000-character
preview and 2,097,152-character serialized output. A fresh collection is required
to update a saved snapshot. The report does not persist snapshots automatically.

## Core versus experimental views

Capture Buddy and Host & Logs stay directly accessible. Optional unfinished views
are grouped under **Experimental**, not deleted. They load lazily. No active scan,
raw capture or external enrichment is silently enabled by the cleanup.

## Development receipts

Use `npm test`, `npm run build` and `npm run lint`. Native checks and their local
SDK setup are recorded in `docs/NETOZE_HANDOFF.md`. The continuing change tracker
is **`docs/BACKEND_LOGBOOK_IST.md`**; it contains the file inventory, data contracts,
actual checks, release receipts and limitations for this phase.

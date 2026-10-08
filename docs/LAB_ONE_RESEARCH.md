# Room 1 research and implementation notes

## Research boundary

The first room is Red Team — Network Scanning and Asset Discovery. The research
benchmarks practical training patterns, not copied room content:

- TryHackMe's public Network Services description emphasizes learning,
  enumerating and exploiting multiple network services and misconfigurations.
- VulnHub describes local labs around attacker/target networks, virtualized
  machines, operating systems and daemons/services.
- PortSwigger's Web Security Academy describes structured learning paths and
  realistic deliberately vulnerable web applications/labs.
- RFC 4253 defines SSH transport behavior, including the server identification
  exchange: an `SSH-protoversion-softwareversion` line terminated by CRLF. It
  also makes clear that a banner alone is not a complete SSH implementation;
  authentication, key exchange, encryption and channels are separate protocol
  stages.

## What Room 1 now starts together

One explicit Start creates one loopback room listener and exposes a bounded
fictional range description atomically:

- Seeded inventory: four fictional loopback records, three in scope and one
  decoy.
- Web surface: read-only Aurora Ledger page plus fixed API, headers, route,
  robots-style metadata and training-findings endpoints.
- SSH surface: a banner-only endpoint returning a valid SSH identification line;
  no authentication, key exchange, shell, command channel or credentials.
- Shared room APIs: metadata, state, actions, report and reset.
- Server-authoritative workflow: inventory, web inspection, SSH-banner
  inspection, exact evidence bundle, scope decision and computed report.

The web and banner endpoints are same-origin paths under the active room URL,
loopback-bound, bounded, no-store and covered by the room's CSP/request limits.
They do not bind the displayed fictional addresses or ports, contact the host,
execute a scan, or provide a route to the outside network. The displayed
addresses/ports are training observations; this distinction is intentional.

## Why this is not yet a VM or full network-services range

Online VM/range platforms can provide real isolated operating systems, actual
daemon behavior, shell sessions, credentials and multi-host routing. Adding
those to the unrestricted desktop host would be unsafe and would not meet the
local-only boundary. The next safe maturity step is a separately provisioned,
least-privilege container/VM range with explicit lifecycle, resource caps,
network namespace, no host mounts, no host credentials, and a kill/reset path.
That is not silently substituted here.

## Verification

Native tests cover atomic service metadata, web routes, response limits, same
origin, SSH banner, rejected execution/upload/shell routes, discovery evidence,
scope/report, persistence and reset. The live Happy DOM harness uses actual
Rust loopback HTTP and checks both service URLs, browser actions, native/browser
state equality, reset, stop, and separate-process resume. This is not rendered
browser or installed-package visual acceptance.

Sources consulted:

- https://tryhackme.com/room/networkservices
- https://www.vulnhub.com/lab/
- https://portswigger.net/web-security/learning-paths
- https://www.rfc-editor.org/rfc/rfc4253

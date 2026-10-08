# Capture Buddy Native

## Current architecture

The current engine uses **no TShark, dumpcap, Wireshark executable, dissector library, or display-filter translator**. Rust implements file reading, protocol decoding, searching, statistics, TCP reconstruction and export. libpcap/Npcap remains the OS adapter-access dependency; building a network driver is outside the analysis engine.

Files:
- `src-tauri/src/services/buddy_engine.rs`: PCAP/PCAPNG reader, decoded records and byte evidence.
- `src-tauri/src/services/buddy_search.rs`: native query AST and record evaluator.
- `src-tauri/src/commands/capture_buddy.rs`: sessions, bounded analysis, native capture worker, export, summaries and reconstruction.
- `src/components/CaptureBuddy.tsx`: recording, review, search and inspection workflow.

## Implemented coverage

| Area | Native support |
|---|---|
| PCAP | Version 2.4, little/big endian, microsecond/nanosecond timestamps |
| PCAPNG | Section/interface blocks, timestamp resolution/offset, enhanced/simple packet blocks; simple packets preserve missing timestamps |
| Link layers | Ethernet, VLAN/QinQ, raw IP, Linux cooked v1/v2, loopback |
| IP | IPv4/IPv6 addressing and bounded extension-header traversal |
| Transport | TCP flags/sequence/ack/window, UDP lengths/ports, ICMP/ICMPv6 type/code |
| DNS | Header fields, first question name/type/class, bounded compression-pointer traversal; packet-local UDP and complete TCP messages |
| HTTP | Recognizable packet-local start lines |
| TLS | Record-header metadata; legacy version is not presented as negotiated version |
| TCP review | Directional sequence ordering, overlap omission and explicit missing-byte markers; observed SYN changes split connection generations |
| Evidence | Native field text and original hex/ASCII bytes |
| Statistics | Recorded/captured byte totals, deepest decoded protocol counts and directional endpoint paths |
| Live recording | Owned Rust worker using libpcap/Npcap, nonblocking reads, BPF capture filter, actual capture timestamps, direct PCAP writing |
| Save as | Native format validation, byte-preserving copy, no overwriting existing files |
| Investigation brief | Bounded local synthesis of protocol mix, top talkers/conversations, DNS questions, byte totals and review notes; no threat verdict or decryption |
| Capture Investigation board | On-demand bounded Conversation Board, Evidence Timeline and Explainable Anomaly Queue with packet-number evidence links; no maliciousness verdict |

## User workflow

1. Open **Capture Buddy**. Choose Record this device or Review a saved recording.
2. For recording, select an interface, choose 1–3600 seconds, and optionally enter a BPF recording filter. Recording stops at that duration, 32 MiB, or 100,000 packets, whichever comes first.
3. For review, enter the absolute path to a PCAP/PCAPNG file (up to 64 MiB and 100,000 records).
4. Search with Buddy syntax; select a result to inspect its native decode and original bytes.
5. Read TCP exchange reconstructs captured payloads in each direction. Summarize recording reports the whole file, not just the current filtered page.
6. Finish recording before Save recording as…; enter a new absolute filename matching the actual `.pcap`/`.pcapng` format. Live native recordings are `.pcap`. Save preserves every packet irrespective of search filters.
7. Leaving the pane requests a clean stop. A worker still flushing after two seconds remains owned and blocks overlapping recording; its session is not silently discarded.
8. Click **Build investigation brief** after opening a recording to see a compact
   evidence summary. It is derived from the whole decoded recording, not only the
   visible/search-filtered page. It reports protocol and endpoint frequency,
   decoded DNS question text and bounded review notes for large frames, missing
    timestamps, HTTP-like metadata or TLS metadata. It does not decide whether
    traffic is malicious, decrypt TLS or replace packet evidence.
9. Use **Capture Investigation → Generate model** for linked conversations,
   timeline events and explainable review notes. Select a packet number to return
   to packet inspection. Filters affect only the projection/export; source bytes
   remain unchanged.
10. **Save case bundle** creates a versioned evidence-only JSON bundle containing
    the bounded board projection, packet references, limitations and provenance.
    It does not embed or upload the original PCAP/PCAPNG; preserve and share the
    source recording separately when authorized.

## Native search language

- `dns port:53`
- `from:192.0.2.1 to:192.0.2.2`
- `ip:2001:db8::1`
- `tcp -port:443`
- `dns OR tls`
- `size:>1000 time:<=30`
- `text:"dns query"` or `"example.com"`

Spaces mean AND. OR joins AND groups. Minus negates one term; quoted text is literal. Fields: ip/from/to, port, text, size (reported wire bytes), time (seconds relative to the first timestamped packet). Protocol searches match decoded layers, so `tcp` also finds packets with packet-local HTTP/TLS decoding. Text searches decoded summaries, not arbitrary encrypted payloads. Unknown time never matches a time comparison.

Supported protocol terms: tcp, udp, dns, http, tls, arp, icmp, icmpv6, ip, ipv6, ethernet, vlan, sll, sll2. QUIC and DHCP decoders are not implemented and are explicitly reported as unsupported; use udp/port queries. Raw Wireshark expressions are not a native query language.

## Limits and honest boundaries

This is an independent native first release, **not full Wireshark protocol coverage**. IP fragment reassembly, complete multi-packet application decoding, complete DNS answer dissection, QUIC, DHCP, TLS decryption, checksum validation, radiotap/802.11 monitor decoding, indexed multi-gigabyte files and editable dissector preferences remain future work.

TCP overlap bytes are omitted with a warning, not silently accepted as proven identical. Midstream captures and reused tuples without an observed SYN can be ambiguous. HTTP/TLS recognition is packet-local. Unsupported links/protocols retain their original bytes and explanatory status; malformed records are not replaced with generated rows. PCAPNG obsolete packet blocks and IPv6 jumbograms are rejected/marked unsupported.

Analysis is bounded to two concurrent tasks, 64 MiB input and 100,000 packets. The current implementation scans the bounded file for each query; it has no persistent index. TCP text output is capped at 1 MiB. Packet pages contain at most 200 matching rows.

Investigation briefs keep at most 12 protocol/talker entries, 20 conversation
entries and 20 DNS question strings. They are generated on demand and are not
automatically stored or uploaded. Endpoint labels are observations and may be
sensitive; exports remain the deliberate sharing boundary.

## Capture permissions

Linux recording now uses the dedicated native `netoze-capture-helper` at `/usr/lib/netoze/netoze-capture-helper`. The DEB post-install script, run by the system package manager with administrator approval, makes only that helper root-owned, group `netdev`, mode 0750, with `cap_net_raw=ep`. The desktop GUI stays unprivileged. Members of netdev can record traffic with the helper; other users cannot execute it. The helper accepts only a local interface, bounded duration and BPF filter, writes PCAP to an output descriptor opened by the unprivileged parent, and stops on input/parent EOF or its limits.

The helper is our Rust code using libpcap, not dumpcap/TShark. A passive `--check` confirms its effective capability without capturing traffic. Missing helper, inaccessible group, missing capability, or a restricted launch is surfaced before recording. After setup use **Recheck recording access**. Copying/extracting the package into a per-user directory does not run its privileged installer script and cannot enable capture.

Windows still uses Npcap access. `NoNewPrivs` restrictions are reported and never bypassed. Saved-file review requires no capture privilege. Installing the new DEB with the OS package manager is required to grant the helper access; the agent has not performed that administrator-only step or a live capture.

## Verification

- 71 Rust library tests passed, including native file formats, byte order/timestamp handling, cooked links, VLAN/IPv6, DNS, HTTP/TLS headers, TCP generations/reconstruction, query evaluation, malformed/truncated inputs, and save/reopen behavior.
- The 13 native Buddy tests also passed with `PATH=/nonexistent`, demonstrating no analyzer executable is used.
- Frontend production build, IPC contract test and two presentation tests passed.
- No live capture was run during this work. Windows runtime and exhaustive GUI interaction tests remain unverified.

Test fixtures are isolated and never installed as live observations.

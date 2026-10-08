# Capture Buddy product direction

Capture Buddy is intended to be an **evidence workspace**, not a Wireshark clone.
Raw packet review remains important, but the user-facing value is reducing the
time from “I recorded traffic” to “I understand what happened and can explain it.”

## Principles

1. **Evidence before verdicts.** Show decoded facts, timestamps, byte counts,
   protocol context and explicit uncertainty. Never turn a port/protocol label into
   a threat claim without evidence.
2. **Investigation before configuration.** Prefer useful local summaries, guided
   search, conversations and timelines over a wall of dissector preferences.
3. **Bounded by design.** Every parser, query, export, timeline and background task
   has row/byte/time limits and visible truncation or unsupported states.
4. **Reproducible outputs.** A user can save the original recording, search syntax,
   derived brief and evidence fields without silently mutating the source bytes.
5. **Privacy by default.** No automatic upload, enrichment, capture or external
   feed. Endpoint/payload exports are explicit and clearly marked sensitive.

## Current evidence workflow

**Record or review → search → inspect decoded evidence/original bytes → read TCP
exchange → build Investigation Brief → save original recording/report.**

The Investigation Brief is the first layer above packet rows. It gives protocol
mix, top talkers, directional conversations, DNS questions, captured/wire bytes,
duration bounds and review notes for large frames, missing time, HTTP-like and TLS
metadata. It is a local synthesis, not an IDS verdict or a replacement for packet
inspection.

The current **Capture Investigation** board adds three linked views above packet
rows: Conversation Board, Evidence Timeline and Explainable Anomaly Queue. Each
conversation/anomaly carries packet-number evidence links back to the session.
These are bounded metadata projections; confidence is expressed as `observed`,
not a probabilistic threat score.

The board can save an evidence case bundle containing schema version, UTC
generation time, bounded filtered projections, packet-number references and
limitations. It excludes raw capture bytes; the original recording remains a
separate source artifact and is never overwritten or uploaded by this action.

## Deliberate future layers

- **Conversation board:** stable per-connection cards with first/last seen, packet
  count, bytes, direction, DNS/HTTP/TLS evidence and “open in timeline.”
- **Evidence timeline:** zoomable event bands for DNS, connection setup, TLS
  metadata, HTTP-like lines and anomalies, with packet-number links.
- **Explainable anomaly queue:** bounded heuristics such as unusual frame size,
  malformed decode, retransmission/overlap markers, failed connection patterns and
  burst changes. Every item must show rule, evidence packets and confidence—not a
  generic “malicious” badge.
- **Case bundle:** source hash, capture metadata, query history, brief, selected
  evidence and original recording with a manifest. No overwriting; no hidden upload.
- **Protocol capability matrix:** supported/partial/unsupported per recording and
  link type, so users know what the native engine did not decode.
- **Safe replay view:** deterministic local re-read/search of a saved recording;
  never retransmit captured traffic onto a network.

These layers preserve NET0ZE’s identity: an explainable, bounded, local-first
network evidence product rather than a screenshot of another analyzer.

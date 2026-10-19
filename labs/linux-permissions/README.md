# Ledger Sync: Linux Permission Review

Ledger Sync is an original, local, read-only Linux permissions training target.
It presents a simulated service manifest, configuration summary, and fixed file
permission inventory. The exercise is about comparing what a reconciliation
worker needs with the access it actually has: ownership, mode bits,
supplementary groups, capabilities, and writable directories. No host files are
read and the target has no shell, command runner, credentials, uploads, or
external network client.

## Walkthrough

1. Open the overview and note the service's stated job.
2. Read `/api/service` and record the runtime user, supplementary groups,
   capabilities, and writable paths.
3. Read `/api/files`; for each sensitive-looking path, interpret the owner,
   group, and `mode` together. Pay particular attention to who can read or
   write the backup.
4. Compare the access inventory with the worker's job. Identify the group and
   file exposure that are broader than necessary, then write down a least-
   privilege remediation (identity, groups, modes, and paths).
5. Submit the recovered flag as JSON to `POST /api/submit` with a body of
   `{"flag":"..."}`. The server validates it against the run's `config.json`.

The walkthrough intentionally does not include the flag or the completed
finding set. `/api/findings` contains review notes to consult after forming
your own conclusion.

## Safe deployment shape

The Dockerfile uses a pinned Python 3.13 Alpine digest, runs as UID/GID
`10001:10001`, and uses only the standard library. It is compatible with a
read-only root filesystem because the server performs no writes. The target
does not mount host paths, execute subprocesses, accept arbitrary paths, or
make outbound requests. A deployment should replace the placeholder flag in
`config.json` with a fresh per-run value before building the image.

## Standalone checks

These tests start the actual HTTP handler on loopback and do not demonstrate
Docker isolation:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s labs/linux-permissions -p test_target.py -v
```

# Ledger Sync: Linux Permission Review

Ledger Sync is an original, local, read-only Linux permissions training target.
It presents a simulated service manifest, configuration summary, and fixed file
permission inventory. The exercise is about comparing what a reconciliation
worker needs with the access it actually has: ownership, mode bits,
supplementary groups, capabilities, and writable directories. No host files are
read and the target has no shell, command runner, credentials, uploads, or
external network client.

## START HERE: route map

This is a guided permission review, not a shell exercise. The evidence is
simulated and fixed, and the target never reads host files or executes your
input.

1. **Open `/`** — read the worker's stated job and follow the START HERE cards.
2. **Open `/api/service`** — record the user, supplementary groups,
   capabilities, and writable paths.
3. **Open `/api/files`** — read owner, group, and `mode` together. Pay special
   attention to who can read or write the backup.
4. **Use `/review` as your worksheet** — compare each access grant with the
   worker's job. Write the smallest least-privilege remediation you can.
5. **Confirm, then submit** — consult `/api/config` and `/api/findings` after
   forming your conclusion. Submit JSON to `POST /api/submit` with
   `{"flag":"..."}`.

### Safe hints

- For a mode such as `0644`, read the three classes in order: owner, group,
  then everyone else. Do not infer access from a filename alone.
- Separate **required** access from **convenient** or **unrelated** access.
- The findings endpoint is a confirmation aid, not a substitute for comparing
  the manifest and inventory yourself.
- Stay on the fixed routes. There is no shell, upload, arbitrary file reader,
  or command runner to discover.

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

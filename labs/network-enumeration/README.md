# Northstar Yard: Network Enumeration

Northstar Yard is an original, local-only CTF target for practicing service
enumeration. It is a real two-service deployment: a read-only HTTP telemetry
site on port `8000` and a read-only line-oriented TCP console on port `9000`.
The services share a fictional operations story and intentionally expose clues
through normal metadata, a service registry, a banner, and a maintenance
export. There are no credentials, shell commands, uploads, host mounts,
external network requests, or arbitrary file paths.

Each deployment supplies `config.json` with a fresh `NET0ZE{...}` flag. The
fixed `/verify?flag=...` route performs server-side validation and returns only
accepted/rejected status; the answer is not placed in status, registry, or TCP
responses. The maintenance export is the intended read-only recovery surface.

## START HERE: route map

Think like a careful network cartographer. Every step is an observation, and
the target is read-only. You do not need credentials, uploads, shell commands,
or arbitrary path guesses.

1. **Start at `/`** — note the links, title, headers, and the crawler policy.
2. **Follow `/robots.txt`** — use the fixed path it names, then inspect the
   service registry. Record the second protocol and port.
3. **Pivot to TCP** — read the banner, send `HELP`, and use only `INFO`,
   `STATUS`, or `QUIT`. The console names the maintenance handoff.
4. **Follow the handoff** — inspect `/ops/maintenance.json`, then the fixed
   export path it identifies. Read the deployment record as evidence.
5. **Verify your finding** — submit the recovered value to
   `/verify?flag=...`. A correct value is accepted; a wrong value is rejected.

### Safe hints

- Keep a notes table with **service → protocol → port → path**.
- A `404` is a useful boundary signal; stay on the routes you discover.
- The answer is deliberately absent from the status page, registry, and TCP
  responses. Look for the named export instead of brute forcing.
- All server methods except the fixed verification read are read-only; do not
  send POST requests or attempt command execution.

## Run locally

Create a test-only config before running the target directly:

```sh
printf '%s\n' '{"site":"Northstar Yard","flag":"NET0ZE{local-test-value}"}' > config.json
HTTP_PORT=8000 TCP_PORT=9000 python3 server.py
```

The Docker image is pinned to the existing Python Alpine digest, runs as UID/GID
`10001:10001`, writes no files at runtime, and exposes only the two fixed target
ports. The native runtime should provide `config.json` per run and place the
container on its private lab network; this directory does not grant host access.

## Checks

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/network-enumeration -p test_target.py -v
```

These standalone tests exercise both services, flag validation, route
boundaries, and the read-only method boundary. They do not claim Docker
isolation or replace the runtime's container lifecycle checks.

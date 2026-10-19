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

## Walkthrough

1. Start at the HTTP service and record the title, linked pages, response
   headers, and crawler policy.
2. Follow the fixed metadata path named by the crawler policy and inspect the
   service registry. Note the second protocol and its port.
3. Connect to the TCP service, read its banner, and use only the documented
   read-only commands. Follow the maintenance route named by the console.
4. Inspect the maintenance JSON and then the fixed export it identifies. Read
   the exported deployment record locally.
5. Submit the recovered value to the HTTP verification route. A correct value
   returns an accepted result; an incorrect value is rejected.

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

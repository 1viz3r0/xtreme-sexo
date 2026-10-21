# Signal Kiosk: Header Trail

Signal Kiosk is an original **Easy** CTF room for practicing careful discovery
across two small services. The target has a fixed read-only HTTP site on port
`8000` and a fixed line-oriented TCP console on port `9000`. There are no
credentials, shell commands, uploads, arbitrary paths, host mounts, or outbound
network requests. It is a bounded container target, not a VM or a host scanner.

The room is intentionally self-contained under `labs/header-trail/`. If it is
not visible in a product catalog, run it with the commands below or use the
catalog integration that provisions this directory; do not assume a missing
card means the target is broken.

## Start locally

Run the server from this directory (Python 3.11+):

```sh
python3 server.py
```

The default listeners are `127.0.0.1`-reachable at `http://127.0.0.1:8000`
and TCP `127.0.0.1:9000` when run directly. A fresh flag is generated in
memory for each server process; the placeholder in `config.json` is never used
as a submitted answer and no runtime file is rewritten. In a container, the
same process binds the container interface and should be reached only through
the owning local runner.

## Walkthrough

1. Check `/health`, then open the HTTP landing page and `/status`. Record the
   TCP service and the read-only mode.
2. Read `robots.txt`; it points to the `/bulletin/` namespace. Inspect the
   release JSON and note the console's guidance.
3. Connect to TCP and use `HELP`, `INFO`, and `BULLETIN`. Commands are fixed;
   input is never interpreted as a command or path.
4. Read `/bulletin/check.json` and recover the per-run flag.
5. Verify it with `GET /verify?flag=...`. The response discloses only whether it
   matched the current in-memory run. URL-encode the flag when using curl.

Useful commands:

```sh
curl -i http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/robots.txt
curl -s http://127.0.0.1:8000/bulletin/release.json
nc 127.0.0.1 9000
```

The flag is deliberately discoverable at `/bulletin/check.json`; validation
proves that a learner recovered the current run's value without revealing it in
health, status, or rejection responses.

## Safe deployment and tests

The Dockerfile uses the pinned Python Alpine digest, UID/GID `10001:10001`, a
container healthcheck, and only the standard library. The process writes
nothing, needs no host mount, and works with a read-only root filesystem on an
internal network. Every process run generates a fresh flag in memory.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/header-trail -p test_target.py -v
```

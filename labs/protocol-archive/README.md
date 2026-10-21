# Copperline Protocol Archive

**Level: Hard · type: local web/network investigation · time: 15–25 minutes**

Copperline is a small, original, read-only CTF room. You investigate a fixed
HTTP archive and a line-oriented TCP console, then recover and submit a flag.
It is not a shell, VM, exploit target, or remote service: there are no
credentials, uploads, arbitrary paths, host mounts, or external network calls.

## Start locally

The standard library is the only dependency. From this directory, run either:

```sh
python3 server.py
```

Then use a second terminal. The server listens on `127.0.0.1` only if you set
`BIND_HOST=127.0.0.1`; this is the recommended direct-run setting:

```sh
BIND_HOST=127.0.0.1 python3 server.py
```

For a bounded Docker run, build and publish only to loopback. The image has no
secret or fixed answer: when `config.json` has no flag, the process generates a
fresh in-memory flag for that run. A deployment may inject a fresh flag with
`NET0ZE_FLAG` instead.

```sh
docker build --tag protocol-archive:local .
docker run --rm --name protocol-archive --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges --publish 127.0.0.1:8000:8000 \
  --publish 127.0.0.1:9000:9000 protocol-archive:local
```

Check readiness before investigating:

```sh
curl -fsS http://127.0.0.1:8000/health
# {"healthy":true,"mode":"read-only"}
```

## Beginner walkthrough

1. Open `http://127.0.0.1:8000/` and read the landing page.
2. Follow its `catalog` and `robots.txt` links. `robots.txt` points at the
   archive namespace; the catalog tells you the next protocol is TCP on 9000.
3. Read these HTTP records in order:
   `/archive/index.json`, then `/archive/manifest.json`.
4. Connect to the console and ask for the transcript:

   ```sh
   printf 'HELP\nTRANSCRIPT\nQUIT\n' | nc 127.0.0.1 9000
   ```

   The `CPL-7` marker confirms that the ledger is the next record.
5. Fetch `/archive/ledger.part`. Keep the text after `PAYLOAD=` and decode it:

   ```sh
   curl -s http://127.0.0.1:8000/archive/ledger.part \
     | sed -n 's/^PAYLOAD=//p' | base64 -d
   ```

   The decoded value is the flag for this run. Do not expect it to match a
   previous run.
6. Validate it server-side. URL-encode the value if it contains punctuation:

   ```sh
   curl --get --data-urlencode 'flag=PASTE_THE_DECODED_FLAG_HERE' \
     http://127.0.0.1:8000/verify
   ```

   A correct value returns `{"valid":true,"message":"accepted"}`. Wrong
   values are rejected without revealing the answer.

## Boundaries and tests

Only fixed `GET` routes are available. `POST`, unknown paths, path traversal,
and direct config access return errors. `/health` is the liveness/read-only
check. The Dockerfile uses a pinned Python Alpine image, a non-root UID/GID,
and a standard-library health check; combine it with `--read-only`, dropped
capabilities, and loopback-only publishing as shown above.

Run the standalone tests from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning \
  -m unittest discover -s labs/protocol-archive -p test_target.py -v
```

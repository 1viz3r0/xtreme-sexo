# Harborline Dispatch: Web Exposure

An original local practical target. Discover crawler exclusions and release
metadata, browse the mistakenly exposed support exports directory, download a
real ZIP backup, and recover the per-run flag from `deployment/config.json`.
The root page and health response do not disclose the flag.

The native runtime embeds the Dockerfile, Python server, and index page into a
private temporary build context and generates `config.json` for each run.
It requires Docker CLI and local daemon version 28 or newer. Remote Docker
engines and legacy labs are unsupported; there is no simulated fallback.

The target uses the Python standard library, runs as UID/GID 10001, and has a
read-only root filesystem, no added capabilities, no-new-privileges, 96 MiB
memory, 32 PIDs, and 0.5 CPU. It has no mounts or privileged mode. A uniquely
labeled internal Docker network limits target egress, with no Docker port
publishing. NET0ZE forwards an OS-assigned host `127.0.0.1` port only to the
ownership-checked container IP on port 8000. Build steps use network
`none`; fetching the Python base image still requires the daemon to have that
image available or registry access.

`lab_runtime_start` defaults to `web-exposure`; deprecated track/port inputs
are ignored. All status-producing commands return:

```json
{"running":false,"labId":null,"phase":"stopped","targetUrl":null,"message":"No practical lab is running.","runtime":"docker","completed":false}
```

Phases are `stopped`, `running`, `setup-required`, and `error`. Only
`{"action":"submit_flag","flag":"..."}` is accepted by the native action
command. Stop removes only ownership-verified resources from this run. Reset
recreates the target with a new flag. Active runs are not checkpointed; shutdown
attempts cleanup, but abrupt process/daemon termination can leave uniquely
labeled resources requiring operator cleanup. No global prune is performed.

## Checks

Target-only tests (do **not** demonstrate container isolation):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s labs/web-exposure -p test_target.py -v
```

Native contract and verifier tests:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib services::lab_runtime
cargo test --manifest-path src-tauri/Cargo.toml --test lab_runtime_verify --test lab_runtime_persistence_verify
```

Real Docker lifecycle acceptance (explicitly ignored in ordinary native runs):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --test lab_runtime_verify -- --ignored
cargo test --manifest-path src-tauri/Cargo.toml --lib services::lab_runtime -- --ignored
```

These opt-in tests verify effective sandbox settings, the internal-network
configuration, flag recovery/submission through the loopback forwarder, reset
flag rotation, active-connection cancellation, and teardown. The sandbox test
checks absence of a default route and denied TCP access to 1.1.1.1:443.
A passing standalone Python test is not
evidence that Docker is available or that the container controls work.

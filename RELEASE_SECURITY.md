# Release security process

How a NET0ZE desktop release is produced, verified and published — and what
separates an attacker from the update channel.

## Artifacts and where they come from

Per-platform bundles are produced by the repository's own build scripts
(`npm run dist:linux` / `dist:windows` / `dist:release`):

* Linux: `deb` and `AppImage`.
* Windows: NSIS setup and MSI (native CI runner, or cross-validated with a
  full local toolchain — see "Windows" below).
* Every release ships a `SHA256SUMS.txt` plus a staging `manifest.json`
  produced by `scripts/stage-native-release.mjs` **before** any upload.

Checksums are computed over the exact bytes that were built. CI must not
regenerate checksums after upload, and one platform's pipeline must never
overwrite another platform's shared files (historically a hazard when both
platforms published `SHA256SUMS.txt` to the same release — coordinate or
namespace them instead).

## Update manifest ceremony

`update.json` + `update.json.sig` govern the desktop client's update policy.
They are only ever updated as a pair:

1. A maintainer runs the build for the new release and records real artifact
   sizes and SHA-256 digests into `update.json` (the values in the manifest
   come from `sha256sum` over the produced files, never from assumption).
2. The maintainer runs the signing helper **locally**, never in CI:

   ```
   node scripts/sign-update-manifest.mjs
   ```

   It calls `tauri signer sign`, which writes/refreshes `update.json.sig`
   next to the manifest. The script refuses to run without the private key
   and validates the manifest's basic shape before signing.
3. Commit `update.json` and `update.json.sig` **together**; never ship a
   manifest whose signature does not match. The regression test
   `repo_manifest_verifies_with_embedded_public_key_and_tampering_fails`
   in `src-tauri/src/services/update_gate.rs` pins exactly this against the
   committed file pair and fails the build on a mismatch.

The signature file may exist in either accepted byte shape (raw minisign
text, or the tauri-CLI base64 container — see `UPDATE_ARCHITECTURE.md`).
The tauri CLI's native output (the container shape) requires no extra
tooling.

## Key handling

* The private update-signing key lives in a maintainer-owned location
  outside the repository (currently `~/.local/share/netoze-update-signing/`,
  mode `0700`, key file `0600`). It is never committed, never copied into
  CI secrets as a file, never present in release pipelines.
* Losing the key means rotations, not disasters: publish a new key pair and
  ship a release signed by the old key that carries the new public key
  (the trust root migrates through a verified release, not through config).
* The key id recorded in the manifest (`signing.key_id`) must match the key
  that produced the signature; the client embeds the corresponding public
  key.

## Trust-root limitations, stated plainly

* The **maintainer is the trust root**. Anyone able to push a signed
  `update.json`/`.sig` pair to the default branch controls what the client
  believes about updates. Protect the private key accordingly, review
  changes to these two files carefully, and treat any request to move
  signing into CI as a policy change requiring separate authorization.
* The URLs inside `update.json` must use HTTPS and an approved host.
  Extending the host allowlist is a code change by design.
* This design does **not** defend against a fully compromised maintainer
  key/identity; its goal is to make accidental and attacker-forged (unsigned
  or mismatched) update content inert.

## Windows specifics

Windows validation in CI happens only on authorized `v*` tag pipelines. An
unsigned binary warning from SmartScreen on Windows installs is a known
consequence of code-signing being unavailable in this project; it is
documented here, not hidden, and users install at their own judgement.
No mechanism exists (or may exist) to suppress that warning from within the
application.

## Release = equals manifest rule

A release may be tagged only when the manifest locality holds:

* the manifest's artifacts point at assets hashed from real build outputs,
* the committed manifest verifies with the embedded key,
* no release infra exists besides the existing GitHub release pipeline (no
  second distribution channel is introduced for updates).

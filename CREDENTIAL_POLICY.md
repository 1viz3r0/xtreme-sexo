# Credential policy

What secret material exists in this project, where it is allowed to live,
and the rules that keep it out of the wrong places.

## Inventory

| Credential | Owner | Storage | Committed? | Used by |
|---|---|---|---|---|
| Update manifest signing key (Ed25519, minisign format) | Maintainer | `~/.local/share/netoze-update-signing/` (0700 dir, 0600 key) | **Never** | `scripts/sign-update-manifest.mjs`, `tauri signer` |
| Update public verification key | Everyone | Embedded in the binary (`UPDATE_MANIFEST_PUBLIC_KEY`) and the `.pub` file stored with the private key | The public key **is** committed | Client-side verification |
| Windows code-signing certificate | — | — | **None exists** | — |

There are no API keys, provider tokens, database passwords, or signing
secrets in the repository, in CI configuration, or in the landing page.

## Rules

1. **Nothing above the "public" line gets committed.** This includes key
   files, passwords, tokens, cookies, local databases, environment files,
   logs and build caches. If `.gitignore` misses something and a secret
   lands in a commit, rotate the secret — history rewrites are not assumed.
2. **The signing key is a maintainer-custody secret.** It is generated and
   used locally; backups belong to the maintainer (and its loss is
   recoverable through a documented rotation — see `RELEASE_SECURITY.md`).
   Any proposal to move it into repository secrets or CI is a policy change
   requiring separate authorization.
3. **CI gets no signing ability.** Release pipelines may hash and publish
   artifacts and may attach `update.json.sig` produced by a maintainer, but
   they never possess signing material.
4. **Passwords for the machine-local signing key** (if one is set on the
   key) are never used in scripts; the helper reads
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from the maintainer's own
   environment, and the repo documents that variable without storing it.
5. **Rotation**: generating a new key pair and re-signing subsequent
   manifests is the recovery from any suspected key exposure. The key id in
   `update.json.signing` is bumped together with the key change.
6. **User data is not a credential store**: the app persists telemetry and
   preferences locally; it never stores third-party API credentials, and no
   feature may add such storage without updating this document.

## For contributors

If you find material in a file that looks like a credential: do not commit
it, and say so. If you find one already committed: report through
`SECURITY.md`, and assume rotation.

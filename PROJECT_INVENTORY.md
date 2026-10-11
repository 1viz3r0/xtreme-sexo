# NET0ZE project inventory and preservation policy

This file exists so a future agent does not mistake an intentionally excluded
generated folder for missing project work. The GitHub repository is the durable
source checkpoint. Do not upload or recreate large local artifacts merely to
understand the project.

## Durable source included in GitHub

The `master` branch contains the complete tracked source snapshot and history:

- `AGENTS.md` — mandatory continuation instructions.
- `docs/NETOZE_PROJECT_CONTEXT.md` — complete project history, decisions,
  architecture, checks, current stop point, and next-session prompt.
- `docs/NETOZE_LABS_RESUME_MANUAL.md` — detailed practical-Labs handoff.
- `docs/LABS_LOCAL_REBUILD.md`, `docs/LABS_RESEARCH_AND_RECOVERY.md`,
  `docs/LAB_ONE_RESEARCH.md`, and the other `docs/` files — research, product
  direction, backend notes, installation guidance, and historical handoffs.
- `src/` — React/TypeScript application, components, utilities, and tests.
- `src-tauri/` — Tauri configuration, Rust commands/services/platform code,
  native tests, schemas, helper source, and examples.
- `labs/web-exposure/` — original Harborline Dispatch Docker target, target
  server, Dockerfile, README, and standalone tests.
- `scripts/` — build, staging, contract tests, release checks, and smoke tools.
- `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`,
  `.cargo/`, `.oxlintrc.json`, `.gitignore` — reproducible project config.
- `public/`, icons, branding, release-readme material, and tracked image assets.
- `.git/` history is represented on GitHub by the commit history; do not rely
  on a deleted environment's local `.git` directory.

## Intentionally not included

These are reproducible, machine-specific, private, or too large for a useful
source repository. Their absence does **not** mean the code or decisions are
lost:

| Local path | Why excluded | How to restore if needed |
|---|---|---|
| `node_modules/` | 375 MB installed dependencies | `npm ci` |
| `target/` | Rust/toolchain/build cache, about 3.8 GB | Rebuild with the installed Rust/Tauri toolchain |
| `src-tauri/target/` | Tauri native build cache, about 9.9 GB | Rebuild with `npx tauri build` |
| `dist/` | Vite output | `npm run build` |
| `releases/` | Generated installers/staging, about 179 MB | Run Tauri build and `scripts/stage-native-release.mjs` |
| `.env*`, `*.db`, `*.sqlite*`, logs | Private/local runtime state | Recreate only with explicit user intent; never copy secrets |
| `docs/NETOZE_LABS_RESUME_2026-10-08.zip*` | Handoff archive duplicate | The Markdown manual and GitHub source are authoritative |

At the final environment check, these excluded folders existed locally but
were ignored by `.gitignore`; they were not part of the intended GitHub source
backup. Do not run a broad archive or upload operation to include them.

## GitHub checkpoint

- Repository: `https://github.com/1viz3r0/xtreme-sexo`
- Branch: `master`
- Latest checkpoint: `c5992b5 docs: add agent continuation instructions`
- Repository is public and non-empty.
- The committed tree was audited against GitHub: same file count, paths,
  modes, and blob hashes; no missing or extra tracked files.
- The optional `.github/workflows/desktop-build.yml` was omitted because the
  GitHub OAuth token lacked the `workflow` scope. This does not affect the
  application source. Restore it only after explicitly granting that scope.

## Future-agent preservation rules

1. Read `AGENTS.md`, then `docs/NETOZE_PROJECT_CONTEXT.md`, then the Labs
   manual before analyzing or changing code.
2. Preserve the current product direction: category/level practical Labs,
   no Red/Blue/Purple split, no simulated fallback.
3. Begin at the exact unfinished acceptance flow documented in those files:
   `Labs → Start Web Exposure → Open target → submit → Reset → Stop`.
4. Do not implement the planned Network, Linux, or Forensics cards until the
   first lab's packaged UI flow is confirmed.
5. Preserve unrelated source changes and inspect Git status before edits.
6. Never commit credentials, tokens, private keys, local databases, logs,
   generated caches, or raw private chat/session data.
7. If disk space is limited, analyze source only. Do not run `npm ci`, a native
   build, Docker image build, or release staging unless explicitly requested.

## What “all the information” means here

The raw conversation is not copied into the repository because it may contain
private runtime details and is not a safe or reliable engineering artifact.
The durable equivalent is the committed context/manual/history summary: it
records the user decisions, rejected designs, cause of the stale placeholder,
implementation changes, safety boundaries, research references, test output,
installation state, package hashes, Git history, known gaps, and exact next
step. An agent must use those files as the project memory.

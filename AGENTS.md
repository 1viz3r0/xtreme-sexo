# NET0ZE agent continuation instructions

This repository is a continuation checkpoint, not a blank starter project.
Before analyzing or editing anything, read these files in this order:

1. `docs/NETOZE_PROJECT_CONTEXT.md` — complete project history, decisions,
   architecture, test evidence, limitations, GitHub state, and next-session
   prompt. This is the primary source of truth.
2. `docs/NETOZE_LABS_RESUME_MANUAL.md` — detailed Labs implementation manual,
   commands, target design, installation notes, and troubleshooting.
3. `docs/LABS_LOCAL_REBUILD.md` — research and actual Docker/native evidence.
4. `docs/NETOZE_HANDOFF.md` — project-wide handoff; older sections are clearly
   historical and must not override the current context file.
5. `PROJECT_INVENTORY.md` — what is durable in GitHub, what is intentionally
   excluded, how to regenerate it, and how to preserve the workflow when disk
   space is limited.

## Exact stopping point

The current implemented practical lab is **Web Exposure — Harborline Dispatch**
(Web, Beginner). Its real Docker lifecycle, loopback forwarder, sandbox
controls, flag recovery, reset rotation, egress probe, and teardown passed
native tests on Kali Linux with Docker 28.5.2.

The next required action is user-visible acceptance of:

```text
Labs → Start Web Exposure → Open target → investigate/submit flag
      → Reset → verify a new flag → Stop
```

Do not implement another lab until that flow is recorded as passing or its
failure is fixed. Three catalog cards are intentionally planned only:
Network/Beginner, Linux/Intermediate, and Forensics/Advanced.

## Non-negotiable project rules

- Do not restore Red Team, Blue Team, Purple Team, compatibility, or simulated
  fallback room systems.
- Do not claim planned labs, a full VM, SSH, a full scanner, or a remote target
  exists when it does not.
- Keep `setup-required` and `error` states honest; never fabricate readiness.
- Preserve unrelated project work. Inspect `git status` and diffs before edits.
- Never commit passwords, API keys, tokens, private keys, cookies, local
  databases, environment files, logs, build caches, or raw private chat data.
- Run the smallest meaningful checks after edits and report actual results.
- Use ownership-checked Docker cleanup only; never run global Docker prune as
  lab recovery.

## Repository and rebuild facts

- GitHub: `https://github.com/1viz3r0/xtreme-sexo`
- Default branch: `master`
- Generated folders such as `node_modules`, `target`, `src-tauri/target`,
  `dist`, and release staging are intentionally excluded and should be
  regenerated only if the user has enough disk space and asks for it.
- No artifact download or build is required just to understand the project;
  the context files above contain the continuation state.

When the user asks an agent to “analyze the repo,” start by reading this file
and `docs/NETOZE_PROJECT_CONTEXT.md`, then continue from the exact stopping
point above instead of restarting the project or repeating historical work.

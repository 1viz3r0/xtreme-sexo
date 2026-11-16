# Security Policy — NET0ZE desktop

## Supported build

The current supported build is the latest tagged release on the `stable`
channel (see the repository release page). Older builds should be updated as
the first response to any published issue.

## Reporting a vulnerability

Please report suspected vulnerabilities directly to the repository owner
through GitHub (private security advisory via the repository's
"Report a vulnerability" form, or the repository's contact channel if one is
published on the landing page).

Please include:

* the affected build (version and channel), platform and install method,
* the impact an attacker would gain and how they might achieve it,
* any reproduction steps or evidence.

**Please do not**: open a public issue for an unpatched vulnerability,
test against infrastructure you do not own, or include other users' data.

## Response expectations

* Acknowledgement, triage and a severity decision, followed by a fix or
  mitigation plan. High/critical fixes are prioritized ahead of release
  channels.
* Credit in release notes is given by default; tell us if you want to remain
  anonymous.

## Security model summary (short version)

* The desktop client is offline-first; all telemetry processing is local.
* Update policy and install decisions come from **one signed manifest**
  (`update.json` + `update.json.sig`) verified against a key embedded in the
  binary. Unsigned or unverifiable manifests are informational only and can
  never install anything (see `UPDATE_ARCHITECTURE.md`).
* Accounting of the decisions behind this model and their limitations lives
  in `SECURITY_DECISIONS.md`.
* Credential and key handling rules live in `CREDENTIAL_POLICY.md`.
* Release production, checks and checksum publication live in
  `RELEASE_SECURITY.md`.

## Boundaries (explicitly out of scope for this project)

The project does not build or ship: hidden monitoring, stealth mechanisms,
anti-debug/anti-analysis/evasion features, EDR/AV bypass, silent installs, or
any channel that can disable the application remotely without the user's
explicit consent. Reports suggesting such behavior are treated as policy
violations, not as feature requests.

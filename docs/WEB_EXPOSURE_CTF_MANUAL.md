# Harborline Dispatch CTF Manual

## What this room teaches

This is a local, read-only web-exposure challenge. You investigate how ordinary
public HTTP pages, crawler metadata, release information, and a support export
can combine into an exposed deployment artifact.

The room is intentionally original and does not copy HTB, DVWA, OWASP Juice
Shop, or TryHackMe content.

The target is provisioned locally by NET0ZE inside an owned Docker container and
is exposed only through a temporary `127.0.0.1` URL. The challenge flag is
generated for each run and is not printed in this manual.

## Safety rules

- Use only the target URL created by NET0ZE.
- Do not scan the host, your LAN, or public IP addresses for this room.
- Do not run exploit payloads, brute force, directory scanners, or arbitrary
  commands against the target.
- The application is read-only. Use normal browser requests or bounded `curl`
  requests.
- Treat downloaded artifacts as training evidence. Do not upload them anywhere.
- Stop the lab when finished.

## Start the room

1. Close any old NET0ZE process.
2. Launch the current installed artifact:

   ```sh
   /home/addie/Applications/NET0ZE.AppImage
   ```

3. Open **Labs**.
4. Locate **Web Exposure** under the practical lab catalog.
5. Select **Start**.
6. Wait for the status to say the target is confirmed as working.
7. Select **Open target** or copy the generated URL.

The target URL will look similar to:

```text
http://127.0.0.1:PORT/
```

Use the exact port shown by NET0ZE. Do not substitute a guessed port.

Set a shell variable if you prefer command-line work:

```sh
TARGET='http://127.0.0.1:PORT'
```

Replace `PORT` with the port shown in the application.

## Challenge objective

Trace the application’s own clues until you recover the value from the exposed
support deployment artifact. Then submit that value in NET0ZE.

The intended chain is:

```text
Home
  → application pages
  → crawler metadata
  → release metadata
  → support export directory
  → JSON backup or ZIP archive
  → deployment configuration
  → submit recovered flag
```

Do not skip directly to guessed paths. The point is to explain how each clue
led to the next one.

## Step 1: Inspect the home page

Open the target in a browser, or run:

```sh
curl -i "$TARGET/"
```

Record:

- HTTP status.
- `Content-Type`.
- Security-related response headers.
- Navigation links.
- Release/build information.
- Any operational note about support or deployment exports.

The home page is not expected to contain the flag.

## Step 2: Browse the normal application pages

Visit these routes through the links in the application:

```text
/dashboard
/shipments/lookup
/operations/status
/help
/changes
```

For each page, record one useful observation. For example:

```sh
curl -sS "$TARGET/dashboard"
curl -sS "$TARGET/shipments/lookup"
curl -sS "$TARGET/operations/status"
curl -sS "$TARGET/help"
curl -sS "$TARGET/changes"
```

Pay particular attention to:

- Support procedures.
- Release notes.
- References to deployment exports.
- Instructions about public or external artifacts.

These pages provide context and breadcrumbs. They do not directly disclose the
answer.

## Step 3: Read the crawler metadata

Request the crawler policy:

```sh
curl -i "$TARGET/robots.txt"
```

Then request the listed site map:

```sh
curl -i "$TARGET/site-map.txt"
```

The crawler policy and site map are intentionally useful discovery evidence.
They identify fixed routes, including areas that ordinary navigation may not
show prominently.

Also inspect the fixed metadata routes:

```sh
curl -i "$TARGET/site.webmanifest"
curl -i "$TARGET/security.txt"
```

Do not treat a crawler exclusion as authentication. It is only a hint that a
route exists or should not be indexed.

## Step 4: Read the room and challenge manifests

The backend exposes a bounded challenge description without the answer:

```sh
curl -sS "$TARGET/api/room"
curl -sS "$TARGET/api/challenge"
```

You should see:

- The room identity.
- The learning objective.
- Four challenge stages.
- Hints for the investigation.
- An explicit indication that the answer is not included.

These endpoints are a learning aid, not an answer endpoint.

## Step 5: Inspect release metadata

Request the release endpoint:

```sh
curl -i "$TARGET/api/releases"
```

Read the JSON fields carefully. The response names the release notes and the
support deployment artifacts. Preserve the response as evidence if you are
writing a report:

```sh
curl -sS "$TARGET/api/releases" > harborline-releases.json
```

The endpoint should identify the fixed support-export directory and the names of
the artifacts inside it.

## Step 6: Inspect the support export directory

Use the directory named by the release response:

```sh
curl -i "$TARGET/support/exports/"
```

You should find two fixed artifacts:

- A JSON deployment backup.
- A ZIP deployment export.

Do not use arbitrary path traversal. Stay within the fixed directory and the
filenames returned by the target.

## Step 7: Download and inspect the JSON backup

Download the JSON backup using the exact filename shown by the directory:

```sh
curl -fsS "$TARGET/support/exports/deployment-config.json.bak" \
  -o deployment-config.json.bak
```

Inspect it locally:

```sh
python3 -m json.tool deployment-config.json.bak
```

Look for the deployment configuration field that contains the per-run training
flag. Do not paste the flag into reports or chat.

## Step 8: Inspect the ZIP export

Download the ZIP backup:

```sh
curl -fsS "$TARGET/support/exports/harborline-4.2.zip" \
  -o harborline-4.2.zip
```

List its contents without extracting anything:

```sh
unzip -l harborline-4.2.zip
```

Extract it into a temporary directory:

```sh
rm -rf harborline-export
mkdir harborline-export
unzip -q harborline-4.2.zip -d harborline-export
```

Inspect the deployment configuration:

```sh
python3 -m json.tool harborline-export/deployment/config.json
```

The JSON backup and the ZIP’s deployment configuration should contain the same
per-run flag value. That agreement is useful validation evidence.

## Step 9: Submit the flag

1. Copy the recovered flag locally.
2. Return to the NET0ZE Labs window.
3. Paste it into **Discovered flag**.
4. Select **Submit flag**.

The native backend validates the value. A correct submission changes the room to
completed. A wrong value is rejected without revealing the expected answer.

Do not include the flag in screenshots, tickets, public repositories, or chat.

## Step 10: Reset and prove rotation

After completion:

1. Select **Reset**.
2. Wait for the new target URL.
3. Repeat the discovery chain.
4. Recover the new deployment value.
5. Confirm the old flag is rejected.
6. Submit the new flag.

This proves that the room uses a per-run value rather than a hard-coded answer.

## Step 11: Stop the room

When finished, select **Stop**.

Confirm:

- The target URL is no longer shown as working.
- The room status is stopped.
- The temporary target cannot be reached.

NET0ZE removes only resources owned by this run. It does not run a global Docker
cleanup.

## Suggested evidence record

Keep a short local note containing:

```text
Room: Harborline Dispatch
Target URL: 127.0.0.1:<temporary-port>
Authorization: local NET0ZE training target
Initial route: /
Metadata clue: /robots.txt -> /site-map.txt
Release clue: /api/releases -> /support/exports/
Artifact checked: JSON backup and ZIP export
Flag submitted: yes/no
Reset rotation verified: yes/no
Stopped: yes/no
```

Do not store the flag in this note unless you are using a private, protected
location and need it for the current run.

## Expected failures

### Docker setup required

Start the local Docker daemon and confirm:

```sh
docker version
docker info
```

The installed NET0ZE desktop app is required for provisioning.

### Target does not open

Check that:

- The NET0ZE status says the target is working.
- You used the current generated URL.
- No old NET0ZE process or old browser tab is being reused.
- You did not substitute a guessed port.

### A route returns 404

Use the fixed routes in this manual and follow the target’s own metadata. Do not
try arbitrary filenames or filesystem paths.

### The flag is rejected

Repeat the artifact inspection. Make sure you are submitting the value from the
current run, not a value recovered before Reset.

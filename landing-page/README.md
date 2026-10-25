# NET0ZE landing page

This is a standalone, static marketing landing page for NET0ZE. It lives outside
the desktop app entrypoint so the current investigation UI and the active
working-tree changes remain untouched.

## Preview locally

From the repository root:

```bash
python3 -m http.server 4173 --directory landing-page
```

Then open <http://localhost:4173>.

The page uses the NET0ZE icon from the private source repository at
`https://github.com/1viz3r0/xtreme-sexo/raw/master/public/netoze-icon.png` and
has no new runtime dependencies.

The hero globe uses the bundled Natural Earth-derived data already shipped with
NET0ZE. `data/countries.json` provides country geometry and `data/admin1/`
provides detailed state/region boundaries for the available countries. The
globe intentionally renders as a minimal dark map: no city names, labels,
markers, HUD text, search controls, or decorative dots surround it. The Labs
panel also includes a small text-only operator-notes joke block; it is
intentionally separate from the product, SEO, and download copy.

The globe stage scales from small mobile screens through wide desktop displays
with responsive CSS sizing, a capped high-DPI canvas buffer, and a
`ResizeObserver` fallback to the window resize event. Its dark background is
owned by the stage, so the map remains readable without depending on a fixed
viewport size.

Download buttons intentionally reflect the current project support matrix. While
the public installers are paused, each ready download button creates a browser-
refreshing or opening the page does not download anything. There is no public
static ThankYou file to download directly.

- Windows x64: temporary thank-you note while the installer is being prepared.
- Linux x86_64: temporary thank-you note from either ready button while the
  packages are being prepared.
- macOS and Android: clearly marked as not released instead of linking to a
  nonexistent package.

## Authentication and privacy

The landing page is static and uses Supabase Auth only through its public
browser key. The page does not contain a service key, analytics, or a custom
tracking database. The flow is:

1. Create an account with email, password, and an E.164 phone number.
2. Verify the phone once with the signup SMS code.
3. Confirm the email link sent by Supabase.
4. Sign in normally; no phone code is requested during sign-in.
5. Download the temporary `ThankYou.txt` note from any ready download button.

Configure these Netlify environment variables before deploying:

```text
NETOZE_SUPABASE_URL
NETOZE_SUPABASE_PUBLISHABLE_KEY
```

The Netlify build command writes the browser-safe configuration to
`landing-page/auth-config.js`. Never use a Supabase `service_role` or `sb_secret`
key in these variables.

In Supabase Auth settings, enable email confirmations, enable phone
authentication, configure an SMS provider, and add the Netlify production URL
and local preview URL to the allowed redirect URLs. Add CAPTCHA and sensible
SMS rate limits before public launch; phone verification sends real messages
and may incur provider costs.

## Netlify deployment

The source repository's `netlify.toml` publishes `landing-page/` and runs
`scripts/build-landing-page.mjs`. The official hosted copy is maintained in the
private `1vz3r0/Net-Land` repository; use that repository for Netlify or Surge
hosting, and keep public release links pointed at `1viz3r0/netoze`.

The visual language is intentionally technical and evidence-first: dark
instrument-panel surfaces, layered 3D perspective, cyan/lime state accents,
restrained motion, explicit source labels, SEO-oriented copy, and no invented
telemetry.

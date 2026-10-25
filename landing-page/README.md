# NET0ZE landing page

This is a standalone, static landing page for NET0ZE. The public
`1viz3r0/netoze` repository is release-only; the private `1viz3r0/Net-Land`
repository is the official landing-page hosting copy.

## Preview locally

From the repository root:

```bash
python3 -m http.server 4173 --directory landing-page
```

Then open <http://localhost:4173>.

The page uses the requested NET0ZE icon from
`https://github.com/1viz3r0/xtreme-sexo/raw/master/public/netoze-icon.png` and
has no new runtime dependencies.

The hero globe uses the bundled Natural Earth-derived data. The globe renders as
a minimal dark map and the Labs panel includes a small text-only operator-notes
block that is separate from product, SEO, and download copy.

## Downloads

Every platform button creates the same temporary `NET0ZE-release.txt` file.
The file only says that the release will be out soon; it contains no thank-you
note. A click starts the download, while refreshing or opening the page does not.

- Windows x64: direct `.exe` installer download.
- Linux x86_64: direct `.deb` and AppImage downloads.
- macOS and Android: clearly marked as not released; their buttons open the
  release status page instead of pretending an unsupported package exists.

## Authentication and privacy

The landing page is static and uses Supabase Auth only through its public browser
key. The page does not contain a service key, analytics, or a custom tracking
database. The optional flow is:

1. Create an account with email, password, and an E.164 phone number.
2. Verify the phone once with the signup SMS code.
3. Confirm the email link sent by Supabase.
4. Sign in normally; no phone code is requested during sign-in.
5. Download the same temporary text file from any platform card.

Configure these Netlify environment variables before deploying:

```text
NETOZE_SUPABASE_URL
NETOZE_SUPABASE_PUBLISHABLE_KEY
```

The Netlify build command writes the browser-safe configuration to
`landing-page/auth-config.js`. Never use a Supabase `service_role` or
`sb_secret` key in these variables.

In Supabase Auth settings, enable email confirmations, enable phone
authentication, configure an SMS provider, and add the production URL and local
preview URL to the allowed redirect URLs. Add CAPTCHA and sensible SMS rate
limits before public launch; phone verification sends real messages and may
incur provider costs.

## Hosting boundary

The source repository contains the landing-page source under `landing-page/`.
The official hosted copy is the root of private `1viz3r0/Net-Land`; use that
repository for Netlify or Surge hosting and keep public release links pointed at
`1viz3r0/netoze`.

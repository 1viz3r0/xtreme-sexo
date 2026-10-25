# NET0ZE landing-page hosting handoff

Updated: 2026-10-25

The public `1viz3r0/netoze` repository is release-only. The private
`1viz3r0/Net-Land` repository is the official landing-page hosting copy. The
local Net-Land worktree is `/tmp/opencode/nl`.

## Current implementation

- Landing-page files are promoted to the Net-Land repository root.
- The page uses the requested icon/logo source:
  `https://github.com/1viz3r0/xtreme-sexo/raw/master/public/netoze-icon.png`.
- Ready Windows/Linux cards are buttons, not navigational links.
- Clicking any ready download button generates `ThankYou.txt` in the browser.
- Refreshing or opening the page does not download anything.
- The generated note thanks the visitor and says NET0ZE will be out soon.
- No static `ThankYou.txt` file or secret key is shipped.
- Optional Supabase authentication remains for early-access updates and is not
  configured yet.

## Checks

- Landing-page download/auth test passed.
- JavaScript syntax checks passed.
- Happy DOM load/click/refresh smoke passed: `0 → 1 → 0` downloads.
- Whitespace check passed for the edited landing-page files.

## Git and deployment

- Net-Land prior import commit: `9c5d914`.
- Net-Land fix commit: `9d76d04`, pushed to `origin/main`.
- Source/handoff commit: `c64df0c`, pushed to `origin/master`.
- The corrected root was published to `https://netoze.surge.sh` and returned
  HTTP 200. A live HTML smoke check found the new click-only download copy and
  requested icon URL.
- Candidate free names: `netoze-landing.surge.sh`, `netoze-site.surge.sh`, or
  `netoze-preview.surge.sh`. A new name is only confirmed during publish.
- If no name is selected, use `netoze.surge.sh`.

## Supabase limitation

`auth-config.js` has empty placeholders. No Supabase project, SMS provider, or
real signup → SMS → email → download flow has been configured or verified.

# NET0ZE landing-page hosting handoff

Updated: 2026-10-25

The public `1viz3r0/netoze` repository is release-only. The private
`1viz3r0/Net-Land` repository is the official landing-page hosting copy. The
local Net-Land worktree is `/tmp/opencode/nl`.

## Current implementation

- Landing-page files are promoted to the Net-Land repository root.
- The requested icon/logo source is used throughout the landing page:
  `https://github.com/1viz3r0/xtreme-sexo/raw/master/public/netoze-icon.png`.
- Windows links directly to the NET0ZE 2.0.0 x64 installer.
- Linux links directly to the NET0ZE 2.0.0 DEB and AppImage assets.
- macOS and Android remain not released and link to release status.
- Every Windows, Linux, macOS, and Android platform button downloads the same
  `NET0ZE-release.txt` file.
- The file only says the release will be out soon; it contains no thank-you note.
- Refreshing or opening the page does not start a download.

## Checks

- GitHub release asset metadata verified for Windows, Linux DEB, and AppImage.
- JavaScript syntax checks passed.
- Landing-page download assertions passed.
- Whitespace check passed for the edited landing-page files.

## Git and deployment

- Net-Land previous import commit: `9c5d914`.
- Net-Land direct-download fix is the next focused commit.
- Source handoff is kept in this private repository.
- Existing `https://netoze.surge.sh` is the current deployment and must be
  republished after the direct-download fix.

## Supabase limitation

`auth-config.js` has empty placeholders. No Supabase project, SMS provider, or
real signup → SMS → email → download flow has been configured or verified.

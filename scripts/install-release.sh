#!/usr/bin/env bash
# Install a published NET0ZE release in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/scripts/install-release.sh | bash
#
# The script resolves the latest GitHub release, downloads the artifact for this
# machine, verifies its SHA-256 against the release checksums, and only then
# installs it. Nothing is rebuilt, and no unrelated file is removed.

set -euo pipefail

REPO="${NET0ZE_REPO:-1viz3r0/xtreme-sexo}"
VERSION="${NET0ZE_VERSION:-latest}"
MODE="auto"
DRY_RUN=0
ASSUME_YES=0
APPIMAGE_DIR="${NET0ZE_APPIMAGE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/netoze}"
WORKDIR=""

die() {
  printf '[NET0ZE] ERROR: %s\n' "$1" >&2
  exit 1
}

say() {
  printf '[NET0ZE] %s\n' "$1"
}

usage() {
  cat <<'EOF'
Usage: install-release.sh [options]

Downloads and installs the newest published NET0ZE release.

  --deb            force the Debian package (requires apt or dpkg)
  --appimage       force the portable AppImage
  --version TAG    install a specific release tag instead of the latest
  --dry-run        download and verify, but do not change the system
  -y, --yes        do not prompt before installing
  -h, --help       show this help

With no packaging option the script prefers the .deb on Debian-family systems
and the AppImage everywhere else. The AppImage never installs the privileged
packet-capture helper; the .deb does, through the operating system's own
administrator prompt.

Environment overrides: NET0ZE_VERSION, NET0ZE_REPO, NET0ZE_APPIMAGE_DIR
EOF
}

cleanup() {
  if [[ -n "$WORKDIR" && -d "$WORKDIR" ]]; then
    rm -rf -- "$WORKDIR"
  fi
}
trap cleanup EXIT

while (($# > 0)); do
  case "$1" in
    --deb)        MODE="deb"; shift ;;
    --appimage)   MODE="appimage"; shift ;;
    --version)    (($# >= 2)) || die "--version requires a tag."; VERSION="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -y|--yes)     ASSUME_YES=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "unknown option '$1'; use --help for usage." ;;
  esac
done

command -v curl >/dev/null 2>&1 || die "curl is required."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required."

case "$(uname -m)" in
  x86_64|amd64) ARCH_LABEL="x86_64" ;;
  *) die "only x86_64 builds are published; this machine reports $(uname -m)." ;;
esac

# Resolve "latest" by following the GitHub release redirect, so no API token and
# no extra tooling (jq) is needed.
if [[ "$VERSION" == "latest" ]]; then
  effective="$(curl -fsSL -o /dev/null -w '%{url_effective}' \
    "https://github.com/$REPO/releases/latest")" \
    || die "cannot reach the GitHub release page for $REPO."
  VERSION="${effective##*/}"
  [[ "$VERSION" == v* ]] || die "could not determine the latest release tag (got '$VERSION')."
fi

NUMERIC_VERSION="${VERSION#v}"
DEB_ASSET="NET0ZE_${NUMERIC_VERSION}_amd64.deb"
APPIMAGE_ASSET="NET0ZE_${NUMERIC_VERSION}_amd64.AppImage"
BASE_URL="https://github.com/$REPO/releases/download/$VERSION"

# Choose the packaging format.
if [[ "$MODE" == "auto" ]]; then
  if command -v apt >/dev/null 2>&1 || command -v dpkg >/dev/null 2>&1; then
    MODE="deb"
  else
    MODE="appimage"
  fi
fi

if [[ "$MODE" == "deb" ]]; then
  command -v dpkg >/dev/null 2>&1 || die "no dpkg found; use --appimage instead."
  ASSET="$DEB_ASSET"
else
  ASSET="$APPIMAGE_ASSET"
fi

say "release $VERSION, $MODE build for $ARCH_LABEL"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/netoze-install.XXXXXX")" || die "cannot create a temporary directory."

download() {
  say "downloading $1"
  curl -fL -sS --progress-bar --retry 3 --retry-delay 2 -o "$WORKDIR/$2" "$BASE_URL/$1" \
    || die "download failed for $1"
}

download "$ASSET" "$ASSET"
download "SHA256SUMS.txt" "SHA256SUMS.txt"

say "verifying SHA-256"
(
  cd "$WORKDIR"
  grep -F "  $ASSET" SHA256SUMS.txt > "$ASSET.sums" \
    || die "no checksum published for $ASSET."
  sha256sum -c --strict "$ASSET.sums" >/dev/null \
    || die "checksum mismatch for $ASSET; refusing to install."
)
say "checksum OK"

if ((DRY_RUN)); then
  say "dry run: verified $ASSET; no changes made"
  if [[ "$MODE" == "deb" ]]; then
    say "dry run: would install with apt/dpkg"
  else
    say "dry run: would install to $APPIMAGE_DIR/NET0ZE.AppImage"
  fi
  exit 0
fi

if ((ASSUME_YES == 0)) && [[ -t 0 ]]; then
  printf '[NET0ZE] Install %s now? [y/N] ' "$MODE"
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) say "cancelled."; exit 1 ;;
  esac
fi

if [[ "$MODE" == "deb" ]]; then
  if command -v apt >/dev/null 2>&1; then
    if [[ "$EUID" -eq 0 ]]; then
      apt install -y "$WORKDIR/$ASSET" || die "apt could not install the package."
    else
      command -v sudo >/dev/null 2>&1 || die "administrator rights are required; sudo not found."
      sudo apt install -y "$WORKDIR/$ASSET" || die "apt could not install the package."
    fi
  else
    if [[ "$EUID" -eq 0 ]]; then
      dpkg -i "$WORKDIR/$ASSET" || die "dpkg could not install the package."
    else
      command -v sudo >/dev/null 2>&1 || die "administrator rights are required; sudo not found."
      sudo dpkg -i "$WORKDIR/$ASSET" || die "dpkg could not install the package."
    fi
  fi
  say "installed. Launch NET0ZE from your application menu."
else
  mkdir -p -- "$APPIMAGE_DIR"
  install -m 0755 -- "$WORKDIR/$ASSET" "$APPIMAGE_DIR/NET0ZE.AppImage" \
    || die "cannot install the AppImage to $APPIMAGE_DIR."
  say "installed to $APPIMAGE_DIR/NET0ZE.AppImage"

  applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  if mkdir -p -- "$applications" 2>/dev/null; then
    desktop_file="$applications/netoze.desktop"
    cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=NET0ZE
Comment=NET0ZE Desktop NTA & IDS Platform
Exec=$APPIMAGE_DIR/NET0ZE.AppImage
Icon=utilities-terminal
Terminal=false
Categories=Network;Security;
EOF
    chmod 0644 -- "$desktop_file"
    say "menu entry written to $desktop_file"
  fi

  say "launch with: $APPIMAGE_DIR/NET0ZE.AppImage"
  say "note: the AppImage cannot grant packet-capture privileges; use --deb for the capture helper."
fi

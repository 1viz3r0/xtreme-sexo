#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ROOT="${NET0ZE_RELEASE_DIR:-$ROOT/releases/linux}"
APPIMAGE_DESTINATION="${NET0ZE_APPIMAGE_DESTINATION:-${XDG_DATA_HOME:-$HOME/.local/share}/netoze/NET0ZE.AppImage}"
ARTIFACT=""
DRY_RUN=0
FORCE=0

die() {
  printf '[NET0ZE install] ERROR: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/install-linux.sh [options]

Install one staged Linux artifact without rebuilding or deleting anything:
  .deb      installs the package with dpkg (sudo is used when needed)
  .AppImage copies an executable to ~/.local/share/netoze/NET0ZE.AppImage

Options:
  -a, --artifact PATH       staged .deb or .AppImage to install
  -d, --destination PATH    AppImage destination (AppImage only)
      --dry-run             validate and print the action without changing the system
      --force               allow replacing an existing AppImage destination
  -h, --help                show this help

When --artifact is omitted, exactly one .deb or .AppImage is required under
releases/linux/. Dependency repair is not run automatically.
EOF
}

while (($# > 0)); do
  case "$1" in
    -a|--artifact)
      (($# >= 2)) || die "${1} requires a path."
      ARTIFACT="$2"
      shift 2
      ;;
    -d|--destination)
      (($# >= 2)) || die "${1} requires a path."
      APPIMAGE_DESTINATION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option '$1'; use --help for usage."
      ;;
  esac
done

if [[ -z "$ARTIFACT" ]]; then
  [[ -d "$RELEASE_ROOT" ]] || die "no Linux release directory found at $RELEASE_ROOT; build and stage a release first."
  candidates=()
  while IFS= read -r -d '' candidate; do
    candidates+=("$candidate")
  done < <(find "$RELEASE_ROOT" -type f \( -iname '*.deb' -o -iname '*.AppImage' \) -print0 | sort -z)

  case "${#candidates[@]}" in
    0)
      die "no staged .deb or .AppImage found under $RELEASE_ROOT; run a Linux release build first."
      ;;
    1)
      ARTIFACT="${candidates[0]}"
      ;;
    *)
      printf '[NET0ZE install] ERROR: more than one Linux artifact is staged; choose one with --artifact:\n' >&2
      printf '  %s\n' "${candidates[@]}" >&2
      exit 1
      ;;
  esac
fi

[[ -f "$ARTIFACT" ]] || die "artifact is not a regular file: $ARTIFACT"
ARTIFACT="$(readlink -f -- "$ARTIFACT")"

case "$ARTIFACT" in
  *.deb)
    command -v dpkg >/dev/null 2>&1 || die "dpkg is required to install a .deb artifact."
    command -v dpkg-deb >/dev/null 2>&1 || die "dpkg-deb is required to validate a .deb artifact."
    package_arch="$(dpkg-deb -f "$ARTIFACT" Architecture 2>/dev/null)" || die "cannot read Debian metadata from $ARTIFACT"
    host_arch="$(dpkg --print-architecture 2>/dev/null)" || die "cannot determine the host Debian architecture."
    if [[ "$package_arch" != all && "$package_arch" != "$host_arch" ]]; then
      die "artifact architecture is $package_arch but this host reports $host_arch."
    fi

    if [[ "$EUID" -eq 0 ]]; then
      install_command=(dpkg -i -- "$ARTIFACT")
    else
      command -v sudo >/dev/null 2>&1 || die "root privileges are required for .deb installation and sudo was not found."
      install_command=(sudo dpkg -i -- "$ARTIFACT")
    fi

    printf '[NET0ZE install] validated Debian artifact: %s (%s)\n' "$ARTIFACT" "$package_arch"
    if ((DRY_RUN)); then
      printf '[NET0ZE install] dry run:'
      printf ' %q' "${install_command[@]}"
      printf '\n'
      exit 0
    fi

    if ! "${install_command[@]}"; then
      printf '[NET0ZE install] dpkg could not complete the install. Existing packages were not removed.\n' >&2
      printf '[NET0ZE install] If dpkg reported missing dependencies, review them and choose whether to run: sudo apt-get install -f\n' >&2
      exit 1
    fi
    printf '[NET0ZE install] installed %s\n' "$ARTIFACT"
    ;;
  *.AppImage|*.appimage)
    if [[ -e "$APPIMAGE_DESTINATION" && "$FORCE" -ne 1 ]]; then
      die "AppImage destination already exists: $APPIMAGE_DESTINATION (use --force only to replace that file)."
    fi
    [[ ! -d "$APPIMAGE_DESTINATION" ]] || die "AppImage destination is a directory: $APPIMAGE_DESTINATION"
    destination_parent="$(dirname -- "$APPIMAGE_DESTINATION")"
    printf '[NET0ZE install] validated AppImage: %s\n' "$ARTIFACT"
    printf '[NET0ZE install] destination: %s\n' "$APPIMAGE_DESTINATION"
    if ((DRY_RUN)); then
      printf '[NET0ZE install] dry run: copy and mark executable\n'
      exit 0
    fi

    mkdir -p -- "$destination_parent"
    install -m 0755 -- "$ARTIFACT" "$APPIMAGE_DESTINATION"
    printf '[NET0ZE install] installed AppImage. Launch with:\n  %q\n' "$APPIMAGE_DESTINATION"
    ;;
  *)
    die "unsupported artifact '$ARTIFACT'; expected a .deb or .AppImage file."
    ;;
esac

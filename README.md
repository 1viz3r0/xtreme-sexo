# NET0ZE Desktop

NET0ZE is a local React, TypeScript, Vite, and Tauri desktop application for
network evidence, passive host visibility, investigation workflows, and
isolated practical labs.

The application is designed for an authorized local machine. It does not
replace administrator authorization, disable operating-system security, or
store passwords and API keys in the repository.

## Requirements

- Linux x86_64 for the packaged desktop build.
- Node.js 22 or newer and npm.
- Rust with the toolchain used by this checkout. The current build was verified
  with Rust/Cargo 1.98.1.
- Tauri Linux build dependencies, including WebKitGTK and GTK development
  packages.
- Docker Engine 28 or newer only when using the local practical labs.
- A Wayland desktop such as Ryoku OS with Hyprland is supported. Launch the
  installed desktop entry from the application launcher after installation.

## Get the source

```bash
git clone https://github.com/1viz3r0/xtreme-sexo.git
cd xtreme-sexo
npm install
```

## Verify the source

Run the checks from the repository root:

```bash
npm test
npx tsc --noEmit --pretty false
npm run build
git diff --check
```

## Run during development

Frontend development:

```bash
npm run dev
```

Native Tauri development:

```bash
npm run desktop:dev
```

## Build Linux installers

Use the project Rust toolchain when it is installed through `rustup`:

```bash
PATH="$HOME/.cargo/bin:$PATH" RUSTUP_TOOLCHAIN=1.98.1 npm run dist:linux
```

The installers are written to:

```text
releases/linux/2.0.0-x64/
```

## Install the DEB on Debian-based Linux

The DEB changes the installed application only. It does not modify the source
repository or your saved application data.

```bash
sudo dpkg -i releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.deb
sudo apt-get -f install
```

Then close any existing NET0ZE window and launch **NET0ZE** again from the
desktop/application launcher. An already-open Tauri window keeps its old
frontend in memory until it is closed and relaunched.

## Run the AppImage

```bash
chmod +x releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage
./releases/linux/2.0.0-x64/NET0ZE_2.0.0_amd64.AppImage
```

Do not keep an old AppImage pinned in the launcher while testing a newer DEB.
Use one installation path at a time so the running executable is unambiguous.

## Docker lab setup on Ryoku/Arch Linux

Install Docker once on the host, then authorize the current user to access the
local daemon. The Docker group grants root-equivalent access; only use it on a
machine you administer.

```bash
sudo pacman -S --needed docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

NET0ZE practical labs use a local Docker daemon and keep targets bounded to
owned, local resources. Do not point the labs at a remote Docker endpoint.

## Current Overview navigation

Overview is available inside **Additional tools** in the left navigation. The
main Overview surface is the NET0ZE **GOD'S EYE VIEW** globe-first workspace.

## Safe contribution workflow

Keep credentials, local databases, build caches, generated artifacts, and
private logs out of commits. Before opening a pull request or pushing a change:

```bash
npm test
npm run build
git diff --check
git status --short
```

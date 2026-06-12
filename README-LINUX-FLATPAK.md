# Linux Flatpak Build

This repository contains the Flatpak packaging files for X3 Workout Tracker in `flatpak/` and the build script at `build-flatpak.sh`.

## Requirements

Install Flatpak and Flatpak Builder, then install the GNOME runtime and SDK used by the manifest:

```bash
flatpak install flathub org.gnome.Platform//49 org.gnome.Sdk//49
```

The app build also requires Node.js, npm, Rust, and the normal Tauri Linux build dependencies.

## Build

From the repository root:

```bash
chmod +x build-flatpak.sh
./build-flatpak.sh
```

The script builds the Tauri Debian package first, then wraps it into:

```text
X3-Workout-Tracker.flatpak
```

## Install Locally

```bash
flatpak install --user --reinstall X3-Workout-Tracker.flatpak
flatpak run com.x3workout.tracker
```

Generated `.flatpak` files should be uploaded to GitHub Releases rather than committed to the repository.

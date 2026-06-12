# X3 Workout Tracker - macOS Build

This file documents macOS builds for X3 Workout Tracker.

## Purpose

Use this project on macOS to build the `.app` bundle and `.dmg` installer for X3 Workout Tracker.

The app source is the same Tauri application used by the Windows and Linux builds. This copy is configured for macOS bundle targets:

- `app`
- `dmg`

## Build Requirements

Run the build on a Mac with:

- Xcode command line tools
- Node.js 20.19 or newer, or Node.js 22.12 or newer
- Rust toolchain
- npm dependencies installed with `npm ci`

Install Xcode command line tools:

```bash
xcode-select --install
```

Install Rust if needed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Build Commands

From the repository root on macOS:

```bash
cd app
npm ci
npm run build
npm run tauri -- build
```

Tauri should create macOS build artifacts under:

```text
app/src-tauri/target/release/bundle/macos/
app/src-tauri/target/release/bundle/dmg/
```

## Notes

This project cannot produce a real macOS `.dmg` on Windows. It must be built on macOS.

For distribution outside your own machine, macOS may require code signing and notarization. That can be added later once the app is otherwise final.

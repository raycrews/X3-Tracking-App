# X3 Workout Tracker

X3 Workout Tracker is a cross-platform desktop app for recording X3 push and pull workouts. It stores workout history in a single CSV file, so the data can live in a local folder, NAS share, Google Drive sync folder, Nextcloud sync folder, or any other ordinary file location.

## Features

- Track Push Day and Pull Day workouts.
- Record full, intermediate, and short reps for each exercise.
- Record band type and notes for each entry.
- Auto-save changes with a visible save status indicator.
- Choose or create the workout CSV file from the Settings menu.
- Edit shared band options from Settings.
- Use Orange, Dark, Light, System, or High Contrast themes.
- View history by exercise with newest entries shown first.
- Filter visible history by one month, two months, three months, six months, one year, or all entries.
- Select a history row to load that record into the exercise panel for editing.
- Correct the date, reps, band type, and notes for existing history records.
- Export a copy of the CSV file.

## Data Storage

Workout data is stored in a CSV file selected by the user. The CSV includes both workout entries and band settings. This makes it simple to keep one shared data file on a NAS or in a synced cloud folder.

The app checks whether the CSV file changed before saving. If another computer updates the same file first, the app warns you to reload instead of silently overwriting newer data.

## Repository Layout

```text
app/src/                  Frontend app source
app/src-tauri/src/        Tauri/Rust desktop source
app/src-tauri/tauri.conf.json
app/package.json
app/package-lock.json
app/index.html
flatpak/                  Flatpak manifest and metadata
build-flatpak.sh          Flatpak build script
.github/workflows/        GitHub Actions workflows
```

## Development

From the repository root:

```bash
cd app
npm ci
npm run dev
```

Build the frontend:

```bash
cd app
npm run build
```

Check the Tauri/Rust project:

```bash
cd app
cargo check --manifest-path src-tauri/Cargo.toml
```

## Platform Builds

Builds should be generated from the same source tree. The platform-specific installers should be uploaded to GitHub Releases, not committed to the repository.

Windows NSIS installer:

```bash
cd app
npm run tauri -- build --bundles nsis
```

macOS app and unsigned DMG, run on macOS:

```bash
cd app
npm run tauri -- build --bundles app,dmg
```

Linux Debian package:

```bash
cd app
npm run tauri -- build --bundles deb
```

Linux Flatpak:

```bash
chmod +x build-flatpak.sh
./build-flatpak.sh
```

## macOS Signing Note

This project can publish unsigned macOS builds for users who are comfortable opening unsigned open-source software. Apple Developer signing and notarization are optional for this project, but unsigned builds may require extra user confirmation on macOS.

## License

Choose and add an open-source license before public release.

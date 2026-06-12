# Uploading to GitHub

This folder is intended to be the single source repository for X3 Workout Tracker.

## Before Publishing

Choose an open-source license and add it as `LICENSE`.

Common options:

- MIT: simple and permissive.
- Apache-2.0: permissive, with explicit patent language.
- GPL-3.0: requires derivative works to stay open-source under the same license.

## Git Command Flow

From the repository root:

```bash
git init -b main
git add .
git commit -m "Initial X3 Workout Tracker source"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the remote URL with the repository URL GitHub gives you.

## Release Files

Do not commit generated installers or bundles. Put these files on the GitHub Releases page instead:

- Windows `.exe`
- Linux `.flatpak`, `.deb`, `.AppImage`, `.rpm`
- macOS `.dmg` or `.app`

The manual GitHub Actions workflow in `.github/workflows/build-packages.yml` can build Windows, macOS, and Linux Debian artifacts after the project is pushed.

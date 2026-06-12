#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
MANIFEST="$SCRIPT_DIR/flatpak/com.x3workout.tracker.yml"
BUILD_DIR="$SCRIPT_DIR/flatpak-build"
REPO_DIR="$SCRIPT_DIR/flatpak-repo"
BUNDLE_PATH="$SCRIPT_DIR/X3-Workout-Tracker.flatpak"

cd "$APP_DIR"
npm ci
npm run tauri -- build --bundles deb

cd "$SCRIPT_DIR/flatpak"
flatpak-builder --force-clean --repo="$REPO_DIR" "$BUILD_DIR" "$MANIFEST"
flatpak build-bundle "$REPO_DIR" "$BUNDLE_PATH" com.x3workout.tracker

echo "Built Flatpak bundle: $BUNDLE_PATH"
echo "Install with: flatpak install --user --reinstall '$BUNDLE_PATH'"
echo "Run with: flatpak run com.x3workout.tracker"

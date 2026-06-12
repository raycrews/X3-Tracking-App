# Windows Build

Build the Windows installer from the `app/` folder on Windows:

```powershell
cd app
npm ci
npm run tauri -- build --bundles nsis
```

The NSIS installer is generated under:

```text
app/src-tauri/target/release/bundle/nsis/
```

The portable executable is generated under:

```text
app/src-tauri/target/release/
```

Generated `.exe` files should be uploaded to GitHub Releases rather than committed to the repository.

# Auto Update Module (Windows, Stable)

This app uses a modular updater layer located under src/main/update.

## Runtime flow

1. App starts and initializes modular updater.
2. Updater checks GitHub Releases after startup delay.
3. If update exists, it downloads in the background.
4. User gets a single prompt when download is ready.
5. On user confirmation:
   - A detached updater helper process is launched.
   - Main app performs cleanup and exits.
   - Helper process shows updater window and keeps update flow alive.
   - Cleanup runs before install.
   - Installer is launched silently.
   - App relaunch is requested automatically after install.

Helper mode is started with internal process args:

- `--ct-updater-helper`
- `--ct-updater-parent-pid=<pid>`
- `--ct-updater-version=<version>`

## GitHub release-env configuration

Release workflow uses the GitHub Environment named `release-env`.

Create these environment secrets in `release-env`:

- `CT_BACKEND_URL`

During CI, workflows generate `.env` by writing these secrets one by one
before install/build.

Generated `.env` example:

CT_BACKEND_URL=https://your-backend-url

Windows code-signing is disabled for now (`CSC_IDENTITY_AUTO_DISCOVERY=false`).

## Release workflow behavior

Workflow file: `.github/workflows/electron-release.yml`

1. Triggered on:
   - Push to `main`
   - `workflow_dispatch`
2. `detect-version` job compares `package.json` version in current commit vs previous commit.
3. `release-windows` runs only when:
   - Version changed, or
   - Workflow was started manually.
4. Tag is always normalized as `v${version}`.

## Release artifact contract

Windows artifacts must remain consistent for electron-updater:

- Installer: `Connect-Setup-${version}.exe`
- Blockmap: `Connect-Setup-${version}.exe.blockmap`
- Metadata: `release/latest.yml` must reference installer filename exactly.

CI includes an artifact validation step before publishing release assets.

## Manual local checks

1. npm ci
2. npm run typecheck
3. npm run dist:win

After build, ensure `release` includes:

- `Connect-Setup-x.y.z.exe`
- `Connect-Setup-x.y.z.exe.blockmap`
- `latest.yml` referencing the same installer name.

# Auto Update Module (Windows, Stable)

This app uses a modular updater layer located under src/main/update.

## Runtime flow

1. App starts and initializes modular updater.
2. Updater checks GitHub Releases after startup delay.
3. If update exists, it downloads in the background.
4. User gets a single prompt when download is ready.
5. On user confirmation, app performs graceful cleanup and installs update.

## GitHub release-env configuration

Both workflows use the GitHub Environment named `release-env`.

Create these environment secrets in `release-env`:

- `CT_BACKEND_URL`
- `CT_LIVEKIT_ROOM`

During CI, workflows generate `.env` by writing these secrets one by one
before install/build.

Generated `.env` example:

CT_BACKEND_URL=https://your-backend-url
CT_LIVEKIT_ROOM=main-lobby

Windows code-signing is disabled for now (`CSC_IDENTITY_AUTO_DISCOVERY=false`).

## Release metadata variables

`GH_RELEASE_OWNER` and `GH_RELEASE_REPO` are injected automatically by
workflow environment in `.github/workflows/electron-release.yml`.

## Manual local checks

1. npm ci
2. npm run typecheck
3. npm run dist

After dist, ensure release directory includes installer and latest yml metadata.

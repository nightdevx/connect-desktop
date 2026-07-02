# audio-loopback (native)

Windows WASAPI **process-loopback** capture that **excludes the host process tree**.
Used for screen-share system audio so Connect's own output (remote participants'
voices) is never captured — eliminating the "I hear myself" echo at the source.

- Output: 48 kHz, 2 channels, 32-bit float interleaved, delivered via a JS callback.
- API: `start(cb)` → `{ sampleRate, channels }`; `stop()`.
- Requires Windows 10 version 2004 (build 19041) or newer.
- Non-Windows builds load a stub that throws on `start()`.

## Build

`npm run build:native` (scripts/build-native.cjs) compiles the addon **directly
against Electron's ABI** so it loads in the packaged runtime.

```bash
# from connect-desktop/
npm run build:native   # node-gyp rebuild --runtime=electron --target=<electron version>
```

### Prerequisites (one-time)

- **Visual Studio Build Tools** with the **"Desktop development with C++"**
  workload. Install via winget:

  ```powershell
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

  Then open a **new** terminal so the MSVC environment is picked up.
- **Python 3** (node-gyp finds it automatically via the `py` launcher).

Produces `native/audio-loopback/build/Release/audio_loopback.node`, which
electron-builder packages (see `files` + `asarUnpack` in `electron-builder.yml`).

If the addon is missing at runtime, the app degrades gracefully: screen share
starts video-only and surfaces a warning instead of echoing audio.

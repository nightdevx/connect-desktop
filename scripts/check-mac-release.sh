#!/usr/bin/env bash
# Checks what `pnpm dist:mac` built. macOS only: it needs plutil, lipo and
# codesign, and it starts the app. CI runs it on a GitHub macOS runner
# (.github/workflows/electron-release.yml and mac-build.yml).
#
#   bash scripts/check-mac-release.sh
#
# The app's own log is never printed whole: it names the backend's address, and
# the Actions logs of this repository are public.
set -euo pipefail

version="$(node -p "require('./package.json').version")"
app="release/mac-universal/Connect.app"
binary="$app/Contents/MacOS/Connect"

fail() {
  echo "::error::$1"
  exit 1
}

# What the release and the update feed need.
for file in \
  "Connect-$version-mac.dmg" "Connect-$version-mac.dmg.blockmap" \
  "Connect-$version-mac.zip" "Connect-$version-mac.zip.blockmap" \
  latest-mac.yml; do
  [ -f "release/$file" ] || fail "missing release/$file"
done

# electron-updater installs nothing on macOS here, but it still reads this feed
# to find the version, and the mandatory-update floor travels in it.
grep -q "Connect-$version-mac.zip" release/latest-mac.yml ||
  fail "latest-mac.yml does not name Connect-$version-mac.zip"
grep -q "minimumVersion" release/latest-mac.yml ||
  fail "latest-mac.yml has no minimumVersion"

# macOS ends an app that opens the microphone or camera without these; Electron
# ships English placeholders, so check they are ours.
for key in NSMicrophoneUsageDescription NSCameraUsageDescription; do
  plutil -extract "$key" raw "$app/Contents/Info.plist" | grep -q "Connect" ||
    fail "Info.plist: $key is not Connect's"
done

archs="$(lipo -archs "$binary")"
[[ "$archs" == *x86_64* && "$archs" == *arm64* ]] ||
  fail "expected x86_64 and arm64, the binary has: $archs"

# Ad hoc, but it has to hold for every file and both architectures: Apple
# Silicon refuses to start code with a broken signature.
codesign --verify --deep --strict "$app" || fail "codesign --verify failed"

node scripts/check-packaged-deps.cjs "$app/Contents/Resources/app.asar"

# Starts and stays up. --mute-audio: nothing may play a sound.
log="$(mktemp)"
"$binary" --mute-audio >"$log" 2>&1 &
pid=$!
sleep 20

running=no
kill -0 "$pid" 2>/dev/null && running=yes
loaded=no
grep -q "\[window\] main page loaded" "$log" && loaded=yes

kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true

if [ "$running" != yes ] || [ "$loaded" != yes ]; then
  echo "Still running after 20 s: $running. Main page loaded: $loaded."
  backend_host="$(sed -nE 's#^CT_BACKEND_URL=[a-z]+://([^/:]+).*#\1#p' .env.runtime 2>/dev/null || true)"
  echo "Last lines of the app's log, addresses removed:"
  sed -E \
    -e "s#${backend_host:-<none>}#<backend>#g" \
    -e 's#[a-z]+://[^ "]+#<url>#g' \
    -e 's#([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?#<ip>#g' \
    "$log" | tail -n 40
  fail "the app did not start cleanly"
fi

echo "check-mac-release: ok (Connect $version, $archs, started and loaded its window)"

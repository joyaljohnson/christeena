#!/bin/sh
# Regenerates assets/og-image.jpg (1200x630) from the sealed envelope on the built page.
# Needs: Google Chrome, Python with Pillow, and the site served at http://localhost:4173 (see .claude/launch.json).
set -e
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
TMP="$(mktemp -d)"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=4000 \
  --screenshot="$TMP/og.png" "http://localhost:4173/#og" >/dev/null 2>&1
"$PY" -c "from PIL import Image; Image.open('$TMP/og.png').convert('RGB').save('assets/og-image.jpg', quality=86, optimize=True, progressive=True)"
rm -rf "$TMP"
ls -l assets/og-image.jpg

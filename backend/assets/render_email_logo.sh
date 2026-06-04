#!/usr/bin/env sh
# Logo is inline SVG only — place EAT_black.svg (or email-logo.svg) in this folder.
# No PNG conversion. Restart the backend after updating the SVG.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
for f in EAT_black.svg email-logo.svg eat-logo.svg; do
  if [[ -f "$DIR/$f" ]]; then
    echo "Email logo: $DIR/$f"
    exit 0
  fi
done
echo "Missing SVG. Add $DIR/EAT_black.svg" >&2
exit 1

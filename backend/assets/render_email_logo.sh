#!/usr/bin/env sh
# Enrollment email wordmark — AlternateLogo_BLK.png (preferred) or EAT_black.svg in this folder.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
for f in AlternateLogo_BLK.png EAT_black.svg email-logo.svg eat-logo.svg; do
  if [[ -f "$DIR/$f" ]]; then
    echo "Email logo: $DIR/$f"
    exit 0
  fi
done
echo "Missing logo. Add $DIR/AlternateLogo_BLK.png or $DIR/EAT_black.svg" >&2
exit 1

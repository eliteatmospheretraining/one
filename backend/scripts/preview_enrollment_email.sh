#!/usr/bin/env bash
# Fetch enrollment confirmation email HTML and open it in your browser.
#
# Usage:
#   export EAT_TOKEN="…"   # JWT from browser localStorage (eat_jwt)
#   ./scripts/preview_enrollment_email.sh
#
# Or login via password:
#   export EAT_EMAIL="you@example.com" EAT_PASSWORD="…"
#   ./scripts/preview_enrollment_email.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${EAT_API_URL:-http://127.0.0.1:8001/api}"

if [[ -z "${EAT_TOKEN:-}" && -n "${EAT_EMAIL:-}" && -n "${EAT_PASSWORD:-}" ]]; then
  EAT_TOKEN="$(
    curl -sS -X POST "${API_URL}/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${EAT_EMAIL}\",\"password\":\"${EAT_PASSWORD}\"}" \
      | python3 -c "import sys, json; print(json.load(sys.stdin).get('token',''))"
  )"
fi

if [[ -z "${EAT_TOKEN:-}" ]]; then
  echo "Set EAT_TOKEN (copy eat_jwt from browser) or EAT_EMAIL + EAT_PASSWORD." >&2
  exit 1
fi

OUT="${TMPDIR:-/tmp}/eat-enrollment-email-preview.html"
HTTP_CODE="$(
  curl -sS -w "%{http_code}" -o "$OUT" \
    -H "Authorization: Bearer ${EAT_TOKEN}" \
    "${API_URL}/enroll/email-preview"
)"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Request failed (HTTP ${HTTP_CODE}). Body:" >&2
  cat "$OUT" >&2
  exit 1
fi

echo "Opened ${OUT}"
if command -v open >/dev/null 2>&1; then
  open "$OUT"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OUT"
else
  echo "Open this file in a browser: file://${OUT}"
fi

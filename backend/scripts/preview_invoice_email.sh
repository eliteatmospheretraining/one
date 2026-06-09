#!/usr/bin/env bash
# Fetch guardian invoice email HTML and open it in your browser.
#
# Usage:
#   export EAT_TOKEN="…"   # JWT from browser localStorage (eat_jwt)
#   ./scripts/preview_invoice_email.sh sample paid     # static sample (no invoice)
#   ./scripts/preview_invoice_email.sh EAT-000012 due
#   ./scripts/preview_invoice_email.sh <invoice-uuid> paid
#
# Or login via password:
#   export EAT_EMAIL="you@example.com" EAT_PASSWORD="…"
#   ./scripts/preview_invoice_email.sh sample due
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${EAT_API_URL:-http://127.0.0.1:8001/api}"

TARGET="${1:?Usage: $0 <invoice_id|sample> [due|paid]}"
if [[ "$TARGET" == "sample" ]]; then
  KIND="${2:-due}"
  PREVIEW_URL="${API_URL}/invoices/email-preview?kind=${KIND}"
  OUT="${TMPDIR:-/tmp}/eat-invoice-email-sample-${KIND}.html"
else
  INVOICE_ID="$TARGET"
  KIND="${2:-due}"
  PREVIEW_URL="${API_URL}/invoices/${INVOICE_ID}/email-preview?kind=${KIND}"
  OUT="${TMPDIR:-/tmp}/eat-email-${INVOICE_ID}-${KIND}.html"
fi

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

HTTP_CODE="$(
  curl -sS -w "%{http_code}" -o "$OUT" \
    -H "Authorization: Bearer ${EAT_TOKEN}" \
    "${PREVIEW_URL}"
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

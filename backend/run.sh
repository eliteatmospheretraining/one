#!/usr/bin/env bash
# Start the API with project deps (avoids Homebrew/global uvicorn missing packages).
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
VENV=".venv"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating virtualenv in $VENV ..."
  "$PYTHON" -m venv "$VENV"
fi

echo "Installing dependencies (requirements-local.txt) ..."
"$VENV/bin/python" -m pip install -q -r requirements-local.txt

echo "Starting backend on port ${PORT:-8001} ..."
if [[ -n "${RAILWAY_ENVIRONMENT:-}${RAILWAY_PROJECT_ID:-}" ]]; then
  exec "$VENV/bin/python" -m uvicorn server:app --host 0.0.0.0 --port "${PORT:-8001}" "$@"
fi
exec "$VENV/bin/python" -m uvicorn server:app --reload --host 0.0.0.0 --port "${PORT:-8001}" "$@"

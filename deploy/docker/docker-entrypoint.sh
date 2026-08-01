#!/bin/bash
set -euo pipefail

CLAMAV_HOST="${CLAMAV_HOST:-127.0.0.1}"
CLAMAV_PORT="${CLAMAV_PORT:-3310}"

wait_for_clamd() {
  local attempts="${1:-120}"
  local i=0
  while [ "$i" -lt "$attempts" ]; do
    if bash -c "echo > /dev/tcp/${CLAMAV_HOST}/${CLAMAV_PORT}" 2>/dev/null; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

mkdir -p /var/run/clamav /var/log/clamav
chown -R clamav:clamav /var/run/clamav /var/log/clamav /var/lib/clamav || true

if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ]; then
  echo "[entrypoint] Virus DB missing — running freshclam (first start may take several minutes)..."
  freshclam
fi

(freshclam 2>/dev/null || true) &

echo "[entrypoint] Starting clamd..."
clamd &
CLAMD_PID=$!

if ! wait_for_clamd 180; then
  echo "[entrypoint] clamd did not become ready on ${CLAMAV_HOST}:${CLAMAV_PORT}" >&2
  kill "$CLAMD_PID" 2>/dev/null || true
  exit 1
fi

echo "[entrypoint] clamd ready (pid ${CLAMD_PID})"

cleanup() {
  kill "$CLAMD_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

if [ "$(id -u)" -eq 0 ] && [ "$1" = "node" ]; then
  exec gosu nodejs "$@"
fi

exec "$@"

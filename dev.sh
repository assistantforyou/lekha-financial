#!/usr/bin/env bash
# Start the Portfolio Terminal dev server with the secrets file loaded.
#   ./dev.sh          -> http://localhost:3456
#   ./dev.sh 4000     -> http://localhost:4000
# Override the secrets path with PT_KEYS=/path/to/keys.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS="${PT_KEYS:-$HOME/.config/portfolio-terminal/keys.env}"

if [ ! -f "$KEYS" ]; then
  printf 'Missing secrets file: %s\n' "$KEYS"
  printf 'Put the keys file there, then run ./dev.sh again.\n'
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$KEYS"
set +a

# Some keys files call this ALPHAVANTAGE_API_KEY; the code reads AV_API_KEY.
export AV_API_KEY="${AV_API_KEY:-${ALPHAVANTAGE_API_KEY:-}}"
export ADMIN_EMAILS="${ADMIN_EMAILS:-assistantforyou999@gmail.com}"

PORT="${1:-3456}"
printf 'Starting Portfolio Terminal on http://localhost:%s\n' "$PORT"
exec node "$ROOT/scripts/dev-server.mjs" "$PORT"

#!/usr/bin/env bash
# Start image-core in dev mode (stderr logging, PORT=47293).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

export NODE_ENV=development
export PORT="${PORT:-47293}"
export HOST="${HOST:-127.0.0.1}"

exec node server.mjs

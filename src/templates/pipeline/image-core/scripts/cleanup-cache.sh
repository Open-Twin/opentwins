#!/usr/bin/env bash
# Delete cache entries older than MAX_AGE_DAYS (default 30).
# Wire into cron for periodic cleanup:
#   0 4 * * *  bash /path/to/workspace/image-core/scripts/cleanup-cache.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

MAX_AGE_DAYS="${MAX_AGE_DAYS:-30}"
node cli.mjs cache-purge --max-age-days "$MAX_AGE_DAYS"

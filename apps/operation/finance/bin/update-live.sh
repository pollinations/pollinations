#!/bin/bash
# Wrapper for launchd — sets up PATH so nvm node, az, aws, and gog are found.
# Intentionally does NOT source ~/.zshrc (zsh-only syntax breaks bash) or any
# user shell config; instead, PATH is built explicitly from known locations.
#
# launchd invokes this file; it then runs bin/update-live.mjs which:
#   1. Pulls live MTD from provider APIs
#   2. Updates vendors.json + pool-history.json
#   3. Calls rebuild-sheet.mjs to push to Google Sheets
#
# stdout/stderr are captured by launchd into:
#   apps/operation/finance/secrets/update-live.log
#   apps/operation/finance/secrets/update-live.err

set -e

export HOME="/Users/comsom"

# Load nvm and use the default (highest-installed) node.
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null
fi

# PATH: nvm default node first, then Homebrew, then system.
# nvm.sh already prepends nvm's current node, so just add Homebrew.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
echo "PATH=$PATH"
echo "node=$(command -v node || echo MISSING)"
echo "az=$(command -v az || echo MISSING)"
echo "aws=$(command -v aws || echo MISSING)"
echo "gog=$(command -v gog || echo MISSING)"
echo "----"

exec node "$APP_DIR/bin/update-live.mjs"

#!/usr/bin/env bash
# Refresh committed monitor runtime files from origin/main before a cycle.
# Live-only secrets and state in /home/ubuntu/monitor are never touched.
set -euo pipefail

REPO=/home/ubuntu/pollinations
MONITOR=/home/ubuntu/monitor
SOURCE=apps/operation/community-monitor
REF=refs/remotes/origin/main

git -C "$REPO" fetch --quiet origin main:refs/remotes/origin/main
REVISION=$(git -C "$REPO" rev-parse "$REF")

# Do not activate until this updater has landed on main. This lets the service
# unit be deployed from its PR without replacing newer live files with old main.
if ! git -C "$REPO" cat-file -e "$REVISION:$SOURCE/update-from-repo.sh"; then
    echo "monitor update skipped: updater is not on main yet"
    exit 0
fi

install_from_main() {
    local path=$1
    local mode=$2
    local target="$MONITOR/$path"
    local staged

    mkdir -p "$(dirname "$target")"
    staged=$(mktemp "$target.update.XXXXXX")
    git -C "$REPO" show "$REVISION:$SOURCE/$path" > "$staged"
    chmod "$mode" "$staged"
    mv "$staged" "$target"
}

install_from_main CYCLE.md 0644
install_from_main probe.mjs 0755
install_from_main loop.sh 0755
install_from_main healthcheck.sh 0755
install_from_main leaderboard/build-leaderboard.mjs 0644

printf '%s\n' "$REVISION" > "$MONITOR/.source-revision.tmp"
mv "$MONITOR/.source-revision.tmp" "$MONITOR/.source-revision"
echo "monitor runtime updated to $REVISION"

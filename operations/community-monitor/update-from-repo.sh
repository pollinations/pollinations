#!/usr/bin/env bash
# Refresh committed monitor runtime files from origin/main before a cycle.
# Live-only secrets and state in /home/ubuntu/monitor are never touched.
set -euo pipefail

REPO=/home/ubuntu/pollinations
MONITOR=/home/ubuntu/monitor
PRIMARY_SOURCE=operations/community-monitor
LEGACY_SOURCE=apps/operation/community-monitor
REF=refs/remotes/origin/main

git -C "$REPO" fetch --quiet origin main:refs/remotes/origin/main
REVISION=$(git -C "$REPO" rev-parse "$REF")

# Use the legacy source until the root move lands, then switch permanently to
# the new path. The live updater must be seeded once before that merge because
# older installed copies do not update themselves.
if git -C "$REPO" cat-file -e "$REVISION:$PRIMARY_SOURCE/update-from-repo.sh" 2>/dev/null; then
    SOURCE=$PRIMARY_SOURCE
elif git -C "$REPO" cat-file -e "$REVISION:$LEGACY_SOURCE/update-from-repo.sh" 2>/dev/null; then
    SOURCE=$LEGACY_SOURCE
else
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
install_from_main seven-day-health.mjs 0755
install_from_main loop.sh 0755
install_from_main healthcheck.sh 0755
install_from_main leaderboard/build-leaderboard.mjs 0644
install_from_main leaderboard/build-image-leaderboard.mjs 0644

# Do not replace the transition-aware live copy with the legacy updater before
# the move lands. Once main exposes the primary source, future updater changes
# become automatic too.
if [ "$SOURCE" = "$PRIMARY_SOURCE" ]; then
    install_from_main update-from-repo.sh 0755
fi

printf '%s\n' "$REVISION" > "$MONITOR/.source-revision.tmp"
mv "$MONITOR/.source-revision.tmp" "$MONITOR/.source-revision"
echo "monitor runtime updated to $REVISION"

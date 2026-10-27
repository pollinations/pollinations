#!/bin/bash
# Ensure the cloudflared on PATH is at least MIN_VERSION.
# 2026.10.2 stops trusting the weak-key eMudhra intermediates (Cloudflare
# advisory, 2026-10-20).
set -e

MIN_VERSION=2026.10.2
SUDO=""
[ "$(id -u)" != "0" ] && SUDO="sudo"

current() {
    dpkg --compare-versions "$(cloudflared --version 2>/dev/null | awk '{print $3}')" ge "$MIN_VERSION"
}

if ! current; then
    curl -fsSL --retry 5 -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    $SUDO dpkg -i /tmp/cloudflared.deb >/dev/null
    # Vast base images put an older bundled cloudflared earlier on PATH.
    current || $SUDO ln -sfn /usr/bin/cloudflared "$(command -v cloudflared)"
    current || { echo "cloudflared is older than $MIN_VERSION" >&2; exit 1; }
fi

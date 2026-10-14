#!/usr/bin/env bash
# Mirror the upstream Open WebUI image into the Cloudflare registry so deploys
# need no Docker build. Cloudflare Containers cannot pull from ghcr.io directly.
#
# Needs a Docker daemon. None runs on our Macs: point DOCKER_HOST at the
# monitoring-agents EC2 box (Docker Engine installed there, 2026-09-03):
#   DOCKER_HOST=ssh://ubuntu@3.221.108.127 npm run push-image
# Containers run linux/amd64, so the pull is pinned to that platform even
# though the box is arm64.
set -euo pipefail

VERSION=${1:-0.11.3}
ACCOUNT_ID=b6ec751c0862027ba269faf7029b2501
# The OAuth login spans two accounts; pin the one the apps deploy to.
export CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID
SOURCE="ghcr.io/open-webui/open-webui:v${VERSION}-slim"
TARGET="open-webui:${VERSION}-slim"

docker pull --platform linux/amd64 "$SOURCE"
docker tag "$SOURCE" "$TARGET"
npx wrangler containers push "$TARGET"

echo
echo "Now set containers[].image in wrangler.jsonc (both envs) to:"
echo "  registry.cloudflare.com/${ACCOUNT_ID}/${TARGET}"

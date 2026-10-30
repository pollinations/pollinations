#!/usr/bin/env bash
# Checks a built controller image before it serves traffic: non-root arm64
# image, then preflight.py inside the production service configuration with
# public synthetic fixtures in a throwaway Compose project. CI runs it after
# the build and the host wrapper before every switch, both with the pinned
# standalone Docker Compose binary.
# Usage: verify.sh <image> <release-dir> <docker-compose binary>
set -euo pipefail

usage="usage: verify.sh <image> <release-dir> <docker-compose binary>"
IMAGE=${1:?$usage}
DIR=${2:?$usage}
COMPOSE=${3:?$usage}
PROJECT=pollinations-local-mcp-pilot-verify

identity=$(docker image inspect --format '{{.Config.User}} {{.Architecture}}' "$IMAGE")
[[ $identity == "10001:10001 arm64" ]] || {
  echo "verify: expected a 10001:10001 arm64 image, got: $identity" >&2
  exit 1
}

# A subnet distinct from the pilot's (compose.yaml), which may already exist
# on the host while this throwaway project runs.
compose() {
  env -i PATH="$PATH" HOME="${HOME:-/root}" \
    LOCAL_MCP_CONTROLLER_IMAGE="$IMAGE" \
    LOCAL_MCP_SUBNET=10.254.76.0/28 \
    LOCAL_MCP_TUNNEL_ID=00000000-0000-0000-0000-000000000000 \
    LOCAL_SHELL_MCP_OAUTH_JWT_SECRET=public-synthetic-test-fixture-only-not-an-operational-key \
    LOCAL_SHELL_MCP_OAUTH_ADMIN_PIN=public-synthetic-test-pin-only \
    "$COMPOSE" --project-name "$PROJECT" --project-directory "$DIR" \
    --file "$DIR/compose.yaml" "$@"
}
trap 'compose down --volumes --remove-orphans >/dev/null 2>&1 || true' EXIT

compose run --rm --no-deps -T --volume "$DIR/preflight.py:/preflight.py:ro" \
  --entrypoint python controller /preflight.py container

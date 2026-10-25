#!/usr/bin/env bash
# Runs one Local MCP pilot operation on community-monitor from the
# Deploy / Local MCP pilot workflow. The host and its ed25519 key are pinned
# here and in known_hosts; the deploy key can only reach the forced command
# local-mcp-pilot on the host.
# Usage: ci-remote.sh status|deploy|stop|rollback
set -euo pipefail

HOST=3.221.108.127
DEPLOY_USER=local-mcp-deploy
DIR=$(cd "$(dirname "$0")" && pwd)

fail() {
  echo "local-mcp-pilot: $*" >&2
  exit 1
}

[[ ${GITHUB_REF-} == refs/heads/production ]] ||
  fail "pilot operations run only from the production branch"
case ${1-} in
status | stop | rollback) command=$1 ;;
deploy)
  [[ ${GITHUB_SHA-} =~ ^[0-9a-f]{40}$ ]] || fail "deploy needs the full production commit SHA"
  command="deploy $GITHUB_SHA"
  ;;
*) fail "unknown operation '${1-}'; use status, deploy, stop or rollback" ;;
esac
[[ -n ${LOCAL_MCP_PILOT_DEPLOY_SSH_KEY-} ]] ||
  fail "LOCAL_MCP_PILOT_DEPLOY_SSH_KEY is not set in the local-mcp-pilot-production environment"

key=$(mktemp)
trap 'rm -f "$key"' EXIT
printf '%s\n' "$LOCAL_MCP_PILOT_DEPLOY_SSH_KEY" >"$key"

ssh -F /dev/null -T -i "$key" -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DIR/known_hosts" \
  -o HostKeyAlgorithms=ssh-ed25519 -o ClearAllForwardings=yes \
  -o ConnectTimeout=20 -o ServerAliveInterval=30 \
  "$DEPLOY_USER@$HOST" "$command"

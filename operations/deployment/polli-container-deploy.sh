#!/usr/bin/env bash
# Deploy a checked-out Polli revision as Compose images. Runtime/data migration is
# intentionally separate: this script refuses to act until it is preprovisioned.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=${POLLI_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}
POLLI_DIR="$REPO_ROOT/apps/polli"
SHA=${1:-}
MODE=${2:-deploy}
PROJECT=polli

usage() { echo "Usage: $0 <checkout-sha> [--validate]" >&2; }
fail() { echo "polli container deployment: $*" >&2; exit 1; }

validate_local() {
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "checkout SHA must be a full lowercase Git SHA"
  [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$SHA" ]] || fail "checkout SHA does not match HEAD"
  [[ -f "$POLLI_DIR/compose.yaml" ]] || fail "apps/polli/compose.yaml is required"
  [[ -f "$POLLI_DIR/Dockerfile" ]] || fail "apps/polli/Dockerfile is required"
  [[ -f "$POLLI_DIR/Dockerfile.visual-studio" ]] || fail "apps/polli/Dockerfile.visual-studio is required"
}

validate_local
if [[ "$MODE" == "--validate" ]]; then
  echo "Validated Polli container release $SHA"
  exit 0
fi
[[ "$MODE" == deploy ]] || { usage; exit 1; }

: "${POLLI_AZURE_HOST:?POLLI_AZURE_HOST is required}"
: "${POLLI_AZURE_USER:?POLLI_AZURE_USER is required}"
: "${POLLI_AZURE_SSH_KEY:?POLLI_AZURE_SSH_KEY is required}"
command -v docker >/dev/null || fail "docker is required to build and stream images"
remote_root=${POLLI_CONTAINER_ROOT:-/home/itachi/polli-container}
[[ "$remote_root" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "POLLI_CONTAINER_ROOT must be an absolute safe path"

key_file=$(mktemp)
remote_lock_acquired=false
cleanup() {
  if [[ "$remote_lock_acquired" == true ]]; then
    ssh "${ssh_options[@]}" "$remote" "rmdir '$remote_root/.deploy.lock'" >/dev/null 2>&1 || true
  fi
  rm -f "$key_file"
}
printf '%s\n' "$POLLI_AZURE_SSH_KEY" > "$key_file"
chmod 600 "$key_file"
ssh_options=(-i "$key_file" -o StrictHostKeyChecking=accept-new)
remote="$POLLI_AZURE_USER@$POLLI_AZURE_HOST"
trap cleanup EXIT

# Hold an atomic remote lock from preflight through upload and activation. This
# rejects a rerun of the active SHA before it can overwrite images or sources.
ssh "${ssh_options[@]}" "$remote" "ROOT='$remote_root' SHA='$SHA' bash -s" <<'REMOTE_PRECHECK'
set -euo pipefail
mkdir -p "$ROOT"
mkdir "$ROOT/.deploy.lock" || { echo "polli container deployment: another deployment is running" >&2; exit 1; }
trap 'rmdir "$ROOT/.deploy.lock"' EXIT
if [[ -L "$ROOT/current" || -e "$ROOT/current" ]]; then
  current=$(readlink "$ROOT/current")
  tag=$(basename "$current")
  [[ "$current" == "$ROOT/releases/$tag" && "$tag" =~ ^[0-9a-f]{40}$ ]] || { echo "polli container deployment: current release is invalid" >&2; exit 1; }
  if [[ "$tag" == "$SHA" ]]; then
    echo "polli container deployment: requested SHA is already current" >&2
    exit 1
  fi
fi
trap - EXIT
REMOTE_PRECHECK
remote_lock_acquired=true

# Build only from this checked-out SHA. Runtime secrets/data are never in images
# or transfer archives.
docker build --tag "polli:$SHA" "$POLLI_DIR"
docker build --tag "polli-visual-studio:$SHA" --file "$POLLI_DIR/Dockerfile.visual-studio" "$POLLI_DIR"
tar -C "$POLLI_DIR" --exclude=.env --exclude=data --exclude=.git -cf - compose.yaml seccomp_profile.json |
  ssh "${ssh_options[@]}" "$remote" "mkdir -p '$remote_root/releases/$SHA' && tar -C '$remote_root/releases/$SHA' -xf -"
docker save "polli:$SHA" | ssh "${ssh_options[@]}" "$remote" 'sudo -n docker load'
docker save "polli-visual-studio:$SHA" | ssh "${ssh_options[@]}" "$remote" 'sudo -n docker load'

ssh "${ssh_options[@]}" "$remote" "SHA='$SHA' PROJECT='$PROJECT' ROOT='$remote_root' bash -s" <<'REMOTE'
set -euo pipefail
fail() { echo "polli container deployment: $*" >&2; exit 1; }
runtime="$ROOT/runtime"
release="$ROOT/releases/$SHA"
marker="$runtime/.container-ready"
lock="$ROOT/deploy.lock"

compose() {
  local directory=$1 tag=$2
  shift 2
  sudo -n env "POLLI_IMAGE=polli:$tag" "POLLI_VISUAL_STUDIO_IMAGE=polli-visual-studio:$tag" \
    docker compose --project-name "$PROJECT" --project-directory "$directory" --env-file "$runtime/.env" \
    -f "$directory/compose.yaml" "$@"
}

mkdir -p "$ROOT"
exec 9>"$lock"
flock -n 9 || fail "another Polli container deployment is running"
sudo -n true || fail "passwordless sudo is required for rootful Docker deployment"
if sudo -n systemctl is-active --quiet polli.service; then
  fail "legacy polli.service is active; container migration must be completed separately"
fi
[[ -d "$runtime" ]] || fail "runtime directory is not provisioned: $runtime"
[[ -f "$runtime/.env" ]] || fail "runtime .env is not provisioned"
[[ -f "$marker" ]] || fail "runtime readiness marker is not provisioned"
grep -qx 'polli-container-v1' "$marker" || fail "runtime readiness marker has an unexpected value"
[[ -f "$release/compose.yaml" && -f "$release/seccomp_profile.json" ]] || fail "release files are missing"
sudo -n docker volume inspect "${PROJECT}_polli-data" >/dev/null || fail "stable data volume ${PROJECT}_polli-data is not pre-provisioned"
ln -sfn "$runtime/.env" "$release/.env"

previous=''
previous_tag=''
if [[ -L "$ROOT/current" || -e "$ROOT/current" ]]; then
  previous=$(readlink "$ROOT/current")
  previous_tag=$(basename "$previous")
  [[ "$previous" == "$ROOT/releases/$previous_tag" && "$previous_tag" =~ ^[0-9a-f]{40}$ && -f "$previous/compose.yaml" ]] || fail "current release is invalid"
fi

rollback() {
  if [[ -n "$previous" ]]; then
    if ! compose "$previous" "$previous_tag" up -d --no-build --remove-orphans --wait --wait-timeout 60; then
      echo "polli container deployment: rollback to $previous_tag failed" >&2
    fi
  else
    compose "$release" "$SHA" down --remove-orphans || echo "polli container deployment: failed first-deploy cleanup" >&2
  fi
}
if ! compose "$release" "$SHA" up -d --no-build --remove-orphans --wait --wait-timeout 60; then
  rollback
  exit 1
fi
ln -sfn "$release" "$ROOT/current"
REMOTE

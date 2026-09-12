#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d)
cleanup() { rm -rf "$ROOT"; }
trap cleanup EXIT
SCRIPT="$(cd "$(dirname "$0")" && pwd)/polli-container-deploy.sh"
BIN="$ROOT/bin"
mkdir -p "$ROOT/repo/apps/polli" "$BIN"
touch "$ROOT/repo/apps/polli/compose.yaml" "$ROOT/repo/apps/polli/Dockerfile" "$ROOT/repo/apps/polli/Dockerfile.visual-studio" "$ROOT/repo/apps/polli/seccomp_profile.json"
git -C "$ROOT/repo" init -q
git -C "$ROOT/repo" config user.email test@example.invalid
git -C "$ROOT/repo" config user.name test
git -C "$ROOT/repo" add apps && git -C "$ROOT/repo" commit -qm test
SHA=$(git -C "$ROOT/repo" rev-parse HEAD)
OLD=0123456789abcdef0123456789abcdef01234567

cat >"$BIN/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$MOCK_LOG"
if [[ "$1" == compose ]]; then
  [[ "$*" == *"releases/$SHA "* && "$*" == *" up "* && "${FAIL_NEW:-}" == 1 ]] && exit 1
fi
exit 0
MOCK
cat >"$BIN/sudo" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$MOCK_LOG"
[[ "$1" == -n ]] && shift
if [[ "$1" == env ]]; then shift; while [[ "$1" == *=* ]]; do shift; done; fi
exec "$@"
MOCK
cat >"$BIN/systemctl" <<'MOCK'
#!/usr/bin/env bash
exit 3
MOCK
cat >"$BIN/flock" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat >"$BIN/ssh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'ssh %s\n' "$*" >>"$MOCK_LOG"
last="${!#}"
if [[ "$last" == *"bash -s" ]]; then bash -c "$last"; exit $?; fi
bash -c "$last"
MOCK
chmod +x "$BIN"/*

run_deploy() {
  local runtime=$1
  PATH="$BIN:$PATH" MOCK_LOG="$ROOT/commands" SHA="$SHA" FAIL_NEW=1 \
    POLLI_REPO_ROOT="$ROOT/repo" POLLI_AZURE_HOST=host POLLI_AZURE_USER=user POLLI_AZURE_SSH_KEY=test \
    POLLI_CONTAINER_ROOT="$runtime" bash "$SCRIPT" "$SHA"
}

# Local preflight rejects a SHA that is not the exact checked-out revision.
if POLLI_REPO_ROOT="$ROOT/repo" bash "$SCRIPT" 0123456789abcdef0123456789abcdef01234567 --validate >/dev/null 2>&1; then
  echo "expected mismatched checkout SHA to fail" >&2; exit 1
fi
POLLI_REPO_ROOT="$ROOT/repo" bash "$SCRIPT" "$SHA" --validate | grep -qx "Validated Polli container release $SHA"

# Upgrade failure runs the prior release from its own directory/tag and leaves
# current unchanged. No real SSH, Docker daemon, or remote host is used.
runtime="$ROOT/runtime-upgrade"
mkdir -p "$runtime/runtime" "$runtime/releases/$OLD"
touch "$runtime/runtime/.env" "$runtime/releases/$OLD/compose.yaml"
printf 'polli-container-v1\n' >"$runtime/runtime/.container-ready"
ln -s "$runtime/releases/$OLD" "$runtime/current"
: >"$ROOT/commands"
set +e
run_deploy "$runtime"
status=$?
set -e
[[ "$status" -ne 0 ]] || { echo "expected upgrade failure" >&2; exit 1; }
grep -q -- "--project-directory $runtime/releases/$OLD" "$ROOT/commands" || { cat "$ROOT/commands" >&2; echo "rollback did not use prior project directory" >&2; exit 1; }
grep -q "POLLI_IMAGE=polli:$OLD" "$ROOT/commands" || { cat "$ROOT/commands" >&2; echo "rollback did not restore prior image tag" >&2; exit 1; }
[[ "$(readlink "$runtime/current")" == "$runtime/releases/$OLD" ]] || { echo "rollback changed current" >&2; exit 1; }

# First-deploy failure removes only failed project containers and does not create
# current or delete the release/data directory.
runtime="$ROOT/runtime-first"
mkdir -p "$runtime/runtime"
touch "$runtime/runtime/.env"
printf 'polli-container-v1\n' >"$runtime/runtime/.container-ready"
: >"$ROOT/commands"
set +e
run_deploy "$runtime"
status=$?
set -e
[[ "$status" -ne 0 ]] || { echo "expected first deployment failure" >&2; exit 1; }
grep -q ' down --remove-orphans' "$ROOT/commands"
[[ ! -e "$runtime/current" ]]
[[ -d "$runtime/releases/$SHA" ]]

# A rerun of the active SHA is rejected by remote preflight, before local image
# builds or image transfer can overwrite the active release identity.
same_root="$ROOT/runtime-same-sha"
mkdir -p "$same_root/runtime" "$same_root/releases/$SHA"
touch "$same_root/runtime/.env" "$same_root/releases/$SHA/compose.yaml"
printf 'polli-container-v1\n' >"$same_root/runtime/.container-ready"
ln -s "$same_root/releases/$SHA" "$same_root/current"
: >"$ROOT/commands"
set +e
run_deploy "$same_root"
status=$?
set -e
[[ "$status" -ne 0 ]] || { echo "expected same-SHA deployment refusal" >&2; exit 1; }
! grep -q '^build ' "$ROOT/commands"
! grep -q '^save ' "$ROOT/commands"

[[ ! -e "$same_root/.deploy.lock" ]] || { echo "same-SHA refusal leaked deployment lock" >&2; exit 1; }

# A preexisting lock belongs to another deployment and must remain untouched.
foreign_root="$ROOT/runtime-foreign-lock"
mkdir -p "$foreign_root/.deploy.lock"
: >"$ROOT/commands"
set +e
run_deploy "$foreign_root"
status=$?
set -e
[[ "$status" -ne 0 ]] || { echo "expected foreign lock refusal" >&2; exit 1; }
[[ -d "$foreign_root/.deploy.lock" ]] || { echo "foreign deployment lock was removed" >&2; exit 1; }
! grep -q '^build ' "$ROOT/commands"

echo "polli container deployment tests passed"

#!/usr/bin/env bash
# Runs bootstrap-host.sh as root on a disposable GitHub-hosted arm64 runner:
# install, same-key update, the sudo restriction, and refusals that must
# leave the host untouched. Never run it on the pilot host: it creates and
# deletes the deploy account. Keys are throwaway, made here.
# Usage: sudo --preserve-env=GITHUB_ACTIONS,RUNNER_ENVIRONMENT \
#          bash test-bootstrap.sh <docker-compose binary>
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=/home/ubuntu/pollinations-local-mcp-pilot
DEPLOY_USER=local-mcp-deploy
HOME_DIR=/var/lib/local-mcp-deploy
WRAPPER=/usr/local/sbin/local-mcp-pilot
SUDOERS=/etc/sudoers.d/local-mcp-pilot
KEYS=$HOME_DIR/.ssh/authorized_keys

fail() {
  echo "test-bootstrap: $*" >&2
  exit 1
}

[[ ${GITHUB_ACTIONS-} == true && ${RUNNER_ENVIRONMENT-} == github-hosted && $(id -u) -eq 0 ]] ||
  fail "runs only as root on a disposable GitHub-hosted runner"
! getent passwd "$DEPLOY_USER" >/dev/null && [[ ! -e $WRAPPER && ! -e $SUDOERS && ! -e $HOME_DIR ]] ||
  fail "the runner already has a pilot deploy identity"

keys=$(mktemp -d)
for name in a b; do
  ssh-keygen -q -t ed25519 -N '' -C "throwaway-$name" -f "$keys/$name"
done
install -d -o 1000 -g 1000 "$ROOT" "$ROOT/bin"
install -m 0755 "${1:?usage: test-bootstrap.sh <docker-compose binary>}" "$ROOT/bin/docker-compose"

snapshot() { # accounts and installed paths, down to inode and mtime
  local path
  getent passwd "$DEPLOY_USER" || true
  getent shadow "$DEPLOY_USER" || true
  getent group "$DEPLOY_USER" || true
  for path in "$HOME_DIR" "$HOME_DIR/.ssh" "$KEYS" "$WRAPPER" "$SUDOERS"; do
    if [[ -e $path ]]; then
      stat -c '%n %i %u %g %a %Y' "$path"
    fi
    if [[ -f $path ]]; then
      sha256sum "$path"
    fi
  done
}

expect_refused() { # key, message
  local before output
  before=$(snapshot)
  if output=$(bash "$DIR/bootstrap-host.sh" "$keys/$1.pub" 2>&1); then
    fail "bootstrap with key $1 should be refused ($2)"
  fi
  [[ $output == *"$2"* ]] || fail "expected '$2', got: $output"
  [[ $(snapshot) == "$before" ]] || fail "refused bootstrap changed the host ($2)"
}

as_deploy() { # SSH_ORIGINAL_COMMAND, as the forced command runs it
  sudo -u "$DEPLOY_USER" env SSH_ORIGINAL_COMMAND="$1" /usr/bin/sudo -n "$WRAPPER" 2>&1 || true
}

reset() {
  userdel "$DEPLOY_USER" 2>/dev/null || true
  groupdel "$DEPLOY_USER" 2>/dev/null || true
  rm -rf "$HOME_DIR" "$WRAPPER" "$SUDOERS"
}

# Fresh install.
bash "$DIR/bootstrap-host.sh" "$keys/a.pub"
[[ $(getent passwd "$DEPLOY_USER" | cut -d: -f6,7) == "$HOME_DIR:/bin/sh" &&
  $(getent shadow "$DEPLOY_USER" | cut -d: -f2) == '*' ]] || fail "unexpected account"
[[ $(stat -c '%u %a' "$HOME_DIR" "$HOME_DIR/.ssh" "$KEYS" "$WRAPPER" "$SUDOERS" | tr '\n' ' ') == "0 755 0 755 0 644 0 755 0 440 " ]] ||
  fail "unexpected ownership or modes"
[[ $(<"$KEYS") == "restrict,command=\"/usr/bin/sudo -n $WRAPPER\" $(<"$keys/a.pub")" ]] ||
  fail "unexpected authorization"

# The identity reaches only the wrapper, without arguments.
[[ $(as_deploy 'bash -c id') == *"rejected command"* ]] || fail "wrapper ran an arbitrary command"
[[ $(as_deploy status) == *"releases: current=none"* ]] || fail "status did not run as root"
if sudo -u "$DEPLOY_USER" /usr/bin/sudo -n /bin/true 2>/dev/null; then
  fail "deploy user ran another command as root"
fi
if sudo -u "$DEPLOY_USER" /usr/bin/sudo -n "$WRAPPER" status 2>/dev/null; then
  fail "sudo accepted an argument to the wrapper"
fi

# Same key: an update that keeps the account, rule and authorization.
before=$(snapshot | grep -vF "$WRAPPER")
bash "$DIR/bootstrap-host.sh" "$keys/a.pub" >/dev/null
[[ $(snapshot | grep -vF "$WRAPPER") == "$before" ]] || fail "same-key rerun changed more than the wrapper"
cmp -s "$DIR/local-mcp-pilot" "$WRAPPER" || fail "same-key rerun did not install the wrapper"

# Refusals, each leaving everything as it was.
expect_refused b "holds a different authorization"
reset
useradd --create-home --shell /bin/bash "$DEPLOY_USER"
expect_refused a "differs from the one this script creates"
reset
groupadd --system "$DEPLOY_USER"
expect_refused a "group $DEPLOY_USER exists without the account"
reset
printf '#!/bin/sh\necho unrelated\n' >"$WRAPPER"
expect_refused a "is not this pilot's wrapper"
reset
printf 'Defaults:nobody !lecture\n' >"$SUDOERS"
chmod 0440 "$SUDOERS"
expect_refused a "differs from the rule this script installs"
reset

echo "test-bootstrap: install, update, sudo restriction and refusals passed"

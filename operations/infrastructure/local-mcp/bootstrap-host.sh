#!/usr/bin/env bash
# Installs the Local MCP pilot deployment identity on community-monitor.
# Run by an administrator over the existing admin SSH session from a
# production checkout, only after the exact approval for
# LOCAL_MCP_PILOT_DEPLOY_SSH_KEY (runbook.txt). Starts no container.
#
# Every account, key and path is checked before the first change. If one
# exists and is not exactly what this script installs, it is refused and
# left untouched. Rerunning with the same key is the update path: it
# replaces only the wrapper (when the installed one is this pilot's); the
# account, sudoers rule and authorization must already match and are kept.
#
#   sudo bash bootstrap-host.sh <deploy-key.pub>      install or update
#   bash bootstrap-host.sh --print <deploy-key.pub>   show what would be installed
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C

DEPLOY_USER=local-mcp-deploy
HOME_DIR=/var/lib/local-mcp-deploy
WRAPPER=/usr/local/sbin/local-mcp-pilot
SUDOERS=/etc/sudoers.d/local-mcp-pilot
ROOT=/home/ubuntu/pollinations-local-mcp-pilot
COMPOSE=$ROOT/bin/docker-compose
DIR=$(cd "$(dirname "$0")" && pwd)
MARKER="# SSH forced command for the Local MCP pilot deployment identity, installed"

fail() {
  echo "bootstrap: $*" >&2
  exit 1
}

print=false
if [[ ${1-} == --print ]]; then
  print=true
  shift
fi
[[ $# -eq 1 && -f $1 ]] || fail "usage: bootstrap-host.sh [--print] <deploy-key.pub>"
key=$(<"$1")
[[ $key =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,2}(\ [A-Za-z0-9._@-]+)?$ ]] ||
  fail "expected exactly one ssh-ed25519 public key line"

# `restrict` disables PTY, user rc and port, agent and X11 forwarding; the
# forced command ignores whatever the client asks to run and hands it to the
# wrapper as SSH_ORIGINAL_COMMAND, which sudo keeps for this one command only.
authorization="restrict,command=\"/usr/bin/sudo -n $WRAPPER\" $key"
sudoers="Defaults!$WRAPPER env_keep += \"SSH_ORIGINAL_COMMAND\"
$DEPLOY_USER ALL=(root) NOPASSWD: $WRAPPER \"\""

if $print; then
  printf 'authorized_keys for %s:\n%s\n\n%s:\n%s\n' "$DEPLOY_USER" "$authorization" "$SUDOERS" "$sudoers"
  exit 0
fi

# Checks only: nothing on the host changes before all of them pass.
[[ $(id -u) -eq 0 ]] || fail "run with sudo"
[[ $(uname -m) == aarch64 ]] || fail "expected the arm64 community-monitor host"
[[ -d $ROOT && ! -L $ROOT && $(stat -c %u "$ROOT") == 1000 ]] || fail "$ROOT must exist and belong to ubuntu"
for tool in curl docker flock python3 sha256sum ssh-keygen visudo; do
  command -v "$tool" >/dev/null || fail "$tool is required"
done
[[ $(sed -n 2p "$DIR/local-mcp-pilot") == "$MARKER" ]] || fail "$DIR/local-mcp-pilot is not the pilot wrapper"
bash -n "$DIR/local-mcp-pilot" || fail "$DIR/local-mcp-pilot does not parse"
compose_sha256=$(sed -n 's/^COMPOSE_SHA256=\([0-9a-f]\{64\}\)$/\1/p' "$DIR/local-mcp-pilot")
[[ -n $compose_sha256 && -f $COMPOSE && ! -L $COMPOSE && $(sha256sum <"$COMPOSE") == "$compose_sha256  -" ]] ||
  fail "$COMPOSE must be the pinned Docker Compose binary (sha256 $compose_sha256)"
"$COMPOSE" version >/dev/null || fail "$COMPOSE does not run"
visudo -c >/dev/null || fail "the existing sudo configuration does not validate"

root_file() { # path: a regular root-owned file, not a symlink
  [[ -f $1 && ! -L $1 && $(stat -c %u "$1") == 0 ]]
}
root_dir() { # path, mode
  [[ -d $1 && ! -L $1 && $(stat -c '%u %a' "$1") == "0 $2" ]]
}

file=$HOME_DIR/.ssh/authorized_keys
if account=$(getent passwd "$DEPLOY_USER"); then
  # Only the account this script creates is reused: a system uid with its
  # own group only, root-owned home and .ssh, and no usable password.
  IFS=: read -r _ _ uid _ _ home shell <<<"$account"
  [[ $uid -gt 0 && $uid -lt 1000 && $home == "$HOME_DIR" && $shell == /bin/sh &&
    $(getent shadow "$DEPLOY_USER" | cut -d: -f2) == '*' &&
    $(id -nG "$DEPLOY_USER") == "$DEPLOY_USER" ]] ||
    fail "an existing $DEPLOY_USER account differs from the one this script creates; left untouched"
  for path in "$HOME_DIR" "$HOME_DIR/.ssh"; do
    if [[ -e $path || -L $path ]]; then
      root_dir "$path" 755 || fail "$path is not a root-owned 0755 directory; left untouched"
    fi
  done
  [[ ! -e $HOME_DIR/.ssh/authorized_keys2 && ! -L $HOME_DIR/.ssh/authorized_keys2 ]] ||
    fail "$HOME_DIR/.ssh/authorized_keys2 exists; left untouched"
  if [[ -e $file || -L $file ]]; then
    root_file "$file" && [[ $(<"$file") == "$authorization" ]] ||
      fail "$file holds a different authorization; replacing it needs its own approval"
  fi
else
  ! getent group "$DEPLOY_USER" >/dev/null || fail "group $DEPLOY_USER exists without the account; left untouched"
  [[ ! -e $HOME_DIR && ! -L $HOME_DIR ]] || fail "$HOME_DIR exists without the account; left untouched"
fi
if [[ -e $WRAPPER || -L $WRAPPER ]]; then
  root_file "$WRAPPER" && [[ $(sed -n 2p "$WRAPPER") == "$MARKER" ]] ||
    fail "$WRAPPER exists and is not this pilot's wrapper; left untouched"
fi
if [[ -e $SUDOERS || -L $SUDOERS ]]; then
  root_file "$SUDOERS" && [[ $(<"$SUDOERS") == "$sudoers" ]] ||
    fail "$SUDOERS differs from the rule this script installs; left untouched"
fi
staged=$(mktemp)
trap 'rm -f "$staged"' EXIT
printf '%s\n' "$sudoers" >"$staged"
visudo -cf "$staged" >/dev/null || fail "sudoers rule failed validation"
if sshd -T 2>/dev/null | grep -Eq '^(allowusers|allowgroups) '; then
  echo "bootstrap: sshd has AllowUsers/AllowGroups; $DEPLOY_USER needs a separate sshd change" >&2
fi

# Changes. The home is root-owned so the identity cannot add keys or files.
# Password "*" matches no password but, unlike "!", is not a locked account
# that sshd would refuse for keys when UsePAM is off. sshd runs the forced
# command through the login shell, so that is /bin/sh.
[[ -n ${account-} ]] ||
  useradd --system --no-create-home --home-dir "$HOME_DIR" --shell /bin/sh --password '*' "$DEPLOY_USER"
install -d -o root -g root -m 0755 "$HOME_DIR" "$HOME_DIR/.ssh"
# Each file is written beside its target and renamed into place.
tmp=$(mktemp "$WRAPPER.XXXXXX")
install -o root -g root -m 0755 "$DIR/local-mcp-pilot" "$tmp"
mv -f "$tmp" "$WRAPPER"
if [[ ! -e $SUDOERS ]]; then
  tmp=$(mktemp "$SUDOERS.XXXXXX") # sudo ignores names containing a dot
  install -o root -g root -m 0440 "$staged" "$tmp"
  mv "$tmp" "$SUDOERS"
fi
visudo -c >/dev/null || fail "sudo configuration does not validate after installing $SUDOERS"
if [[ ! -e $file ]]; then
  tmp=$(mktemp "$file.XXXXXX")
  printf '%s\n' "$authorization" >"$tmp"
  chmod 0644 "$tmp"
  mv "$tmp" "$file"
fi

echo "bootstrap: $DEPLOY_USER may run only $WRAPPER; no container started"
echo "bootstrap: deploy key $(ssh-keygen -lf "$file" | cut -d' ' -f2)"

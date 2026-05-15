#!/usr/bin/env bash
set -euo pipefail

# Switch the active wrangler/Cloudflare account by swapping the OAuth config.
#
# Wrangler reads a single file: ~/Library/Preferences/.wrangler/config/default.toml
# (on macOS). Side-by-side snapshots in the same dir let us hot-swap without
# running `wrangler login` again.
#
# Usage:
#   scripts/cf-account.sh                # show current + available
#   scripts/cf-account.sh <name>         # switch to <name> (e.g. pollinations, myceli)
#   scripts/cf-account.sh save <name>    # snapshot current login as <name>

CONFIG_DIR="$HOME/Library/Preferences/.wrangler/config"
DEFAULT="$CONFIG_DIR/default.toml"

list_profiles() {
  find "$CONFIG_DIR" -maxdepth 1 -name '*.toml' ! -name 'default.toml' \
    -exec basename {} .toml \; | sort
}

current_email() {
  [ -f "$DEFAULT" ] || { echo "(no active login)"; return; }
  wrangler whoami 2>&1 | grep -oE 'associated with the email [^.]+' \
    | sed 's/associated with the email //' || echo "(unknown)"
}

current_profile_match() {
  [ -f "$DEFAULT" ] || return
  for p in $(list_profiles); do
    if cmp -s "$DEFAULT" "$CONFIG_DIR/$p.toml"; then
      echo "$p"
      return
    fi
  done
  echo "(unsaved / drifted)"
}

case "${1:-}" in
  "")
    echo "Active email:   $(current_email)"
    echo "Active profile: $(current_profile_match)"
    echo "Available:"
    list_profiles | sed 's/^/  - /'
    echo
    echo "Switch:  scripts/cf-account.sh <name>"
    echo "Save:    scripts/cf-account.sh save <name>"
    ;;
  save)
    name="${2:?usage: cf-account.sh save <name>}"
    [ -f "$DEFAULT" ] || { echo "no active login to save"; exit 1; }
    cp "$DEFAULT" "$CONFIG_DIR/$name.toml"
    echo "saved current login -> $name.toml"
    ;;
  *)
    name="$1"
    target="$CONFIG_DIR/$name.toml"
    [ -f "$target" ] || {
      echo "no such profile: $name"
      echo "available: $(list_profiles | tr '\n' ' ')"
      exit 1
    }
    cp "$target" "$DEFAULT"
    echo "switched -> $name ($(current_email))"
    ;;
esac

#!/bin/bash
# Load rotation admin secrets from SOPS into env.
# Sourced by rotation scripts that need admin credentials (Tinybird, xAI, etc.).
#
# Env vars set before this runs always take precedence — so CI (which already
# passes admin creds via workflow env) behaves unchanged. This file is only
# helpful for local operators who don't want to export a dozen vars manually.
#
# Pattern:
#   source "$SCRIPT_DIR/_load-admin-secrets.sh"

_ROTATION_SECRETS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/secrets.vars.json"

if [ -f "$_ROTATION_SECRETS" ]; then
    while IFS='=' read -r _key _val; do
        [ -z "$_key" ] && continue
        _val="${_val%\"}"
        _val="${_val#\"}"
        if [ -z "${!_key:-}" ]; then
            export "$_key=$_val"
        fi
    done < <(sops --output-type dotenv -d "$_ROTATION_SECRETS" 2>/dev/null)
fi

unset _ROTATION_SECRETS _key _val

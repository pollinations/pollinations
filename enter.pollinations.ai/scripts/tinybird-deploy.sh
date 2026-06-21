#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  enter.pollinations.ai/scripts/tinybird-deploy.sh staging [--check] [extra tb deploy flags]
  enter.pollinations.ai/scripts/tinybird-deploy.sh production [--check] [extra tb deploy flags]

Config:
  staging:    enter.pollinations.ai/observability/.tinyb.staging
  production: enter.pollinations.ai/observability/.tinyb

Both files are gitignored Tinybird CLI config files. The helper validates the
configured workspace before running tb.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ $# -lt 1 ]]; then
    usage >&2
    exit 1
fi

environment="$1"
shift

case "$environment" in
    staging)
        config_name=".tinyb.staging"
        workspace="pollinations_enter_staging"
        ;;
    production|prod)
        config_name=".tinyb"
        workspace="pollinations_enter"
        ;;
    *)
        echo "Unknown Tinybird environment: $environment" >&2
        usage >&2
        exit 1
        ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
enter_dir="$(cd "$script_dir/.." && pwd)"
observability_dir="$enter_dir/observability"
config_file="$observability_dir/$config_name"

if [[ ! -f "$config_file" ]]; then
    cat >&2 <<EOF
Missing Tinybird config file: $config_file

Create it from the team-managed Tinybird deploy credential, then rerun this
command. This file is gitignored and must not be committed.
EOF
    exit 1
fi

config_json="$(
    python3 - "$config_file" "$workspace" <<'PY'
import json
import sys

path = sys.argv[1]
expected_workspace = sys.argv[2]

with open(path, encoding="utf-8") as handle:
    config = json.load(handle)

workspace = config.get("name")
token = config.get("token")

if workspace != expected_workspace:
    print(
        f"workspace mismatch: expected {expected_workspace}, found {workspace or '<missing>'}",
        file=sys.stderr,
    )
    sys.exit(2)

if not token:
    print("missing token in Tinybird config", file=sys.stderr)
    sys.exit(3)

print(token)
PY
)"
token="$config_json"

echo "Deploying Tinybird $environment workspace ($workspace)."
echo "Using config file: $config_file"

cd "$observability_dir"
TB_TOKEN="$token" tb --cloud deploy --wait "$@"

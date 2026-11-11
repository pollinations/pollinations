#!/bin/bash
# Sourced by the find-*/check-* scripts. Queries the PRODUCTION Tinybird
# workspace via observability/scripts/tb-prod.sh (token from SOPS, not .tinyb).

TB_PROD="$(dirname "${BASH_SOURCE[0]}")/../../../../enter.pollinations.ai/observability/scripts/tb-prod.sh"

validate_positive_integer() {
    local value="$1" max="$2" label="$3"
    if [[ ! "$value" =~ ^[1-9][0-9]{0,5}$ ]] || (( value > max )); then
        echo "Error: $label must be an integer from 1 to $max" >&2
        exit 1
    fi
}

run_tinybird_query() {
    "$TB_PROD" "$1"
}

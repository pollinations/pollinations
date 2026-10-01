#!/bin/bash
# Sourced by the find-*/check-* scripts. Queries the PRODUCTION Tinybird
# workspace via observability/scripts/tb-prod.sh (token from SOPS, not .tinyb).

TB_PROD="$(dirname "${BASH_SOURCE[0]}")/../../../../enter.pollinations.ai/observability/scripts/tb-prod.sh"

run_tinybird_query() {
    "$TB_PROD" "$1"
}

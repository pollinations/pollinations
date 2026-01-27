#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$SCRIPT_DIR/../.env"

load_dotenv() {
    local file="$1"
    [ -f "$file" ] || return 0

    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"

        case "$line" in
            ""|\#*)
                continue
                ;;
        esac

        if [[ "$line" == export\ * ]]; then
            line="${line#export }"
        fi

        if [[ "$line" != *=* ]]; then
            continue
        fi

        local key="${line%%=*}"
        local value="${line#*=}"

        if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            continue
        fi

        if [[ "$value" == '"'*'"' ]]; then
            value="${value#\"}"
            value="${value%\"}"
        elif [[ "$value" == "'"*"'" ]]; then
            value="${value#\'}"
            value="${value%\'}"
        fi

        if [ -z "${!key:-}" ]; then
            export "$key=$value"
        fi
    done < "$file"
}

DEFAULT_MODELS="gemini-search,perplexity-fast"
MODEL=""
MODELS_CSV="$DEFAULT_MODELS"
PARALLEL="true"

usage() {
    cat >&2 <<'USAGE'
Usage:
  web-research.sh [--model MODEL] [--models MODEL1,MODEL2,...] "your prompt"

Default: queries gemini-search and perplexity-fast in parallel.

Examples:
  web-research.sh "What is pollinations.ai?"
  web-research.sh --model perplexity "Use only one model"
  web-research.sh --models gemini-search,nomnom "Custom model set"
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --model)
            shift
            MODEL="${1:-}"
            if [ -z "$MODEL" ]; then
                usage
                exit 2
            fi
            ;;
        --models)
            shift
            MODELS_CSV="${1:-}"
            if [ -z "$MODELS_CSV" ]; then
                usage
                exit 2
            fi
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage
            exit 2
            ;;
        *)
            break
            ;;
    esac
    shift
done

PROMPT="$*"
if [ -z "$PROMPT" ]; then
    usage
    exit 2
fi

if [ -f "$ENV_FILE" ]; then
    echo "Using local .env: $ENV_FILE" >&2
else
    echo "No local .env found at: $ENV_FILE" >&2
fi

load_dotenv "$ENV_FILE"

API_KEY="${POLLINATIONS_API_KEY:-}"
if [ -z "$API_KEY" ]; then
    printf "POLLINATIONS_API_KEY not set. Enter API key: " >&2
    read -r -s API_KEY
    echo >&2
fi

if [ -z "$API_KEY" ]; then
    echo "Missing API key." >&2
    exit 2
fi

export GEMINI_SEARCH_PROMPT="$PROMPT"

make_body() {
    local model="$1"
    export GEMINI_SEARCH_MODEL="$model"

    python3 - <<'PY'
import json
import os
import sys

prompt = os.environ.get("GEMINI_SEARCH_PROMPT")
model = os.environ.get("GEMINI_SEARCH_MODEL")
if not prompt:
    sys.exit(2)

if not model:
    sys.exit(2)

print(json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
}))
PY
}

print_response() {
    python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    c = d.get("choices", [])
    if c:
        msg = c[0].get("message", {}).get("content", "")
        if msg:
            print(msg)
        else:
            print(json.dumps(d, indent=2))
    else:
        print(json.dumps(d, indent=2))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
'
}

run_one() {
    local model="$1"

    local body
    body=$(make_body "$model")

    curl -sS "https://gen.pollinations.ai/v1/chat/completions" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$body" | print_response
}

if [ -n "$MODELS_CSV" ]; then
    IFS=',' read -r -a MODELS <<< "$MODELS_CSV"

    if [ "$PARALLEL" = "true" ]; then
        TMP_DIR=$(mktemp -d)
        trap 'rm -rf "$TMP_DIR"' EXIT

        i=0
        for m in "${MODELS[@]}"; do
            out="$TMP_DIR/$i.out"
            ( printf "=== %s ===\n" "$m" >"$out" && run_one "$m" >>"$out" ) &
            i=$((i + 1))
        done
        wait

        i=0
        for _ in "${MODELS[@]}"; do
            cat "$TMP_DIR/$i.out"
            echo
            i=$((i + 1))
        done
    else
        for m in "${MODELS[@]}"; do
            printf "=== %s ===\n" "$m"
            run_one "$m"
            echo
        done
    fi
else
    run_one "$MODEL"
fi

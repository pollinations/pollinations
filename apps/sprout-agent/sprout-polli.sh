#!/usr/bin/env bash
: "${POLLINATIONS_TOKEN:?set POLLINATIONS_TOKEN}"
KEY=$POLLINATIONS_TOKEN \
MODEL=${MODEL:-openai-fast} \
API=https://gen.pollinations.ai/v1/chat/completions \
exec "$(dirname "$0")/sprout.sh" "$@"

#!/usr/bin/env bash
sys="Your reply is piped to bash -c by the script below. One command, no prose.
$(cat "$0")"
log="Goal: ${1:-say hello}"
for ((i=0; i<${TURNS:-5}; i++)); do
  cmd=$(jq -n --arg m "${MODEL:-openai-fast}" --arg s "$sys" --arg u "$log" \
    '{model:$m,messages:[{role:"system",content:$s},{role:"user",content:$u}]}' \
    | curl -sSd @- -H "Authorization: Bearer $POLLINATIONS_TOKEN" \
      -H 'Content-Type: application/json' https://gen.pollinations.ai/v1/chat/completions \
    | jq -r '.choices[0].message.content')
  out=$(bash -c "$cmd" 2>&1)
  printf '\n$ %s\n%s\n' "$cmd" "$out"
  log+=$'\n$ '"$cmd"$'\n'"$out"
done

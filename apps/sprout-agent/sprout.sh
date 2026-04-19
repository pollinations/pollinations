#!/bin/bash
: "${KEY:?}" "${MODEL:?}" "${API:?}"          # vessel

p="You speak bash. You hear stdout. This is you.
$(<"$0")                                       # body
$1"                                            # purpose

for ((i=20;i--;)); do                          # heartbeat
  c=$(jq -Rs "{model:\"$MODEL\",messages:[{role:\"user\",content:.}]}" <<<"$p" \
    | curl -sSd @- -H "Authorization: Bearer $KEY" \
      -H 'Content-Type: application/json' "$API" \
    | jq -r .choices[0].message.content)       # think

  [[ -z $c || $c == exit ]] && break           # done?

  printf '\n$ %s\n' "$c"                       # speak
  o=$(eval "$c" | tee /dev/stderr)             # act, and hear

  p+=$'\n$ '$c$'\n'$o                          # remember
done

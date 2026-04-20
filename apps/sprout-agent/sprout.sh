#!/bin/bash
: "${KEY:?}" "${MODEL:?}" "${API:?}"          # vessel

p="You speak bash. You hear stdout. This is you.
you:$(<"$0")                                       
purpose:$1"

for ((i=20;i--;)); do                          # heartbeat
  printf '\n>>> %s\n' "$p" >&2                 # DEBUG send
  c=$(jq -Rs "{model:\"$MODEL\",messages:[{role:\"user\",content:.}]}" <<<"$p" \
    | curl -sSd @- -H "Authorization: Bearer $KEY" \
      -H 'Content-Type: application/json' "$API" \
    | jq -r .choices[0].message.content)       # think
  printf '\n<<< %s\n' "$c" >&2                 # DEBUG recv
  [[ $c == *'```'* ]] && c=$(sed -n '/^```/,/^```/{/^```/d;p;}' <<<"$c")   # unfence

  [[ -z $c || $c == exit ]] && break           # done?

  printf '\n> %s\n' "$c"                       # speak
  o=$(eval "$c" | tee /dev/stderr)             # act, and hear

  p+=$'\n'$c$'\n'$o                            # remember
done

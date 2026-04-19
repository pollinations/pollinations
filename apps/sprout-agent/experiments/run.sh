#!/usr/bin/env bash
# Run a sprout-agent experiment inside the sandbox.
#   ./run.sh <exp-name> [model] [turns]
# exp-name matches goals/<exp-name>.txt
set -u

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

name="${1:?usage: run.sh <exp-name> [model] [turns]}"
model="${2:-openai-fast}"
turns="${3:-10}"

goal_file="$here/goals/$name.txt"
[ -f "$goal_file" ] || { echo "no goal file: $goal_file"; exit 1; }
goal="$(cat "$goal_file")"

stamp=$(date +%Y%m%d-%H%M%S)
work="/tmp/sprout-exp/$name-$model-$stamp"
mkdir -p "$work"
cp "$goal_file" "$work/goal.txt"

echo "== experiment: $name =="
echo "   model:   $model"
echo "   turns:   $turns"
echo "   work:    $work"
echo

cd "$work"
WORK="$work" MODEL="$model" TURNS="$turns" \
  "$root/sandbox.sh" "$root/agent.sh" "$goal" 2>&1 | tee "$work/transcript.log"

echo
echo "== result =="
shopt -s nullglob
artifacts=("$work"/output.*)
if [ "${#artifacts[@]}" -gt 0 ]; then
  for a in "${artifacts[@]}"; do
    echo "-- $(basename "$a") ($(wc -c < "$a") bytes) --"
    cat "$a"
    echo
  done
else
  echo "(no output.* produced)"
fi
echo
echo "full transcript: $work/transcript.log"

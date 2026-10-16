#!/usr/bin/env bash
# Starts one model agent run: a polli sandbox with this repo, local gen holding
# the production provider keys, and Claude Code on Pollinations following
# operations/model-agent/AGENTS.md. The sandbox pauses when the run ends.
#
#   GH_TOKEN=<token that can push branches and open PRs> operations/model-agent/setup.sh
#
# Needs polli logged in (it pays for the sandbox and the agent's model), sops
# with the maintainer age key, node and ssh. MODEL sets the agent's model.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN must be a token that can push branches and open PRs}"
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
model=${MODEL:-openai/gpt-6-sol}

# Capped at 4 hours; the run pauses it sooner.
id=$(polli --json sandbox create pollinations-large --timeout 14400 |
    node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).id')
host="$id.polli"
trap 'polli sandbox kill "$id" >/dev/null' ERR
echo "Sandbox $id: installing the repo"

ssh "$host" bash -s <<'INSTALL'
set -euo pipefail
git clone --quiet --filter=blob:none https://github.com/pollinations/pollinations.git ~/pollinations
cd ~/pollinations
npm ci --no-audit --no-fund --loglevel=error
(cd enter.pollinations.ai && npm run --silent migrate:development >/dev/null)
(cd gen.pollinations.ai && npm run --silent seed:local >/dev/null)
curl -fsSL -o /tmp/gh.tar.gz https://github.com/cli/cli/releases/download/v2.101.0/gh_2.101.0_linux_amd64.tar.gz
echo "9bca2d1c16825f109907a23307628a2f0698fbf99662b73a5cf0b020293072b8  /tmp/gh.tar.gz" | sha256sum -c --quiet
tar -xzf /tmp/gh.tar.gz -C /tmp
install -D /tmp/gh_2.101.0_linux_amd64/bin/gh ~/.local/bin/gh
INSTALL

# Secrets travel over ssh stdin, never on a command line or the local disk.
# gen's dev vars with the production provider keys on top; Tinybird, auth,
# Enter, E2B and Weft keep their dev values, so billing lands in staging.
node -e '
const fs = require("node:fs");
const [dev, prod] = process.argv.slice(1).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
for (const key of ["TINYBIRD_INGEST_TOKEN", "BETTER_AUTH_SECRET", "PLN_ENTER_TOKEN", "E2B_API_KEY", "WEFT_SELLER_API_KEY"])
    delete prod[key];
process.stdout.write(JSON.stringify({ ...dev, ...prod }));
' <(sops -d "$repo/gen.pollinations.ai/secrets/dev.vars.json") \
    <(sops -d "$repo/gen.pollinations.ai/secrets/prod.vars.json") |
    ssh "$host" "bash -c 'cd ~/pollinations/gen.pollinations.ai && node scripts/push-generation-secrets.mjs <(cat) local'"
printf '%s\n' "$GH_TOKEN" |
    ssh "$host" '~/.local/bin/gh auth login --with-token && ~/.local/bin/gh auth setup-git'

ssh "$host" bash -s -- "$id" "$model" <<'RUN'
set -euo pipefail
id=$1 model=$2
export PATH="$HOME/.local/bin:$PATH"
git config --global user.name "Pollinations model agent"
git config --global user.email "noreply@pollinations.ai"
polli harness claude-code on --model "$model"
cd ~/pollinations
setsid nohup bash -c "claude --settings ~/.pollinations/claude-code.json --dangerously-skip-permissions \
    --output-format stream-json --verbose \
    -p 'Read operations/model-agent/AGENTS.md and do one run as it describes.' > ~/agent.jsonl 2>&1
    polli sandbox pause $id" </dev/null >/dev/null 2>&1 &
RUN

echo "Agent running. Watch: ssh $host tail -f agent.jsonl"
echo "It pauses when done; polli sandbox kill $id deletes it."

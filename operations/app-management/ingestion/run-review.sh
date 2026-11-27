#!/usr/bin/env bash
set -eo pipefail

case "$1" in
  validate)
    set +e
    node operations/app-management/ingestion/validate-submission.js > "$RUNNER_TEMP/app-validation.json"
    STATUS=$?
    set -e
    cat "$RUNNER_TEMP/app-validation.json"
    {
      echo 'result<<APP_VALIDATION_EOF'
      cat "$RUNNER_TEMP/app-validation.json"
      echo 'APP_VALIDATION_EOF'
    } >> "$GITHUB_OUTPUT"
    if [ "$STATUS" -eq 1 ]; then
      exit 1
    fi
    ;;
  review)
    node operations/app-management/ingestion/model-proxy.js &
    # Only the proxy on this host, and no private or Azure addresses (168.63.129.16
    # also serves VM settings, so the container gets public DNS instead).
    sudo iptables -I INPUT -i docker0 -j REJECT
    sudo iptables -I INPUT -i docker0 -p tcp --dport 8711 -j ACCEPT
    sudo iptables -I DOCKER-USER -i docker0 -d 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,100.64.0.0/10,168.63.129.16 -j REJECT
    { cat operations/app-management/ingestion/review-prompt.txt; jq .submission "$RUNNER_TEMP/app-validation.json"; } > "$RUNNER_TEMP/prompt.txt"
    docker run --rm -i -w /review --dns 1.1.1.1 \
      -e ANTHROPIC_BASE_URL=http://172.17.0.1:8711 -e ANTHROPIC_API_KEY=proxy \
      -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
      node:22 sh -c 'npm install -g --no-audit --no-fund @anthropic-ai/claude-code@2.1.301 < /dev/null >&2 &&
        exec claude -p --bare --model openai/gpt-6-luna --max-turns 40 --permission-mode dontAsk --output-format stream-json --verbose \
          --tools Bash,Read,Grep,Glob --allowedTools "Bash(curl:*),Bash(git clone:*),Bash(grep:*),Read,Grep,Glob"' \
      < "$RUNNER_TEMP/prompt.txt" > "$RUNNER_TEMP/agent.jsonl" || true
    # Log each tool call and failure, then the verdict.
    jq -r 'if .type == "assistant" then .message.content[]? | select(.type == "tool_use") | "\(.name): \(.input | tostring | .[0:200])"
      elif .type == "user" then .message.content[]? | select(.is_error? == true) | "  failed: \(.content | tostring | .[0:200])"
      elif .type == "result" then "turns: \(.num_turns)", .result else empty end' "$RUNNER_TEMP/agent.jsonl"
    echo "result=$(jq -r 'select(.type == "result") | .result' "$RUNNER_TEMP/agent.jsonl" | tr '\n' ' ')" >> "$GITHUB_OUTPUT"
    jq -e 'select(.type == "result") | .result' "$RUNNER_TEMP/agent.jsonl" > /dev/null
    ;;
  post)
    gh issue edit "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --add-label APP-SUBMISSION
    GH_BOT_ID=$(gh api "/users/${BOT_LOGIN}" --jq .id)
    export GH_BOT_ID
    python operations/app-management/ingestion/post-review.py
    ;;
  *)
    echo "Unknown app submission step: $1" >&2
    exit 2
    ;;
esac

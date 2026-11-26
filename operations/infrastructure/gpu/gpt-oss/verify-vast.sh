#!/bin/bash
# Check a gpt-oss Vast instance before it takes traffic. Run on the instance
# (BASE_URL defaults to the nginx gate) or against the tunnel hostname.
#
# Usage: [BASE_URL=https://gpt-oss-vast.myceli.ai] bash verify-vast.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:10010}"
TOKEN="${PLN_GPU_TOKEN:-$(cat /root/gpu-token)}"
MODEL="openai/gpt-oss-20b"

fail() { echo "FAIL: $1" >&2; exit 1; }
chat() {
    curl -sS --max-time 120 "$BASE_URL/v1/chat/completions" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"
}

curl -fsS --max-time 5 "$BASE_URL/health" >/dev/null || fail "health"
echo "ok health"

status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/v1/models")
[ "$status" = 401 ] || fail "a request without the key got $status, not 401"
echo "ok key required"

reply=$(chat "{\"model\":\"$MODEL\",\"reasoning_effort\":\"low\",\"max_tokens\":200,\"messages\":[{\"role\":\"user\",\"content\":\"What is 17 * 3? Answer with the number.\"}]}")
echo "$reply" | grep -q '"completion_tokens"' || fail "reply without usage: $reply"
echo "$reply" | grep -q '51' || fail "wrong answer: $reply"
echo "ok chat with usage"

stream=$(chat "{\"model\":\"$MODEL\",\"stream\":true,\"reasoning_effort\":\"low\",\"max_tokens\":100,\"messages\":[{\"role\":\"user\",\"content\":\"Say hi\"}]}")
echo "$stream" | grep '"completion_tokens"' >/dev/null || fail "stream without usage"
echo "$stream" | grep -q 'data: \[DONE\]' || fail "stream without [DONE]"
echo "ok stream with usage"

# 60 long requests at once: the gate admits 48, the rest get an instant 503
body="{\"model\":\"$MODEL\",\"max_tokens\":400,\"messages\":[{\"role\":\"user\",\"content\":\"Write a long story.\"}]}"
codes=$(seq 60 | xargs -P 60 -I{} curl -s -o /dev/null -w '%{http_code}\n' --max-time 300 \
    "$BASE_URL/v1/chat/completions" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d "$body" | sort | uniq -c)
echo "$codes"
echo "$codes" | grep -q ' 503$' || fail "no 503 beyond the capacity gate"
echo "$codes" | grep -q ' 200$' || fail "no 200 under load"
echo "ok capacity gate"

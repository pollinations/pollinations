#!/usr/bin/env bash
# api-probe — minimal health/latency/auth checks against gen.pollinations.ai
#
# Usage:
#   ./probe.sh                   # run all probes
#   ./probe.sh text              # run a single probe (text|image|audio|models|image-models|video-models)
#   POLLINATIONS_API_KEY=sk_...  # optional; probes run without auth if unset
#   BASE_URL=https://gen.pollinations.ai  # override target (e.g. http://localhost:3000)

set -u
BASE_URL="${BASE_URL:-https://gen.pollinations.ai}"
KEY="${POLLINATIONS_API_KEY:-}"
AUTH=()
if [ -n "$KEY" ]; then AUTH=(-H "Authorization: Bearer $KEY"); fi

# key masking for header
if [ -n "$KEY" ]; then
  MASK="${KEY:0:8}...${KEY: -4}"
else
  MASK="(none)"
fi
echo "== ${BASE_URL} probe (auth: ${MASK}) =="

failed=0

probe() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  local url="${BASE_URL}${path}"
  local tmp; tmp="$(mktemp)"
  local -a args=(-sS -o "$tmp" -w '%{http_code} %{time_total} %{size_download}' -X "$method" "${AUTH[@]}")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  local out; out=$(curl "${args[@]}" "$url" 2>&1) || {
    printf "%-4s %-40s %s\n" "$method" "$path" "NETWORK ERROR: $out"
    rm -f "$tmp"; failed=$((failed+1)); return
  }
  local status time size
  status=$(awk '{print $1}' <<<"$out")
  time=$(awk '{printf "%d", $2*1000}' <<<"$out")
  size=$(awk '{print $3}' <<<"$out")
  local size_h
  if [ "$size" -ge 1024 ]; then size_h="$(awk -v s="$size" 'BEGIN{printf "%.1f KB", s/1024}')"; else size_h="${size} B"; fi
  printf "%-4s %-40s %s %5sms %10s" "$method" "$path" "$status" "$time" "$size_h"

  # diagnosis
  local diag=""
  case "$status" in
    401|403) diag="auth: key missing/revoked or wrong prefix"; failed=$((failed+1));;
    402) diag="out of pollen"; failed=$((failed+1));;
    404) diag="not found — check host/path"; failed=$((failed+1));;
    429) diag="rate limited"; failed=$((failed+1));;
    5*) diag="upstream error"; failed=$((failed+1));;
    000) diag="no response"; failed=$((failed+1));;
  esac
  if [ -n "$diag" ]; then
    local excerpt; excerpt=$(head -c 200 "$tmp" | tr '\n' ' ')
    printf "  → %s | %s" "$diag" "$excerpt"
  fi
  echo
  rm -f "$tmp"
}

run() {
  case "${1:-all}" in
    models|all)       probe "models"       GET  "/v1/models" ;;
    image-models|all) probe "image-models" GET  "/image/models" ;;
    text|all)         probe "text"         POST "/v1/chat/completions" \
                        '{"model":"openai","messages":[{"role":"user","content":"hi"}],"max_tokens":1,"stream":false}' ;;
    image|all)        probe "image"        GET  "/image/test?model=flux&width=64&height=64&nologo=true" ;;
    audio|all)        probe "audio"        GET  "/audio/hi?voice=nova" ;;
    video-models|all) probe "video-models" GET  "/v1/models?capability=video" ;;
  esac
}

if [ $# -eq 0 ]; then run all; else for p in "$@"; do run "$p"; done; fi

echo
if [ "$failed" -eq 0 ]; then echo "all green"; else echo "$failed probe(s) failed"; exit 1; fi

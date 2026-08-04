#!/bin/bash

# Configure OpenClaw to use Pollinations.ai models
# Works on: macOS, Linux, Windows (WSL/Git Bash/MSYS2)
# Usage: curl ... | bash -s -- YOUR_API_KEY

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <POLLINATIONS_API_KEY>"
    echo ""
    echo "Get your API key (with free credits) at: https://enter.pollinations.ai/keys"
    exit 1
fi

API_KEY="$1"

if ! command -v openclaw >/dev/null 2>&1; then
    echo "OpenClaw not found. Install it first:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "jq not found. Install it: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

# --- Step 1: Fresh install — run onboard to create config + workspace ---

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Fresh install — running OpenClaw setup..."
    openclaw onboard \
      --non-interactive \
      --accept-risk \
      --mode local \
      --flow quickstart \
      --auth-choice custom-api-key \
      --custom-base-url "https://gen.pollinations.ai/v1" \
      --custom-provider-id pollinations \
      --custom-model-id kimi \
      --custom-api-key "$API_KEY" \
      --secret-input-mode plaintext \
      --skip-channels \
      --skip-daemon \
      --skip-skills \
      --skip-ui \
      --skip-health \
      2>&1 | grep -v "^$" || true
fi

# --- Step 2: Patch openclaw.json with full Pollinations provider + models ---

echo "Adding Pollinations models..."

# Patch provider + web search into openclaw.json (preserves all other config)
POLLINATIONS_PROVIDER=$(cat <<'EOF'
{
  "baseUrl": "https://gen.pollinations.ai/v1",
  "apiKey": "",
  "api": "openai-completions",
  "models": [
    {
      "id": "moonshotai/kimi-k2.6",
      "name": "Kimi K2.5 — 256K context, vision, tools, reasoning",
      "reasoning": true,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 256000,
      "maxTokens": 8192
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6 — Flagship agentic, vision, reasoning (paid)",
      "reasoning": true,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 262000,
      "maxTokens": 8192
    },
    {
      "id": "deepseek/deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash — Fast reasoning & tool calling (paid)",
      "reasoning": true,
      "input": ["text"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 1000000,
      "maxTokens": 8192
    },
    {
      "id": "deepseek/deepseek-v4-pro",
      "name": "DeepSeek V4 Pro — Advanced reasoning & coding (paid)",
      "reasoning": true,
      "input": ["text"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 65536,
      "maxTokens": 8192
    },
    {
      "id": "z-ai/glm-5.2",
      "name": "GLM 5 — Coding, reasoning, agentic workflows",
      "reasoning": false,
      "input": ["text"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    {
      "id": "gemini-search",
      "name": "Gemini + Search — Web search grounded answers",
      "reasoning": false,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    {
      "id": "anthropic/claude-haiku-4.5",
      "name": "Claude Haiku 4.5 — Fast with good reasoning",
      "reasoning": false,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 200000,
      "maxTokens": 8192
    },
    {
      "id": "anthropic/claude-opus-5",
      "name": "Claude Opus 4.6 — Most intelligent (paid)",
      "reasoning": false,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 200000,
      "maxTokens": 8192
    },
    {
      "id": "google/gemini-3.1-pro-preview",
      "name": "Gemini 3 Pro — 1M context (paid)",
      "reasoning": true,
      "input": ["text", "image"],
      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
      "contextWindow": 1000000,
      "maxTokens": 8192
    }
  ]
}
EOF
)

jq --argjson provider "$POLLINATIONS_PROVIDER" --arg key "$API_KEY" \
  '(.models.providers.pollinations = ($provider | .apiKey = $key)) | .models.mode = "merge" |
   .tools.web.search = {"provider":"perplexity","perplexity":{"baseUrl":"https://gen.pollinations.ai/v1","apiKey":$key,"model":"perplexity-fast"}}' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

# --- Step 3: Set default model + fallbacks via CLI ---

openclaw models set pollinations/moonshotai/kimi-k2.6 >/dev/null
openclaw models fallbacks add pollinations/deepseek/deepseek-v4-flash-0731 >/dev/null
openclaw models fallbacks add pollinations/z-ai/glm-5.2 >/dev/null

# --- Step 4: Restart gateway if running ---

openclaw gateway restart >/dev/null 2>&1 || true

# --- Done ---

MASKED="${API_KEY:0:8}...${API_KEY: -4}"
echo ""
echo "Done! Pollinations.ai is ready."
echo ""
echo "  API Key:   $MASKED"
echo "  Default:   pollinations/moonshotai/kimi-k2.6 (256K context, vision, reasoning)"
echo "  Fallbacks: deepseek/deepseek-v4-flash-0731, z-ai/glm-5.2"
echo ""
echo "  Switch models:  /model pollinations/deepseek/deepseek-v4-flash-0731 or /model pollinations/deepseek/deepseek-v4-pro"
echo "  Your account:   https://enter.pollinations.ai"
echo ""
echo "  Free: moonshotai/kimi-k2.6, z-ai/glm-5.2, gemini-search, anthropic/claude-haiku-4.5"
echo "  Paid: deepseek/deepseek-v4-flash-0731, deepseek/deepseek-v4-pro, anthropic/claude-opus-5, google/gemini-3.1-pro-preview"

#!/bin/bash

# setup-pollinations.sh - Configure OpenClaw to use Pollinations.ai models
# Works on: macOS, Linux, Windows (WSL/Git Bash/MSYS2)
# Usage: ./setup-pollinations.sh <POLLINATIONS_API_KEY>

set -e

# Check if API key is provided
if [ -z "$1" ]; then
    echo "Error: API key is required"
    echo ""
    echo "Usage: $0 <POLLINATIONS_API_KEY>"
    echo ""
    echo "Get your API key (with free credits) at: https://enter.pollinations.ai"
    exit 1
fi

POLLINATIONS_API_KEY="$1"
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Define the configuration
# Kimi K2.5 as primary (256K context, vision + tools + reasoning)
# Multiple models available as fallbacks and alternatives
NEW_CONFIG=$(cat <<EOF
{
  "env": { "POLLINATIONS_API_KEY": "${POLLINATIONS_API_KEY}" },
  "agents": {
    "defaults": {
      "model": {
        "primary": "pollinations/kimi",
        "fallbacks": ["pollinations/openai", "pollinations/gemini"]
      },
      "models": {
        "pollinations/kimi": { "alias": "Kimi K2.5 (Pollinations)" },
        "pollinations/openai": { "alias": "GPT (Pollinations)" },
        "pollinations/gemini": { "alias": "Gemini (Pollinations)" },
        "pollinations/deepseek": { "alias": "DeepSeek (Pollinations)" },
        "pollinations/mistral": { "alias": "Mistral (Pollinations)" },
        "pollinations/claude": { "alias": "Claude (Pollinations)" },
        "pollinations/grok": { "alias": "Grok (Pollinations)" },
        "pollinations/qwen-coder": { "alias": "Qwen Coder (Pollinations)" }
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "pollinations": {
        "baseUrl": "https://gen.pollinations.ai/v1",
        "apiKey": "\${POLLINATIONS_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi",
            "name": "Kimi K2.5 — Flagship agentic model (vision, tools, reasoning)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 256000,
            "maxTokens": 8192
          },
          {
            "id": "openai",
            "name": "GPT — OpenAI GPT (fast, reliable)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "gemini",
            "name": "Gemini — Google Gemini (code execution, thinking)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 1000000,
            "maxTokens": 8192
          },
          {
            "id": "deepseek",
            "name": "DeepSeek — DeepSeek V3 (strong reasoning)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "mistral",
            "name": "Mistral — Mistral Small (vision, fast)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "claude",
            "name": "Claude — Anthropic Claude Sonnet (strong reasoning)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "grok",
            "name": "Grok — xAI Grok (tools, fast)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "qwen-coder",
            "name": "Qwen Coder — Qwen 3 Coder (coding specialist)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
EOF
)

# Merge or create config
if command -v jq >/dev/null 2>&1; then
    if [ -f "$CONFIG_FILE" ]; then
        echo "Merging Pollinations config into existing $CONFIG_FILE..."
        EXISTING_CONFIG=$(cat "$CONFIG_FILE")
        MERGED_CONFIG=$(printf '%s\n%s' "$EXISTING_CONFIG" "$NEW_CONFIG" | jq -s '
            def deep_merge(a; b):
                a as $a | b as $b |
                if ($a | type) == "object" and ($b | type) == "object" then
                    ($a | keys) + ($b | keys) | unique | map(
                        . as $key |
                        if ($a | has($key)) and ($b | has($key)) then
                            { ($key): deep_merge($a[$key]; $b[$key]) }
                        elif ($b | has($key)) then
                            { ($key): $b[$key] }
                        else
                            { ($key): $a[$key] }
                        end
                    ) | add
                else
                    $b
                end;
            deep_merge(.[0]; .[1])
        ')
        printf '%s\n' "$MERGED_CONFIG" > "$CONFIG_FILE"
    else
        echo "Creating new config at $CONFIG_FILE..."
        printf '%s\n' "$NEW_CONFIG" | jq '.' > "$CONFIG_FILE"
    fi
else
    echo "Note: jq not installed. Using simple file creation."
    if [ -f "$CONFIG_FILE" ]; then
        TIMESTAMP=$(date +%Y%m%d%H%M%S 2>/dev/null || date +%s)
        BACKUP_FILE="${CONFIG_FILE}.${TIMESTAMP}.bak"
        cp "$CONFIG_FILE" "$BACKUP_FILE"
        echo "Backed up existing config to: $BACKUP_FILE"
    fi
    echo "Creating config at $CONFIG_FILE..."
    printf '%s\n' "$NEW_CONFIG" > "$CONFIG_FILE"
fi

if [ ${#POLLINATIONS_API_KEY} -gt 12 ]; then
    MASKED_KEY="${POLLINATIONS_API_KEY:0:8}...${POLLINATIONS_API_KEY: -4}"
else
    MASKED_KEY="${POLLINATIONS_API_KEY:0:4}..."
fi

echo ""
echo "🧬 Pollinations.ai configured for OpenClaw!"
echo ""
echo "  Config:  $CONFIG_FILE"
echo "  API Key: $MASKED_KEY"
echo ""
echo "  Primary model: Kimi K2.5 (256K context, vision, tools, reasoning)"
echo "  Fallbacks:     GPT, Gemini"
echo "  Also available: DeepSeek, Mistral, Claude, Grok, Qwen Coder"
echo ""
echo "  Switch models in chat: /model pollinations/gemini"
echo "  Manage your account:   https://enter.pollinations.ai"
echo ""

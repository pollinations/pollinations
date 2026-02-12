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
        "fallbacks": ["pollinations/deepseek", "pollinations/glm"]
      },
      "models": {
        "pollinations/kimi": { "alias": "Kimi K2.5 (Pollinations)" },
        "pollinations/deepseek": { "alias": "DeepSeek V3.2 (Pollinations)" },
        "pollinations/glm": { "alias": "GLM-4.7 (Pollinations)" },
        "pollinations/gemini-fast": { "alias": "Gemini Flash Lite (Pollinations)" },
        "pollinations/claude-fast": { "alias": "Claude Haiku 4.5 (Pollinations)" },
        "pollinations/claude-large": { "alias": "Claude Opus 4.6 (Pollinations, paid)" },
        "pollinations/gemini-large": { "alias": "Gemini 3 Pro (Pollinations, paid)" }
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
            "id": "deepseek",
            "name": "DeepSeek V3.2 — Strong reasoning & tool calling",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "glm",
            "name": "GLM-4.7 — Coding, reasoning, agentic workflows",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "gemini-fast",
            "name": "Gemini 2.5 Flash Lite — Fast, vision support",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 8192
          },
          {
            "id": "claude-fast",
            "name": "Claude Haiku 4.5 — Fast with good reasoning",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-large",
            "name": "Claude Opus 4.6 — Most Intelligent (Paid)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "gemini-large",
            "name": "Gemini 3 Pro — Most Intelligent with 1M Context (Paid)",
            "reasoning": true,
            "input": ["text", "image", "audio", "video"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 1000000,
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
echo "  Fallbacks:     DeepSeek V3.2, GLM-4.7"
echo "  Also available: Gemini Flash Lite, Claude Haiku 4.5, + premium models"
echo ""
echo "  Switch models in chat: /model pollinations/gemini"
echo "  Manage your account:   https://enter.pollinations.ai"
echo ""
if ! command -v openclaw >/dev/null 2>&1; then
    echo "Next: Install OpenClaw with:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
else
    echo "Next: Restart OpenClaw to pick up the new config:"
    echo "  openclaw onboard --install-daemon"
fi

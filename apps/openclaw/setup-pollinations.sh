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
        "pollinations/gemini-search": { "alias": "Gemini + Search (Pollinations)" },
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
            "contextLength": 256000
          },
          {
            "id": "deepseek",
            "name": "DeepSeek V3.2 — Strong reasoning & tool calling",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 128000
          },
          {
            "id": "glm",
            "name": "GLM-4.7 — Coding, reasoning, agentic workflows",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 128000
          },
          {
            "id": "gemini-search",
            "name": "Gemini + Search — Web search grounded answers",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 128000
          },
          {
            "id": "claude-fast",
            "name": "Claude Haiku 4.5 — Fast with good reasoning",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 200000
          },
          {
            "id": "claude-large",
            "name": "Claude Opus 4.6 — Most Intelligent (Paid)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 200000
          },
          {
            "id": "gemini-large",
            "name": "Gemini 3 Pro — Most Intelligent with 1M Context (Paid)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextLength": 1000000
          }
        ]
      }
    }
  },
  "tools": {
    "web": {
      "search": {
        "provider": "perplexity",
        "perplexity": {
          "baseUrl": "https://gen.pollinations.ai/v1",
          "apiKey": "\${POLLINATIONS_API_KEY}",
          "model": "perplexity-fast"
        }
      }
    }
  }
}
EOF
)

# Require jq for JSON merging
if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required. Install it with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

# Merge or create config
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
        # If existing config already has a search provider, keep it intact
        .[0] as $old | .[1] as $new |
        (if $old.tools.web.search.provider // null
         then $new | .tools.web.search = $old.tools.web.search
         else $new end) as $adjusted |
        deep_merge($old; $adjusted)
    ')
    printf '%s\n' "$MERGED_CONFIG" > "$CONFIG_FILE"
else
    echo "Creating new config at $CONFIG_FILE..."
    printf '%s\n' "$NEW_CONFIG" | jq '.' > "$CONFIG_FILE"
fi

# Ensure gateway.mode is set (required for fresh installs)
if command -v openclaw >/dev/null 2>&1; then
    CURRENT_MODE=$(openclaw config get gateway.mode 2>/dev/null | grep -o '"[a-z]*"' | tr -d '"' || true)
    if [ -z "$CURRENT_MODE" ] || [ "$CURRENT_MODE" = "null" ]; then
        openclaw config set gateway.mode local >/dev/null 2>&1 || true
    fi
fi

MASKED_KEY="${POLLINATIONS_API_KEY:0:8}...${POLLINATIONS_API_KEY: -4}"

echo ""
echo "🧬 Pollinations.ai configured for OpenClaw!"
echo ""
echo "  Config:  $CONFIG_FILE"
echo "  API Key: $MASKED_KEY"
echo ""
echo "  Primary model: Kimi K2.5 (256K context, vision, tools, reasoning)"
echo "  Fallbacks:     DeepSeek V3.2, GLM-4.7"
echo "  Web search:    Gemini + Search, plus web_search tool (Perplexity via Pollinations)"
echo "  Also available: Claude Haiku 4.5, + premium models"
echo ""
echo "  Switch models in chat: /model pollinations/gemini-search"
echo "  Manage your account:   https://enter.pollinations.ai"
echo ""
if ! command -v openclaw >/dev/null 2>&1; then
    echo "Next: Install OpenClaw with:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
else
    echo "Restarting OpenClaw gateway..."
    openclaw gateway restart 2>/dev/null && echo "  ✓ Gateway restarted" || echo "  Run: openclaw gateway restart"
fi

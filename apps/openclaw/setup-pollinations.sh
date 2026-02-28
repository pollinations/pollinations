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
# All available text models from Pollinations API
# Kimi K2.5 as primary (256K context, vision + tools + reasoning)
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
        "pollinations/glm": { "alias": "GLM-5 (Pollinations)" },
        "pollinations/openai": { "alias": "GPT-5 Mini (Pollinations)" },
        "pollinations/openai-fast": { "alias": "GPT-5 Nano (Pollinations)" },
        "pollinations/openai-large": { "alias": "GPT-5.2 (Pollinations, paid)" },
        "pollinations/openai-audio": { "alias": "GPT-4o Audio (Pollinations)" },
        "pollinations/gemini": { "alias": "Gemini 3 Flash (Pollinations, paid)" },
        "pollinations/gemini-fast": { "alias": "Gemini Flash Lite (Pollinations)" },
        "pollinations/gemini-search": { "alias": "Gemini + Search (Pollinations)" },
        "pollinations/gemini-large": { "alias": "Gemini 3 Pro (Pollinations, paid)" },
        "pollinations/claude-fast": { "alias": "Claude Haiku 4.5 (Pollinations)" },
        "pollinations/claude": { "alias": "Claude Sonnet 4.6 (Pollinations, paid)" },
        "pollinations/claude-large": { "alias": "Claude Opus 4.6 (Pollinations, paid)" },
        "pollinations/grok": { "alias": "Grok 4 Fast (Pollinations, paid)" },
        "pollinations/mistral": { "alias": "Mistral Small 3.2 (Pollinations)" },
        "pollinations/qwen-coder": { "alias": "Qwen3 Coder (Pollinations)" },
        "pollinations/minimax": { "alias": "MiniMax M2.1 (Pollinations)" },
        "pollinations/nova-fast": { "alias": "Nova Micro (Pollinations)" },
        "pollinations/perplexity-fast": { "alias": "Perplexity Sonar (Pollinations)" },
        "pollinations/perplexity-reasoning": { "alias": "Perplexity Reasoning (Pollinations)" },
        "pollinations/nomnom": { "alias": "NomNom Web Research (Pollinations)" },
        "pollinations/polly": { "alias": "Polly AI Assistant (Pollinations)" }
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
            "contextWindow": 256000
          },
          {
            "id": "deepseek",
            "name": "DeepSeek V3.2 — Efficient reasoning & agentic AI",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "glm",
            "name": "GLM-5 — 744B MoE, long context reasoning & agentic workflows",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 198000
          },
          {
            "id": "openai",
            "name": "OpenAI GPT-5 Mini — Fast & balanced",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "openai-fast",
            "name": "OpenAI GPT-5 Nano — Ultra fast & affordable",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "openai-large",
            "name": "OpenAI GPT-5.2 — Most powerful & intelligent (Paid)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "openai-audio",
            "name": "OpenAI GPT-4o Mini Audio — Voice input & output",
            "reasoning": false,
            "input": ["text", "image", "audio"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "gemini",
            "name": "Gemini 3 Flash — Pro-grade reasoning at flash speed (Paid)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "gemini-fast",
            "name": "Gemini 2.5 Flash Lite — Ultra fast & cost-effective",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "gemini-search",
            "name": "Gemini + Search — Web search grounded answers",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "gemini-large",
            "name": "Gemini 3 Pro — Most intelligent with 1M context (Paid)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 1000000
          },
          {
            "id": "claude-fast",
            "name": "Claude Haiku 4.5 — Fast & intelligent",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000
          },
          {
            "id": "claude",
            "name": "Claude Sonnet 4.6 — Most capable & balanced (Paid)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000
          },
          {
            "id": "claude-large",
            "name": "Claude Opus 4.6 — Most intelligent (Paid)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000
          },
          {
            "id": "grok",
            "name": "Grok 4 Fast — High speed & real-time (Paid)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "mistral",
            "name": "Mistral Small 3.2 — Efficient & cost-effective",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "qwen-coder",
            "name": "Qwen3 Coder 30B — Specialized for code generation",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "minimax",
            "name": "MiniMax M2.1 — Multi-language & agent workflows",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000
          },
          {
            "id": "nova-fast",
            "name": "Amazon Nova Micro — Ultra fast & ultra cheap",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "perplexity-fast",
            "name": "Perplexity Sonar — Fast web search",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "perplexity-reasoning",
            "name": "Perplexity Sonar Reasoning — Advanced reasoning with web search",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "nomnom",
            "name": "NomNom — Web research with search, scrape & crawl",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
          },
          {
            "id": "polly",
            "name": "Polly — Pollinations AI assistant with code search & web tools",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000
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
echo "  Fallbacks:     DeepSeek V3.2, GLM-5"
echo "  23 models:     OpenAI, Gemini, Claude, DeepSeek, Grok, Mistral, Qwen, MiniMax, Nova + more"
echo "  Web search:    Gemini + Search, Perplexity Sonar, NomNom"
echo ""
echo "  Switch models in chat: /model pollinations/gemini-search"
echo "  All models:            https://gen.pollinations.ai/v1/models"
echo "  Manage your account:   https://enter.pollinations.ai"
echo ""
if ! command -v openclaw >/dev/null 2>&1; then
    echo "Next: Install OpenClaw with:"
    echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
else
    echo "Restarting OpenClaw gateway..."
    openclaw gateway restart 2>/dev/null && echo "  ✓ Gateway restarted" || echo "  Run: openclaw gateway restart"
fi

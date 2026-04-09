#!/bin/bash

# Configure Hermes Agent to use Pollinations.ai models
# Works on: macOS, Linux, Windows (WSL/Git Bash/MSYS2)
# Usage: curl ... | bash -s -- YOUR_API_KEY

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <POLLINATIONS_API_KEY>"
    echo ""
    echo "Get your API key (with free credits) at: https://enter.pollinations.ai"
    exit 1
fi

API_KEY="$1"

if ! command -v hermes >/dev/null 2>&1; then
    echo "Hermes Agent not found. Install it first:"
    echo "  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash"
    exit 1
fi

CONFIG_DIR="${HOME}/.hermes"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"

# --- Step 1: Fresh install — run init to create config ---

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Fresh install — running Hermes setup..."
    mkdir -p "$CONFIG_DIR"
    hermes init --non-interactive 2>&1 | grep -v "^$" || true
fi

# --- Step 2: Write Pollinations provider config into config.yaml ---

echo "Adding Pollinations models..."

# Check if pollinations provider already exists
if grep -q "name: pollinations" "$CONFIG_FILE" 2>/dev/null; then
    echo "Pollinations provider already configured. Updating API key..."
    # Update just the API key for the pollinations provider block
    if command -v sed >/dev/null 2>&1; then
        # Find the pollinations provider section and update api_key
        sed -i.bak "s|api_key: .*# pollinations|api_key: ${API_KEY} # pollinations|g" "$CONFIG_FILE"
        rm -f "${CONFIG_FILE}.bak"
    fi
else
    # Append pollinations provider config
    cat >> "$CONFIG_FILE" << YAML

# --- Pollinations.ai provider (added by setup script) ---
model:
  provider: custom
  default: kimi
  base_url: https://gen.pollinations.ai/v1
  api_key: ${API_KEY} # pollinations
  context_length: 256000

custom_providers:
  - name: pollinations
    base_url: https://gen.pollinations.ai/v1
    api_key: ${API_KEY} # pollinations
    api_mode: chat_completions
    models:
      kimi:
        context_length: 256000
      deepseek:
        context_length: 128000
      glm:
        context_length: 128000
      gemini-search:
        context_length: 128000
      claude-fast:
        context_length: 200000
      claude-large:
        context_length: 200000
      gemini-large:
        context_length: 1000000

fallback_model:
  provider: custom
  model: deepseek
  base_url: https://gen.pollinations.ai/v1
  api_key: ${API_KEY} # pollinations

mcp_servers:
  pollinations:
    command: "npx"
    args: ["-y", "@pollinations_ai/model-context-protocol"]
YAML
fi

# --- Step 3: Set default model via CLI ---

hermes model custom:pollinations:kimi >/dev/null 2>&1 || true

# --- Step 4: Restart if running ---

hermes restart >/dev/null 2>&1 || true

# --- Done ---

MASKED="${API_KEY:0:8}...${API_KEY: -4}"
echo ""
echo "Done! Pollinations.ai is ready."
echo ""
echo "  API Key:   $MASKED"
echo "  Default:   pollinations:kimi (256K context, vision, reasoning)"
echo "  Fallbacks: deepseek, glm"
echo ""
echo "  Switch models:  /model custom:pollinations:deepseek"
echo "  Your account:   https://enter.pollinations.ai"
echo ""
echo "  Free: kimi, deepseek, glm, gemini-search, claude-fast"
echo "  Paid: claude-large, gemini-large"
echo ""
echo "  MCP (image/audio/video): hermes mcp add pollinations -- npx -y @pollinations_ai/model-context-protocol"

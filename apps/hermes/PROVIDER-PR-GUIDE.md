# Pollinations Built-in Provider PR Guide for Hermes Agent

Reference document for submitting Pollinations as a first-class built-in provider to [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).

**Target repo:** `NousResearch/hermes-agent`
**Branch name:** `feat/pollinations-provider`
**Commit message:** `feat(providers): add Pollinations as LLM provider`
**Reference PR:** DeepInfra PR #5521
**Related issue:** #6187 (OpenAI-compatible aggregators)

---

## Step 0: File the GitHub Issue First

Open a new issue on `NousResearch/hermes-agent` before creating the PR.

**Title:** `feat: Add Pollinations as built-in LLM provider`

**Body:**

```markdown
## Summary

Add Pollinations (https://pollinations.ai) as a built-in provider in Hermes Agent.

Pollinations is an OpenAI-compatible API aggregator that routes to 25+ models from
OpenAI, Google, Anthropic, DeepSeek, Moonshot, and others through a single endpoint.

## Why

- Addresses #6187 (OpenAI-compatible aggregators)
- Single API key gives access to models from multiple providers (GPT-5.4, Gemini 3, Claude Opus, DeepSeek V3.2, Kimi K2.5, etc.)
- Free tier available with generous limits
- Full OpenAI-compatible `/v1/chat/completions` and `/v1/models` endpoints
- Supports streaming, tool calling, vision, and structured output

## Details

- **Base URL:** `https://gen.pollinations.ai/v1`
- **Auth:** Bearer token with `pk_` (publishable) or `sk_` (secret) prefix
- **Models endpoint:** `GET /v1/models`
- **API docs:** https://gen.pollinations.ai/api/docs
- **Get API key:** https://enter.pollinations.ai
```

Note the issue number for use in the PR description.

---

## Step 1: `hermes_cli/auth.py`

Add a `ProviderConfig` entry to the `PROVIDER_CONFIGS` dict.

```python
# In PROVIDER_CONFIGS dict, add:

"pollinations": ProviderConfig(
    id="pollinations",
    display_name="Pollinations",
    auth_type="api_key",
    inference_base_url="https://gen.pollinations.ai/v1",
    api_key_env_vars=["POLLINATIONS_API_KEY"],
    api_key_url="https://enter.pollinations.ai",
    api_key_instructions="Sign up at enter.pollinations.ai to get a free API key (pk_ or sk_ prefix).",
),
```

---

## Step 2: `hermes_cli/providers.py`

### 2a: Add HermesOverlay

Add to the `HERMES_OVERLAYS` dict:

```python
"pollinations": HermesOverlay(
    transport="openai_chat",
    is_aggregator=True,
    base_url_env_var="POLLINATIONS_BASE_URL",
    default_base_url="https://gen.pollinations.ai/v1",
),
```

### 2b: Add alias

Add to the `PROVIDER_ALIASES` dict:

```python
"pollen": "pollinations",
```

### 2c: Add label

Add to the `PROVIDER_LABELS` dict:

```python
"pollinations": "Pollinations",
```

---

## Step 3: `hermes_cli/models.py`

Add curated model list to `_PROVIDER_MODELS`. These are the models Hermes will show in its model picker.

```python
"pollinations": [
    # --- Free tier models ---
    ModelInfo(
        id="openai",
        name="GPT-5.4 Nano",
        context_length=400_000,
        supports_tools=True,
        supports_vision=True,
        description="OpenAI GPT-5.4 Nano - Fast & balanced (default)",
    ),
    ModelInfo(
        id="openai-fast",
        name="GPT-5 Nano",
        context_length=400_000,
        supports_tools=True,
        supports_vision=True,
        description="OpenAI GPT-5 Nano - Ultra fast & affordable",
    ),
    ModelInfo(
        id="deepseek",
        name="DeepSeek V3.2",
        context_length=128_000,
        supports_tools=True,
        supports_vision=False,
        description="DeepSeek V3.2 - Strong reasoning & tool calling",
    ),
    ModelInfo(
        id="kimi",
        name="Kimi K2.5",
        context_length=256_000,
        supports_tools=True,
        supports_vision=True,
        description="Moonshot Kimi K2.5 - 256K context, vision, reasoning",
    ),
    ModelInfo(
        id="gemini",
        name="Gemini 3 Flash",
        context_length=1_000_000,
        supports_tools=True,
        supports_vision=True,
        description="Google Gemini 3 Flash - Fast with code execution",
    ),
    ModelInfo(
        id="gemini-search",
        name="Gemini Search",
        context_length=128_000,
        supports_tools=True,
        supports_vision=True,
        description="Google Gemini with web search grounding",
    ),
    ModelInfo(
        id="claude-fast",
        name="Claude Haiku 4.5",
        context_length=200_000,
        supports_tools=True,
        supports_vision=True,
        description="Anthropic Claude Haiku 4.5 - Fast with good reasoning",
    ),
    ModelInfo(
        id="qwen-coder",
        name="Qwen3 Coder",
        context_length=128_000,
        supports_tools=True,
        supports_vision=False,
        description="Qwen3 Coder - Optimized for coding tasks",
    ),
    ModelInfo(
        id="glm",
        name="GLM-5",
        context_length=128_000,
        supports_tools=True,
        supports_vision=False,
        description="Zhipu GLM-5 - Coding, reasoning, agentic workflows",
    ),
    ModelInfo(
        id="mistral",
        name="Mistral Small 3.2",
        context_length=128_000,
        supports_tools=True,
        supports_vision=True,
        description="Mistral Small 3.2 - Efficient multilingual model",
    ),
    # --- Paid tier models ---
    ModelInfo(
        id="openai-large",
        name="GPT-5.4",
        context_length=400_000,
        supports_tools=True,
        supports_vision=True,
        description="OpenAI GPT-5.4 - Most powerful reasoning (paid)",
    ),
    ModelInfo(
        id="claude",
        name="Claude Sonnet 4.6",
        context_length=200_000,
        supports_tools=True,
        supports_vision=True,
        description="Anthropic Claude Sonnet 4.6 - Balanced (paid)",
    ),
    ModelInfo(
        id="claude-large",
        name="Claude Opus 4.6",
        context_length=200_000,
        supports_tools=True,
        supports_vision=True,
        description="Anthropic Claude Opus 4.6 - Most intelligent (paid)",
    ),
    ModelInfo(
        id="gemini-large",
        name="Gemini 3.1 Pro",
        context_length=1_000_000,
        supports_tools=True,
        supports_vision=True,
        description="Google Gemini 3.1 Pro - 1M context (paid)",
    ),
    ModelInfo(
        id="grok",
        name="Grok 4.1 Fast",
        context_length=128_000,
        supports_tools=True,
        supports_vision=False,
        description="xAI Grok 4.1 - Fast non-reasoning (paid)",
    ),
    ModelInfo(
        id="perplexity-fast",
        name="Perplexity Sonar",
        context_length=128_000,
        supports_tools=False,
        supports_vision=False,
        description="Perplexity Sonar - Web search with citations (paid)",
    ),
],
```

---

## Step 4: `hermes_cli/runtime_provider.py`

Add Pollinations to the runtime resolution function. Find the section that resolves provider configs at runtime and add:

```python
if provider_id == "pollinations":
    return RuntimeProviderConfig(
        api_mode="chat_completions",
        base_url=os.environ.get("POLLINATIONS_BASE_URL", "https://gen.pollinations.ai/v1"),
        api_key=os.environ.get("POLLINATIONS_API_KEY", ""),
    )
```

---

## Step 5: `hermes_cli/main.py`

Add `"pollinations"` to:

1. The `--provider` CLI argument choices list
2. The interactive provider selection menu (display as "Pollinations (25+ models - OpenAI, Google, Anthropic, DeepSeek, etc.)")

Find the provider selection section and add the entry in the appropriate position (alphabetical or grouped with other aggregators).

---

## Step 6: `hermes_cli/config.py`

Add environment variables to `OPTIONAL_ENV_VARS`:

```python
"POLLINATIONS_API_KEY": "API key for Pollinations (get at enter.pollinations.ai)",
"POLLINATIONS_BASE_URL": "Custom base URL for Pollinations (default: https://gen.pollinations.ai/v1)",
```

---

## Step 7: `agent/auxiliary_client.py`

Add a default auxiliary model for Pollinations. This is the model used for background tasks (summaries, title generation, etc.):

```python
# In the default aux model mapping:
"pollinations": "openai-fast",  # GPT-5 Nano - cheap & fast for aux tasks
```

---

## Step 8: `agent/model_metadata.py`

### 8a: Add provider prefix

```python
# In PROVIDER_PREFIXES:
"pollinations": "pollinations/",
```

### 8b: Add URL mapping

```python
# In PROVIDER_URLS:
"pollinations": "https://gen.pollinations.ai/v1",
```

---

## Step 9: `.env.example`

Add at the end of the file:

```bash
# Pollinations - OpenAI-compatible aggregator (25+ models)
# Get your API key at: https://enter.pollinations.ai
# POLLINATIONS_API_KEY=pk_your_key_here
# POLLINATIONS_BASE_URL=https://gen.pollinations.ai/v1
```

---

## Step 10: `tests/hermes_cli/test_api_key_providers.py`

Add test cases:

```python
def test_pollinations_provider_config():
    """Test that the Pollinations provider config is correctly defined."""
    config = PROVIDER_CONFIGS["pollinations"]
    assert config.id == "pollinations"
    assert config.auth_type == "api_key"
    assert config.inference_base_url == "https://gen.pollinations.ai/v1"
    assert "POLLINATIONS_API_KEY" in config.api_key_env_vars


def test_pollinations_overlay():
    """Test that the Pollinations overlay is correctly defined."""
    overlay = HERMES_OVERLAYS["pollinations"]
    assert overlay.transport == "openai_chat"
    assert overlay.is_aggregator is True


def test_pollinations_models():
    """Test that Pollinations has a curated model list."""
    models = _PROVIDER_MODELS["pollinations"]
    model_ids = [m.id for m in models]
    assert "openai" in model_ids
    assert "deepseek" in model_ids
    assert "kimi" in model_ids
    assert "claude-fast" in model_ids
    assert "gemini" in model_ids


def test_pollinations_alias():
    """Test that 'pollen' is an alias for 'pollinations'."""
    assert PROVIDER_ALIASES["pollen"] == "pollinations"


def test_pollinations_runtime_resolution(monkeypatch):
    """Test runtime provider resolution for Pollinations."""
    monkeypatch.setenv("POLLINATIONS_API_KEY", "pk_test_key_123")
    config = resolve_runtime_provider("pollinations")
    assert config.api_mode == "chat_completions"
    assert config.base_url == "https://gen.pollinations.ai/v1"
    assert config.api_key == "pk_test_key_123"
```

---

## PR Description Template

Use this when creating the pull request:

**Title:** `feat(providers): add Pollinations as built-in LLM provider`

**Body:**

```markdown
## Summary

- Adds Pollinations as a first-class built-in provider
- Pollinations is an OpenAI-compatible aggregator routing to 25+ models (GPT-5.4, Gemini 3, Claude 4.6, DeepSeek V3.2, Kimi K2.5, Grok 4.1, etc.) through a single API key
- Configured as `is_aggregator=True` using `openai_chat` transport
- Includes 16 curated models spanning free and paid tiers

Fixes #ISSUE_NUMBER
Addresses #6187

## Changes

- `hermes_cli/auth.py` - ProviderConfig with `api_key` auth type
- `hermes_cli/providers.py` - HermesOverlay (aggregator), alias `pollen`, label
- `hermes_cli/models.py` - 16 curated models with context lengths and capability flags
- `hermes_cli/runtime_provider.py` - Runtime resolution returning `chat_completions` mode
- `hermes_cli/main.py` - Provider selection menu and CLI choices
- `hermes_cli/config.py` - `POLLINATIONS_API_KEY` and `POLLINATIONS_BASE_URL` env vars
- `agent/auxiliary_client.py` - Default aux model (`openai-fast`)
- `agent/model_metadata.py` - Provider prefix and URL mapping
- `.env.example` - Commented-out config section
- `tests/hermes_cli/test_api_key_providers.py` - 5 test cases

## Test plan

- [ ] `pytest tests/hermes_cli/test_api_key_providers.py -v`
- [ ] `hermes --provider pollinations` launches and shows model picker
- [ ] `hermes model pollinations:kimi` sets model correctly
- [ ] `hermes model pollinations:openai` sets model correctly
- [ ] Chat completion works with streaming
- [ ] Tool calling works (test with a simple tool)
- [ ] `/model` command shows all 16 Pollinations models
- [ ] `pollen` alias resolves to `pollinations`

## Verification

```bash
# Quick smoke test (requires POLLINATIONS_API_KEY env var)
export POLLINATIONS_API_KEY=pk_your_key
curl -s https://gen.pollinations.ai/v1/models -H "Authorization: Bearer $POLLINATIONS_API_KEY" | python -m json.tool | head -20
curl -s https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Say hello"}],"stream":true}'
```

## Links

- API docs: https://gen.pollinations.ai/api/docs
- Get API key: https://enter.pollinations.ai
- Models: https://gen.pollinations.ai/v1/models
- OpenAI compatibility: Full `/v1/chat/completions` with streaming, tools, vision, structured output
```

---

## Git Commands

```bash
# Clone and branch
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
git checkout -b feat/pollinations-provider

# Make all changes from Steps 1-10 above

# Run tests
pytest tests/hermes_cli/test_api_key_providers.py -v

# Commit
git add hermes_cli/auth.py hermes_cli/providers.py hermes_cli/models.py \
    hermes_cli/runtime_provider.py hermes_cli/main.py hermes_cli/config.py \
    agent/auxiliary_client.py agent/model_metadata.py .env.example \
    tests/hermes_cli/test_api_key_providers.py

git commit -m "feat(providers): add Pollinations as LLM provider

Add Pollinations as a built-in provider with 16 curated models.
Pollinations is an OpenAI-compatible aggregator routing to GPT-5.4,
Gemini 3, Claude 4.6, DeepSeek V3.2, Kimi K2.5, and more.

Fixes #ISSUE_NUMBER"

# Push and create PR
git push -u origin feat/pollinations-provider
gh pr create --title "feat(providers): add Pollinations as built-in LLM provider" \
    --body "$(cat pr-description.md)"
```

---

## Key Technical Notes

1. **Aggregator flag is critical.** `is_aggregator=True` tells Hermes that model IDs are Pollinations-specific (not from models.dev catalog). Without this, Hermes will try to resolve `openai`, `kimi`, etc. against the models.dev catalog and fail.

2. **Model IDs are Pollinations aliases, not upstream model names.** Pollinations uses simplified aliases (`openai` not `gpt-5.4-nano`, `deepseek` not `DeepSeek-V3.2`). The `/v1/models` endpoint returns these aliases.

3. **Auth token format.** Keys use `pk_` (publishable, for frontend) or `sk_` (secret, for backend) prefix. Both work as Bearer tokens.

4. **Free tier exists.** Users get free credits on signup at enter.pollinations.ai. No credit card required. This makes it easy for Hermes users to try Pollinations without commitment.

5. **The 3-layer provider system.** Hermes resolves providers through: models.dev catalog (upstream) -> Hermes overlays (built-in config) -> user config (~/.hermes/config.yaml). Our changes live in the Hermes overlay layer.

6. **Streaming support.** Pollinations supports SSE streaming on `/v1/chat/completions` with `"stream": true`. This is the default for Hermes interactive mode.

7. **Tool calling.** Most Pollinations models support OpenAI-format tool calling. The `supports_tools` flag in ModelInfo controls whether Hermes offers tool use for each model.

8. **Dynamic model list.** While we ship 16 curated models, users can access any model from `GET /v1/models` by specifying the model ID directly. The curated list is what shows in the Hermes model picker.

---

## Current Pollinations Model Inventory (as of 2026-04-09)

For reference, the full list of models available at `https://gen.pollinations.ai/v1/models`:

| Pollinations ID | Upstream Model | Provider | Context | Tools | Vision |
|---|---|---|---|---|---|
| openai | GPT-5.4 Nano | Azure/OpenAI | 400K | Yes | Yes |
| openai-fast | GPT-5 Nano | Azure/OpenAI | 400K | Yes | Yes |
| openai-large | GPT-5.4 | Azure/OpenAI | 400K | Yes | Yes |
| deepseek | DeepSeek V3.2 | DeepSeek | 128K | Yes | No |
| kimi | Kimi K2.5 | Moonshot | 256K | Yes | Yes |
| gemini | Gemini 3 Flash | Google | 1M | Yes | Yes |
| gemini-fast | Gemini 2.5 Flash Lite | Google | 128K | Yes | Yes |
| gemini-large | Gemini 3.1 Pro | Google | 1M | Yes | Yes |
| gemini-search | Gemini 2.5 Flash Lite + Search | Google | 128K | Yes | Yes |
| claude-fast | Claude Haiku 4.5 | Anthropic | 200K | Yes | Yes |
| claude | Claude Sonnet 4.6 | Anthropic | 200K | Yes | Yes |
| claude-large | Claude Opus 4.6 | Anthropic | 200K | Yes | Yes |
| qwen-coder | Qwen3 Coder 30B | Alibaba | 128K | Yes | No |
| qwen-large | Qwen3.5 Plus | Alibaba | 128K | Yes | No |
| qwen-vision | Qwen3 VL Plus | Alibaba | 128K | Yes | Yes |
| glm | GLM-5 | Zhipu | 128K | Yes | No |
| mistral | Mistral Small 3.2 | Mistral | 128K | Yes | Yes |
| mistral-large | Mistral Large 3 | Mistral | 128K | Yes | Yes |
| grok | Grok 4.1 Fast | xAI | 128K | Yes | No |
| grok-large | Grok 4.20 Reasoning | xAI | 128K | Yes | No |
| minimax | MiniMax M2.5 | MiniMax | 128K | Yes | No |
| nova | Nova 2 Lite | Amazon | 128K | Yes | No |
| nova-fast | Nova Micro | Amazon | 128K | Yes | No |
| perplexity-fast | Sonar | Perplexity | 128K | No | No |
| perplexity-reasoning | Sonar Reasoning Pro | Perplexity | 128K | No | No |

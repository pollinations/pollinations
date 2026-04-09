# Hermes Agent Self-Evolution via Pollinations

Run the [hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) pipeline using Pollinations as the sole model backend. No direct OpenAI/Anthropic keys needed.

## Prerequisites

```bash
git clone https://github.com/NousResearch/hermes-agent-self-evolution.git
cd hermes-agent-self-evolution
pip install -e ".[dev]"

export HERMES_AGENT_REPO=~/.hermes/hermes-agent
```

Get a Pollinations API key at [enter.pollinations.ai](https://enter.pollinations.ai).

## How the Pipeline Uses Models

The self-evolution pipeline has distinct model roles, each making standard OpenAI-compatible API calls via DSPy's LiteLLM backend:

| Role | What It Does | Needs |
|------|-------------|-------|
| **Optimizer (GEPA Mutator/Reflector)** | Reads execution traces, diagnoses failures, proposes improved skill text | Strong reasoning, large context |
| **Evaluator (LLM-as-Judge)** | Scores agent outputs on correctness, procedure-following, conciseness | Consistent scoring, fast |
| **Dataset Generator** | Reads skill files and generates synthetic (task, rubric) pairs | Creative, instruction-following |
| **Task Executor** | Runs the skill-under-test on evaluation tasks | General capability |

## Pointing DSPy at Pollinations

DSPy uses LiteLLM under the hood. Pollinations exposes an OpenAI-compatible endpoint at `https://gen.pollinations.ai/v1/`. Use the `openai/` prefix in the model string and pass `api_base` + `api_key`:

### Environment Variables

```bash
# Required
export POLLINATIONS_API_KEY="sk_your_key_here"

# Optional: set as default OpenAI credentials so DSPy picks them up automatically
export OPENAI_API_KEY="$POLLINATIONS_API_KEY"
export OPENAI_API_BASE="https://gen.pollinations.ai/v1/"
```

### Python Configuration

```python
import dspy

# Configure a Pollinations-backed LM
def pollinations_lm(model: str, **kwargs) -> dspy.LM:
    """Create a DSPy LM pointing at Pollinations.

    Args:
        model: Pollinations model name (e.g. "openai", "openai-large", "gemini").
               Gets prefixed with "openai/" for LiteLLM routing.
    """
    return dspy.LM(
        model=f"openai/{model}",
        api_base="https://gen.pollinations.ai/v1/",
        api_key=os.environ["POLLINATIONS_API_KEY"],
        **kwargs,
    )

# Set the default LM for all DSPy operations
lm = pollinations_lm("openai")
dspy.configure(lm=lm)
```

## Model Mapping: Evolution Roles to Pollinations Models

### Recommended Configuration (Best Quality)

| Evolution Role | Pollinations Model | Model ID | Why |
|---------------|-------------------|----------|-----|
| **GEPA Optimizer/Reflector** | `openai-large` | gpt-5.4 | Strongest reasoning for trace analysis and mutation |
| **LLM-as-Judge Evaluator** | `openai` | gpt-5.4-nano | Fast, consistent scoring at low cost |
| **Dataset Generator** | `openai-large` | gpt-5.4 | Needs creativity + instruction-following for rubrics |
| **Task Executor** | `openai` | gpt-5.4-nano | General capability, high throughput |
| **GEPA Reflection LM** | `gemini-large` | gemini-3.1-pro | Diversity from different model family |

### Budget Configuration (Lowest Cost)

| Evolution Role | Pollinations Model | Model ID | Why |
|---------------|-------------------|----------|-----|
| **GEPA Optimizer** | `openai` | gpt-5.4-nano | Good enough for mutations |
| **Evaluator** | `openai-fast` | gpt-5-nano | Ultra cheap scoring |
| **Dataset Generator** | `openai` | gpt-5.4-nano | Adequate for synthetic data |
| **Task Executor** | `openai-fast` | gpt-5-nano | Cheapest option |

### Maximum Diversity Configuration (Best for GEPA)

GEPA benefits from model diversity in its mutation pool — different models propose different kinds of improvements. Use models from different providers:

| Evolution Role | Pollinations Model | Provider | Why |
|---------------|-------------------|----------|-----|
| **GEPA Optimizer** | `openai-large` | Azure/OpenAI | Strong reasoning baseline |
| **GEPA Reflection LM** | `gemini-large` | Google | Different perspective on failures |
| **Evaluator** | `deepseek` | Azure/DeepSeek | Independent judge, different training |
| **Dataset Generator** | `claude` | Bedrock/Anthropic | Creative, different style |
| **Task Executor** | `mistral` | OVHCloud | Yet another perspective |

## CLI Usage

### Direct CLI (Recommended)

```bash
# Evolve a skill with Pollinations models
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --iterations 10 \
    --optimizer-model "openai/openai-large" \
    --eval-model "openai/openai" \
    --eval-source synthetic

# Budget run
python -m evolution.skills.evolve_skill \
    --skill systematic-debugging \
    --iterations 5 \
    --optimizer-model "openai/openai" \
    --eval-model "openai/openai-fast"
```

**Important:** The `--optimizer-model` and `--eval-model` flags use LiteLLM model strings. Prefix Pollinations models with `openai/` since the endpoint is OpenAI-compatible.

Before running, set the environment:

```bash
export OPENAI_API_KEY="sk_your_pollinations_key"
export OPENAI_API_BASE="https://gen.pollinations.ai/v1/"
```

### Dry Run (Validate Setup)

```bash
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --dry-run
```

### Using Session History from Claude Code / Copilot

```bash
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --eval-source sessiondb \
    --iterations 10 \
    --optimizer-model "openai/openai-large" \
    --eval-model "openai/openai"
```

The external importer (`evolution/core/external_importers.py`) uses LiteLLM for relevance scoring. It defaults to `openrouter/google/gemini-2.5-flash` — override with `--model`:

```bash
python -m evolution.core.external_importers \
    --source all \
    --skill my-skill \
    --model "openai/openai"
```

## Programmatic Usage

### Full Evolution Run

```python
import os
import dspy
from evolution.core.config import EvolutionConfig
from evolution.skills.evolve_skill import evolve

os.environ["OPENAI_API_KEY"] = "sk_your_pollinations_key"
os.environ["OPENAI_API_BASE"] = "https://gen.pollinations.ai/v1/"

evolve(
    skill_name="github-code-review",
    iterations=10,
    eval_source="synthetic",
    optimizer_model="openai/openai-large",  # GEPA reflections via Pollinations
    eval_model="openai/openai",             # LLM-as-judge via Pollinations
)
```

### Custom GEPA with Diverse Reflection

```python
import os
import dspy

os.environ["OPENAI_API_KEY"] = "sk_your_pollinations_key"
os.environ["OPENAI_API_BASE"] = "https://gen.pollinations.ai/v1/"

# Configure default LM
lm = dspy.LM("openai/openai", api_base="https://gen.pollinations.ai/v1/",
              api_key=os.environ["OPENAI_API_KEY"])
dspy.configure(lm=lm)

# GEPA with a different reflection model for diversity
optimizer = dspy.GEPA(
    metric=your_metric,
    max_steps=10,
    reflection_lm="openai/gemini-large",  # Google model via Pollinations
)

optimized = optimizer.compile(
    student=your_module,
    trainset=trainset,
    valset=valset,
)
```

### Custom LLM-as-Judge with Pollinations

```python
from evolution.core.config import EvolutionConfig
from evolution.core.fitness import LLMJudge

config = EvolutionConfig(
    eval_model="openai/openai",       # Judge model
    judge_model="openai/openai-large", # Dataset generation model
)

judge = LLMJudge(config)
score = judge.score(
    task_input="Review this PR for security issues",
    expected_behavior="Should identify SQL injection on line 42",
    agent_output=agent_response,
    skill_text=skill_content,
)
print(f"Composite: {score.composite:.3f}")
print(f"Feedback: {score.feedback}")
```

## Auxiliary Model Configuration (Hermes Agent)

Hermes Agent itself supports auxiliary model slots for specialized tasks. These can all point at Pollinations:

### Vision Model

For skills that process images (screenshots, diagrams):

```python
# In your Hermes agent config or environment
HERMES_VISION_MODEL = "openai/qwen-vision"  # Qwen3 VL via Pollinations
# or
HERMES_VISION_MODEL = "openai/gemini"        # Gemini 3 Flash (accepts images)
# or
HERMES_VISION_MODEL = "openai/openai"        # GPT-5.4 Nano (accepts images)
```

Pollinations models with vision support (`inputModalities` includes `"image"`):
- `openai` (gpt-5.4-nano)
- `openai-fast` (gpt-5-nano)
- `openai-large` (gpt-5.4)
- `gemini` (gemini-3-flash)
- `gemini-large` (gemini-3.1-pro)
- `mistral` (mistral-small-3.2)
- `mistral-large` (mistral-large-3)
- `qwen-vision` (qwen3-vl-plus) -- dedicated vision model
- `kimi` (kimi-k2.5)
- `claude-fast` / `claude` / `claude-large`

### Compression / Summarization Model

For context compression in long conversations:

```python
HERMES_COMPRESSION_MODEL = "openai/openai-fast"  # gpt-5-nano, cheapest
# or
HERMES_COMPRESSION_MODEL = "openai/nova-fast"     # Amazon Nova Micro, ultra cheap
```

### Delegation / Sub-agent Model

For spawning sub-tasks to cheaper models:

```python
HERMES_DELEGATION_MODEL = "openai/openai-fast"  # Fast sub-tasks
HERMES_MAIN_MODEL = "openai/openai-large"       # Primary reasoning
```

### Safety / Content Moderation

```python
HERMES_SAFETY_MODEL = "openai/qwen-safety"  # Qwen3Guard 8B, $0.01/M tokens
```

### All Auxiliary Slots as Environment Variables

```bash
# Core evolution models
export OPENAI_API_KEY="sk_your_pollinations_key"
export OPENAI_API_BASE="https://gen.pollinations.ai/v1/"

# Hermes auxiliary models (all via Pollinations)
export HERMES_VISION_MODEL="openai/qwen-vision"
export HERMES_COMPRESSION_MODEL="openai/openai-fast"
export HERMES_DELEGATION_MODEL="openai/openai-fast"
export HERMES_SAFETY_MODEL="openai/qwen-safety"
```

## Cost Estimates

Pollinations pricing is per-million tokens. $1 = 1 Pollen.

### Per-Model Token Costs

| Pollinations Model | Input $/M | Cached $/M | Output $/M | Role |
|-------------------|-----------|------------|------------|------|
| `openai-fast` | $0.05 | $0.005 | $0.40 | Budget executor/evaluator |
| `openai` | $0.20 | $0.02 | $1.25 | Default evaluator/executor |
| `openai-large` | $2.50 | $0.25 | $15.00 | Premium optimizer/reflector |
| `gemini-fast` | $0.30 | $0.03 | $1.20 | Budget alternative |
| `gemini` | $0.50 | $0.05 | $3.00 | Mid-tier alternative |
| `gemini-large` | $2.00 | $0.20 | $12.00 | Premium reflection LM |
| `deepseek` | $0.58 | $0.29 | $1.68 | Mid-tier judge |
| `mistral` | $0.10 | -- | $0.30 | Budget diversity model |
| `claude-fast` | $1.00 | $0.10 | $5.00 | Mid-tier Anthropic |
| `claude` | $3.00 | $0.30 | $15.00 | Premium Anthropic |
| `nova-fast` | $0.035 | -- | $0.14 | Ultra-budget |
| `grok` | $0.20 | $0.05 | $0.50 | Budget alternative |
| `qwen-safety` | $0.01 | -- | $0.01 | Safety gate (near-free) |

### Typical Evolution Run Token Budget

Based on the README estimate of "$2-10 per optimization run" with 10 iterations:

| Phase | Calls | Tokens/Call (approx) | Direction |
|-------|-------|---------------------|-----------|
| Dataset generation | 1 | ~4K in, ~8K out | judge_model |
| GEPA reflections | 10 | ~6K in, ~2K out per iteration | optimizer_model |
| Candidate evaluation | 50 (5 pop x 10 iter) | ~3K in, ~1K out | eval_model |
| Holdout evaluation | 10 | ~3K in, ~1K out | eval_model |
| **Totals** | ~71 calls | ~250K in, ~120K out | |

### Cost Per Configuration

**Budget (openai-fast everywhere):**
- Input: 250K x $0.05/M = $0.01
- Output: 120K x $0.40/M = $0.05
- **Total: ~$0.06 per run**

**Recommended (openai-large optimizer, openai evaluator):**
- Optimizer input: 60K x $2.50/M = $0.15
- Optimizer output: 20K x $15.00/M = $0.30
- Eval input: 190K x $0.20/M = $0.04
- Eval output: 100K x $1.25/M = $0.13
- **Total: ~$0.62 per run**

**Premium (openai-large optimizer, gemini-large reflection, claude evaluator):**
- Optimizer: ~$0.45
- Reflection: ~$0.30
- Evaluation: ~$0.50
- Dataset gen: ~$0.20
- **Total: ~$1.45 per run**

**Maximum diversity (5 different model families):**
- **Total: ~$2-4 per run**

These are conservative estimates. Actual costs depend on skill size, dataset size, and iteration count. The pipeline defaults to 10 iterations with population size 5 and 20 eval examples.

### Cost Comparison

| Backend | Budget Run | Recommended Run | Premium Run |
|---------|-----------|----------------|-------------|
| OpenAI Direct | ~$0.15 | ~$2.50 | ~$8.00 |
| **Pollinations** | **~$0.06** | **~$0.62** | **~$1.45** |

Pollinations prices include a modest markup over provider rates but give you access to models from OpenAI, Google, Anthropic, DeepSeek, Mistral, and others through a single API key.

## Complete Setup Script

```bash
#!/bin/bash
# setup-hermes-evolution.sh
# One-shot setup for Hermes self-evolution via Pollinations

set -e

# 1. Clone and install
git clone https://github.com/NousResearch/hermes-agent-self-evolution.git
cd hermes-agent-self-evolution
pip install -e ".[dev]"

# 2. Configure Pollinations as the LLM backend
export POLLINATIONS_API_KEY="${POLLINATIONS_API_KEY:?Set POLLINATIONS_API_KEY first}"
export OPENAI_API_KEY="$POLLINATIONS_API_KEY"
export OPENAI_API_BASE="https://gen.pollinations.ai/v1/"

# 3. Point at hermes-agent
export HERMES_AGENT_REPO="${HERMES_AGENT_REPO:-$HOME/.hermes/hermes-agent}"

# 4. Verify setup
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --dry-run

echo "Setup complete. Run evolution with:"
echo "  python -m evolution.skills.evolve_skill --skill <name> --iterations 10"
```

## Troubleshooting

### "Model not found" errors

Pollinations model names differ from OpenAI's. The LiteLLM model string must be `openai/<pollinations_model_name>`:
- Correct: `openai/openai-large`
- Wrong: `openai/gpt-5.4` (Pollinations routes by its own model aliases, not raw model IDs)

### Rate limits

Pollinations rate limits depend on your tier:
- **Spore** (free): Limited throughput — expect slower runs
- **Seed** ($0.15/hr): Good for development
- **Flower** ($0.40/hr): Good for production runs
- **Nectar** ($0.80/hr): Heavy usage

For evolution runs, a **Seed** tier or above is recommended to avoid throttling during the 50+ API calls per run.

### Paid-only models

Some Pollinations models require a paid tier: `gemini`, `gemini-large`, `claude`, `claude-large`. The budget models (`openai`, `openai-fast`, `mistral`, `deepseek`, `grok`, `nova-fast`) work on all tiers.

### Timeout on long generations

GEPA reflections can produce long outputs. If you hit timeouts, add:

```python
lm = dspy.LM(
    "openai/openai-large",
    api_base="https://gen.pollinations.ai/v1/",
    api_key=os.environ["POLLINATIONS_API_KEY"],
    max_tokens=4096,
    timeout=120,
)
```

### Verifying the connection

```bash
# Quick test that Pollinations responds via OpenAI-compatible endpoint
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Say hello"}]}'
```

## Available Models Reference

List all current models programmatically:

```bash
curl https://gen.pollinations.ai/v1/models | python -m json.tool
```

Or check the [Pollinations API docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md).

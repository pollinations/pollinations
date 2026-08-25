# Community Model Naming

Choosing good names up front keeps integrations stable and helps callers understand what they're using.

## The three fields

**Model ID** — the stable slug that forms the public address `{username}/{model-id}`. Once callers start using it, changing it is a breaking change. Choose a name that will still make sense after a price change, a provider switch, or a context-window upgrade. Avoid embedding prices, provider names, or context sizes.

**Title** — the short human-readable name shown in the Models list. It can be friendlier than the ID and may contain spaces and uppercase letters.

**Description** — one sentence about what the model is or what it routes to. For routed or rebranded models, be transparent about what is running behind the scenes.

## Choosing a model ID

- Use lowercase letters, digits, and hyphens.
- Pick the upstream model's official slug when proxying directly (`llama-3.1-8b`, not `llama-fast-cheap`).
- For custom models, pick a short descriptive slug based on the task or persona, not the underlying provider or price tier.
- Avoid mutable details: pricing, provider routing, and context window size all change; the ID should not.

## Examples by model type

| Type | ID | Title | Description |
|------|----|-------|-------------|
| Direct upstream proxy | `llama-3.1-8b` | Llama 3.1 8B | Meta Llama 3.1 8B via Groq |
| Custom (fine-tune or system prompt) | `code-helper` | Code Helper | GPT-4o-mini with a system prompt for code review |
| Router | `fast-router` | Fast Router | Routes to Llama 3 or Mistral based on prompt length |
| Rebranded | `my-assistant` | My Assistant | OpenAI GPT-4o-mini |

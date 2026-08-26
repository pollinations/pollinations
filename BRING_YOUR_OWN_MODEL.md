# Bring Your Own Model

A concise guide to naming community models so they are discoverable, stable, and clear.

## The three fields

When you register a community endpoint you set three fields — each serves a distinct
role and should not be mixed up:

| Field | Role | Example |
|---|---|---|
| **Model ID** | The stable, callable identifier. Never changes once published. | `myuser/fast-llama` |
| **Title** | A short human-friendly name shown in the Models list. | `Fast Llama` |
| **Description** | One line explaining what the model is good at or what it routes to. | `Fast coding model, long context` |

### Model ID — `{username}/{model-id}`

- **Stable / non-mutable**: once registered, keep this ID — never change it. Changing it creates a *new* model and
  loses all history, earnings, and health metrics.
- **Keep mutable details out of the ID**: avoid pricing, provider routing, or context-length in the
  ID. Those change over time. Use them in the description instead.
- **Slug format**: lowercase letters, numbers, and hyphens. No spaces, capitals, or
  special characters.

### Title — the display name

- 42 characters max, shown everywhere users browse models.
- Should describe **what** the model does, not **how** it is priced or routed.
- Brand names are fine when the description is transparent about the upstream.

### Description — what it is

- One line (160 chars). Explain the model's strength or what it routes to.
- For rebranded or router models, state the underlying model so users know what
  they are getting.

## Naming by model type

### Direct upstream model

You host an existing OpenAI-compatible API (e.g. Llama 3.3) on your own server.

- **ID**: `myuser/llama-3-3-70b`
- **Title**: `Llama 3.3 70B`
- **Description**: `Llama 3.3 70B via my self-hosted API`

### Custom trained model

You fine-tuned a base model and serve it from your own endpoint.

- **ID**: `myuser/code-llama-finetuned`
- **Title**: `Code Llama Finetuned`
- **Description**: `Code Llama 7B fine-tuned on Python and TypeScript`

### Router / gateway

Your endpoint routes to multiple backends. The ID should identify **your** service.

- **ID**: `myuser/smart-router`
- **Title**: `Smart Router`
- **Description**: `Routes to Qwen 3, Llama 3.3, and GPT-4o based on prompt length`

### Rebranded model

Your ID and title use your own branding, but you transparently attribute the
upstream so users know what they are actually calling.

- **ID**: `myuser/super-coder`
- **Title**: `Super Coder`
- **Description**: `Rebranded Qwen 3.8 27B for coding assistance`

## Do and don't

| ✅ Do | ❌ Don't |
|---|---|
| Pick a stable, descriptive ID and keep it forever | Use volatile details in the ID (prices, provider, context size) |
| State the upstream model in the description | Leave the description blank for a rebranded model |
| Use a short, clear title | Put pricing or routing info in the title |

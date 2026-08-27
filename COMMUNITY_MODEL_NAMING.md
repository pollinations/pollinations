# Community Model Naming Guide

Pick names that stay stable and make it obvious what a caller will get.

## Three fields

- **Model ID** (`owner/model-id`) — the stable identifier callers put in `model:`. It should not change after publishing.
- **Title** — short display name shown in the Models catalog.
- **Description** — one transparent line about what it is or what it routes to.

Keep the ID stable. Use title and description to explain the rest.

## What to avoid in the ID

Don't encode things that change often:

- pricing (`-cheap`, `-0.01`), provider routing (`-via-together`), context size (`-128k`, `-32k`)
- `owner/my-model` is stable; `owner/my-model-cheap-128k-via-together` is not.

Use lowercase, numbers, and hyphens: `my-model`, `my-code-llama`, `my-router`.

## Examples

**Direct upstream model**
- ID: `my-llama-70b`
- Title: `My Llama 70B`
- Description: `Direct proxy to Meta Llama 3.1 70B via Together`

**Custom / fine-tuned model**
- ID: `my-code-llama`
- Title: `My Code Llama`
- Description: `Custom fine-tune of Llama 3.1 70B for code generation`

**Router / load-balanced**
- ID: `my-router`
- Title: `My Router`
- Description: `Routes to Qwen2 72B or Llama 3.1 70B by queue depth — current mapping in description`

**Rebranded wrapper**
- ID: `my-assistant`
- Title: `My Assistant`
- Description: `Rebranded GPT-4o via Azure for chat — upstream is GPT-4o`

Custom names are welcome when the description clearly says what the model is or what it routes to.

## Where this is used

- The catalog card shows `title` and `description`.
- Calls use the full `owner/model-id`.

For first-party models the stricter convention in #13587 applies; community models can use the looser guide above.


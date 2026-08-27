# Community Model Naming

A short guide for publishing community models with stable model IDs and clear public names. First-party models follow a stricter canonical scheme ([`MODEL_SLUGS.md`](./MODEL_SLUGS.md)); community models do not need to. Use the guidance here instead.

## The three fields

Every published model has three public-facing names, each with a different job:

| Field | Role | Example |
| --- | --- | --- |
| **Model ID** | Stable identifier used in API calls (`owner/model-id`). Never changes once users depend on it. | `alice/fast-llama` |
| **Title** | Short display name shown in the Models list. Human-friendly, can be a brand or nickname. | `Fast Llama` |
| **Description** | One line that says what the model actually is, what it routes to, or what it is good at. | `Qwen-style 8B fine-tune for chat, routed to acme-gateway` |

The ID is the contract; the title is the face; the description is the honesty.

## Choosing a stable model ID

Keep the ID stable. Users write it into code, configs, and integrations, so changing it breaks them.

IDs should avoid **mutable details**:

- **Pricing** — a price change would force an ID rename.
- **Provider routing** — the upstream provider may change without the model changing.
- **Context size** — context windows grow over time.
- **Version churn** — avoid `-v1`, `-v2`, `-final`, `-new` in the ID unless the version is genuinely part of the model identity.

Prefer short, lowercase, hyphen-separated names that describe the model itself.

| Avoid | Prefer | Why |
| --- | --- | --- |
| `alice/cheap-llama` | `alice/fast-llama` | Price is mutable; speed is the model's character |
| `alice/llama-openrouter` | `alice/llama-chat` | The router can change; the purpose should not |
| `alice/qwen-128k` | `alice/qwen-chat` | Context size may grow |
| `alice/my-model-final-v2` | `alice/assistant` | Version churn in an ID is a trap |

## Clear titles and honest descriptions

Custom names are welcome. The title can be a brand, a pun, or anything memorable — the description is where the model is explained.

The description should make it clear what the model is or what it routes to:

- **Direct upstream model**: `DeepSeek-V3 served from our own cluster`
- **Custom model**: `Our LoRA fine-tune of Llama-3.3 for medical Q&A`
- **Router**: `Routes between gpt-5-mini and claude-opus based on prompt length`
- **Rebranded model**: `Whisper-large-v3, rebranded as "Echo" for our API`

If a title is a brand or nickname that does not obviously describe the model, the description must say what the model actually is.

## Examples by model kind

**Direct upstream model**

```text
Model ID:     alice/mistral-7b
Title:        Mistral 7B
Description:  Mistral-7B-instruct served directly from our endpoint
```

**Custom model**

```text
Model ID:     alice/summarizer
Title:        DocSum
Description:  Fine-tune of Qwen-2.5-14B for long-document summarization
```

**Router**

```text
Model ID:     alice/chat-router
Title:        Smart Chat
Description:  Routes to gpt-5.1 for short prompts and claude-opus for long ones
```

**Rebranded model**

```text
Model ID:     alice/echo-tts
Title:        Echo
Description:  ElevenLabs multi-speaker TTS under our brand
```

## Summary

- The model ID is stable; the title is short; the description is transparent.
- Do not bake pricing, routing, or context size into the ID.
- Custom and rebranded names are fine as long as the description says what the model is.

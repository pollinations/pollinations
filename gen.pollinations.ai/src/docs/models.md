## Models

Discover available models with pricing, capabilities, and metadata. No authentication required.

| Endpoint | Returns |
|----------|---------|
| `GET /models` | All models with pricing, capabilities, and metadata |
| `GET /v1/models` | All models in OpenAI-compatible format (`{object: "list", data: [...]}`) |
| `GET /text/models` | Text models with pricing, context window, tool support |
| `GET /image/models` | Image & video models with capabilities and pricing |
| `GET /audio/models` | Audio models with supported voices |
| `GET /embeddings/models` | Embedding models with supported modalities |

Rich model endpoints include `capabilities` for agentic/model traits:
`tool_calling`, `reasoning`, `web_search`, and `code_execution`.
Modalities, video frame controls, voices, and context length remain separate
structured fields.

## Community Models (Alpha)

Community models are user-owned, OpenAI-compatible text endpoints proxied through `gen.pollinations.ai` under an `owner/model` id (e.g. `Spit-fires/LFM2.5-230M`). Registration is currently invite-only while the program is in alpha — rules below may still change before general availability.

- **Payouts**: owners currently earn 75% of the pollen spent on their model.
- **Not our infrastructure**: community models run on the owner's own backend, not Pollinations servers. Don't send API keys or other sensitive data through them.
- **Automated health monitoring**: models with sustained failures get deactivated automatically. Reactivating is manual and owner-only — there's no auto-reactivation, so if your model was turned off, fix the underlying issue before reactivating it.
- **Check your model's health**: live request counts, success rate, errors, and latency are visible at [model-monitor.pollinations.ai/debug](https://model-monitor.pollinations.ai/debug).

Registration and management ("My Models") are documented under the Account section of this reference, or via the [CLI](/docs/guides/cli) (`polli my-models`).

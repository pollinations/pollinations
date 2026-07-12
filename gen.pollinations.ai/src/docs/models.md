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

Community models are user-owned, OpenAI-compatible text endpoints proxied through `gen.pollinations.ai` under an `owner/model` id (e.g. `Spit-fires/LFM2.5-230M`). Registration is currently invite-only while the program is in alpha — rules below will likely get stricter before general availability.

**Alpha stage**
- Inclusion is fairly permissive for now; expect that to tighten before official launch.
- Text models only for now — image, audio, and other modalities are planned next.

**Payouts**
- Owners currently earn 75% of the pollen spent on their model.
- Payouts are like-for-like: a request paid with paid pollen pays the owner in paid pollen; a request paid with quest pollen pays the owner in quest pollen. Quest pollen can't be cashed out — it can only be spent on non-paid models.
- Owners will be able to switch their model to paid-only.
- Dollar payouts are planned but not available yet (legal/compliance work in progress).
- Expect a trial period where pollen accumulates but can't be cashed out yet — this will likely start manually, inviting owners once they cross a pollen threshold.

**Policing & safety**
- Community models do **not** run on Pollinations infrastructure — they run on the owner's own backend. Don't send API keys or other sensitive data through them.
- A safety feature that auto-redacts private info before it's sent to community models is planned, likely on by default with an opt-out.
- Owners and users are encouraged to test each other's models — self-policing keeps the ecosystem honest.
- Models can be pulled (and repeat offenders potentially blocked) for instability or suspected abuse — e.g. silently changing prices or serving a different model than advertised.

**Automated health monitoring**
- An automated monitor checks each community model's error rate and latency. Models with sustained failures get deactivated automatically — no human involvement needed for that direction.
- Reactivating a deactivated model is manual and owner-only, from the dashboard. There's no auto-reactivation, so if your model was turned off, fix the underlying issue before reactivating it, or it may just fail again.
- Check your model's live health — request counts, success rate, errors, and latency — at [model-monitor.pollinations.ai/debug](https://model-monitor.pollinations.ai/debug).

Registration and management ("My Models") are documented under the Account section of this reference, or via the [CLI](/docs/guides/cli) (`polli my-models`).

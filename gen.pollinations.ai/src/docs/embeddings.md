## Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

| Endpoint | Description |
|----------|-------------|
| `POST /v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `GET /embeddings/models` | Embedding models with pricing and modalities |

`gemini-2` supports text, image, audio, and video inputs. `cohere-embed-v4` supports text and one image per input. The OpenAI and Qwen embedding models are text-only.

String batch input supports up to 32 items. For retrieval, use `task_type` with Gemini text input (it is converted to the recommended prompt instruction) or `input_type` (`query` or `document`) with Cohere. Dimensions are model-specific: Cohere supports 256, 512, 1024, or 1536; `openai-3-small` supports up to 1536; `gemini-2` and `openai-3-large` support up to 3072; `qwen3-embedding-8b` supports up to 4096.

Gemini task instructions count toward prompt token usage. Cohere requests containing an image expose one combined usage count, so any accompanying text is billed at the image-input rate.

**Gemini GA migration:** `gemini-2` now uses the GA embedding space. Do not mix preview-era and GA vectors; re-embed stored `gemini-2` data before comparing it with new results.

**Embedding models:** {{EMBEDDING_MODELS}}

## Community embedding endpoints

Owners can publish their own embedding backend as a community endpoint. A community embedding endpoint proxies `POST /v1/embeddings` to the owner's OpenAI-compatible upstream (`/embeddings` appended to the endpoint base URL) and is listed alongside the hosted models in `/embeddings/models` and `/v1/models`.

- **Input:** text only (`input` as a string or array of strings, up to the embedding batch limit). `task_type`, `input_type`, and multimodal content parts are not supported by community embedding models and are rejected.
- **Billing:** token-priced endpoints bill `promptTextPrice` per 1M prompt tokens using the upstream `usage.prompt_tokens`; fixed-price endpoints charge `completionTextPrice` once per request. Usage is emitted through the standard `x-usage-*` headers.
- **Validation:** the upstream response must be a valid OpenAI embeddings object. Token-priced endpoints must return `usage.prompt_tokens` (with `total_tokens` equal to `prompt_tokens`) or the request fails.

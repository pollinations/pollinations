## Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

| Endpoint | Description |
|----------|-------------|
| `POST /v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `GET /embeddings/models` | Embedding models with pricing and modalities |

`gemini-2` supports text, image, audio, and video inputs. `openai-3-small` and `openai-3-large` are text-only models.

String batch input supports up to 32 items. `task_type` is Gemini-only. Dimensions are model-specific: `openai-3-small` supports up to 1536; `gemini-2` and `openai-3-large` support up to 3072; `qwen3-embedding-8b` supports up to 4096.

**Embedding models:** {{EMBEDDING_MODELS}}

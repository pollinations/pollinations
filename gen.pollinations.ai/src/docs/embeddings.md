## Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

| Endpoint | Description |
|----------|-------------|
| `POST /v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `GET /embeddings/models` | Embedding models with pricing and modalities |

`gemini-2` supports text, image, audio, and video inputs. `cohere-embed-v4` supports text and one image per input. The OpenAI and Qwen embedding models are text-only.

String batch input supports up to 32 items. For retrieval, use `task_type` with Gemini text input (it is converted to the recommended prompt instruction) or `input_type` (`query` or `document`) with Cohere. Dimensions are model-specific: Cohere supports 256, 512, 1024, or 1536; `openai-3-small` supports up to 1536; `gemini-2` and `openai-3-large` support up to 3072; `qwen3-embedding-8b` supports up to 4096.

**Embedding models:** {{EMBEDDING_MODELS}}

---
name: pollinations-models
description: Choose the right Pollinations model and read the live catalog. Use when an agent must pick a text, image, video, audio, 3D or embedding model, when it needs to know which models are free or cheap, what a model costs in Pollen, or how to enumerate models by category instead of guessing an id.
---
# pollinations-models — pick the right model from the live catalog

Never hardcode a model id. The catalog changes (new publishers weekly, aliases
retire), so an agent should read it and filter, the same way it reads any other
discovery endpoint.

## Enumerate

```bash
curl -s https://gen.pollinations.ai/models            # every model, all categories
curl -s https://gen.pollinations.ai/image/models      # image only
curl -s https://gen.pollinations.ai/text/models       # text only
curl -s https://gen.pollinations.ai/video/models      # video only
curl -s https://gen.pollinations.ai/audio/models      # audio only
curl -s https://gen.pollinations.ai/3d/models         # 3D only
curl -s https://gen.pollinations.ai/embeddings/models # embeddings only
```

An authenticated call returns only the models **this key may use**; the keyless
call returns the full public catalog. Read the keyless list to discover, then
filter to what the key allows before calling.

## Read one entry

```json
{
  "name": "tongyi-mai/z-image-turbo",
  "aliases": ["z-image", "z-image-turbo", "zimage"],
  "category": "image",
  "publisher": "Alibaba",
  "community": false,
  "per_user_rpm": 60,
  "pricing": { "currency": "pollen", "completionImageTokens": "0.004" },
  "input_modalities": ["text"],
  "output_modalities": ["image"],
  "supported_endpoints": ["/v1/images/generations", "/image/{prompt}", "/v1/chat/completions"]
}
```

Match a request against **both** `name` and `aliases` — callers often pass the
short alias (`flux`) while the catalog lists the canonical id
(`black-forest-labs/flux.1-schnell`). Use `publisher`, not a `brand` field.

## Pick by intent

| The caller wants | Filter for |
| --- | --- |
| Cheapest / free image | `category:image`, then lowest `pricing.completionImageTokens`; a `community:true` entry with no `completionImageTokens` is free |
| Best quality text | `category:text` + `input_modalities`/`output_modalities` and the model `title`/`description` |
| Vision (image input) | entries whose `input_modalities` include `image` |
| Tool calling | entries that advertise tool support in their description |
| Long context | the `description`/`title` states the window; the catalog price is per token |

## Pricing, in one line

`pricing.currency` is `pollen`. Token-priced models report
`promptTextTokens`/`completionTextTokens` (per 1M tokens) or
`completionImageTokens` (per image). A missing completion price on a
`community` model means it is **free**. `1 Pollen ≈ $1`.

## Then call it

- Image: `GET /image/{prompt}?model={id}` or `POST /v1/images/generations`.
- Text: `POST /v1/chat/completions` (OpenAI-compatible).
- Audio: `GET /audio/{text}?voice=nova&model={id}`.
- Video: `GET /video/{prompt}?model={id}`.
- Embeddings: `POST /v1/embeddings`.

Send `Authorization: Bearer $POLLINATIONS_API_KEY` for everything except the
keyless image URL. Full request shapes: `https://gen.pollinations.ai/docs/llm.txt`
and `https://gen.pollinations.ai/openapi.json`.

## Rules

- Read `/models` before choosing; do not invent ids.
- Prefer the cheapest model that satisfies the modality and quality bar; say
  the cost when the caller asked for something expensive.
- When a request names a capability (`vision`, `tools`, `free`), filter the
  catalog for it rather than assuming a default model has it.
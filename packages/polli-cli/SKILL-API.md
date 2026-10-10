---
name: pollinations-api
description: Call the Pollinations API directly via REST without installing anything. Use when the polli CLI cannot be installed, when browser login steps are blocked, or when only curl or fetch is available.
---

# pollinations-api — Pollinations REST API

Direct REST access to `https://gen.pollinations.ai`. No install, no browser login.
Needs only the `POLLINATIONS_API_KEY` env var for authenticated calls;
the image URL works keyless.

Use the `polli` CLI skill when the CLI is already installed. Use this skill
when it is not (sandboxes, Codex cloud, Cursor chat, fresh containers)
or when you only need one quick call.

## Auth

- Keyless (no header): `GET /image/{prompt}`.
- Authenticated: header `Authorization: Bearer $POLLINATIONS_API_KEY`
  (key from `https://enter.pollinations.ai/keys`).
- Same key permissions, billing and caching as the CLI path.

## First call (keyless image, no code)

```plaintext
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

Open the URL or `curl -o out.png "<url>"`. If it returns an image,
discovery works.

## Text (OpenAI-compatible)

```python
from openai import OpenAI
client = OpenAI(base_url="https://gen.pollinations.ai/v1", api_key="YOUR_API_KEY")
response = client.chat.completions.create(model="openai/gpt-5.4-nano", messages=[{"role": "user", "content": "Hello!"}])
print(response.choices[0].message.content)
```

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-5.4-nano","messages":[{"role":"user","content":"Hello!"}]}'
```

## Audio (one-shot TTS)

```bash
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -o speech.mp3
```

## Model IDs

- IDs use `publisher/model` names; existing aliases stay valid — match catalog
  entries against both canonical ID and `aliases`.
- Catalog metadata uses `publisher` (for example, `OpenAI`), not `brand`.
- Current IDs: `https://gen.pollinations.ai/models`.

## Full reference

- Plain-text guide: `https://gen.pollinations.ai/docs/llm.txt`
  (per-section: `?section=cli`, `?section=mcp`).
- OpenAPI schema: `https://gen.pollinations.ai/openapi.json`.
- Interactive docs: `https://gen.pollinations.ai/docs`.

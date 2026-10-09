# Migrating from the legacy Pollinations APIs to Gen

`text.pollinations.ai` and `image.pollinations.ai` are the legacy APIs. They keep
working for existing **anonymous** callers. New models, features and every
authenticated use live on **https://gen.pollinations.ai**.

- Gen docs: https://gen.pollinations.ai/docs (full reference: [`APIDOCS.md` on `main`](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md))
- Get a key: https://enter.pollinations.ai/?ref=text (text) or https://enter.pollinations.ai/?ref=image (image)

## Route by route

| Legacy call | Gen call |
|---|---|
| `GET https://text.pollinations.ai/{prompt}` | `GET https://gen.pollinations.ai/text/{prompt}` |
| `POST https://text.pollinations.ai/` (messages) | `POST https://gen.pollinations.ai/text` |
| `POST https://text.pollinations.ai/openai` | `POST https://gen.pollinations.ai/v1/chat/completions` |
| `POST https://text.pollinations.ai/v1/chat/completions` | `POST https://gen.pollinations.ai/v1/chat/completions` |
| `GET https://text.pollinations.ai/models` | `GET https://gen.pollinations.ai/text/models` |
| `GET https://image.pollinations.ai/prompt/{prompt}` | `GET https://gen.pollinations.ai/image/{prompt}` |
| `GET https://image.pollinations.ai/models` | `GET https://gen.pollinations.ai/image/models` |

Query parameters such as `model`, `seed`, `width`, `height` and `nologo` keep
their names. OpenAI SDKs only need `base_url="https://gen.pollinations.ai/v1"`.

## Authentication

| | Legacy | Gen |
|---|---|---|
| Anonymous | allowed, rate limited | model catalogue only (`/text/models`, `/image/models`, `/v1/models`) |
| Server side | `?token=` / referrer | `Authorization: Bearer sk_...` |
| GET URLs that can't set headers (`<img>`, links) | `?token=` / referrer | `?key=...` |
| Browser / mobile apps | referrer | `pk_` app key with "Sign in with Pollinations" (OAuth), so each user brings their own pollen |

Create keys at https://enter.pollinations.ai/keys. Never ship an `sk_` key to a
browser or app.

## Models

Gen uses canonical model IDs such as `openai/gpt-5.4-nano` or
`black-forest-labs/flux.1-schnell`. The old short names (`openai`, `flux`,
`sana`, ...) are accepted as aliases; `GET /text/models` and
`GET /image/models` list both. The Gen image default is
`tongyi-mai/z-image-turbo`, so pass `model=flux` if you relied on the legacy
default.

## Examples

```bash
# Text, GET
curl "https://gen.pollinations.ai/text/hello?key=YOUR_KEY"

# Text, OpenAI-compatible
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"hello"}]}'

# Image
curl -o cat.jpg "https://gen.pollinations.ai/image/a%20cat?model=flux&key=YOUR_KEY"
```

```html
<img src="https://gen.pollinations.ai/image/a%20cat?model=flux&key=YOUR_PK_KEY">
```

## Machine-readable migration hints

Every legacy response, including cache hits and errors, carries:

| Header | Value |
|---|---|
| `X-Pollinations-Migration` | this guide |
| `X-Pollinations-Docs` | `https://gen.pollinations.ai/docs` |
| `X-Pollinations-Signup` | `https://enter.pollinations.ai/?ref=text` or `?ref=image` |
| `Link` | `<this guide>; rel="deprecation"`, `<https://gen.pollinations.ai/docs>; rel="successor-version"` |

They are listed in `Access-Control-Expose-Headers`, so browser code can read
them. JSON error bodies also include a `migration` object with `guide`, `docs`
and `signup`.

The legacy image API still answers errors with an image (HTTP 200) so embedded
`<img>` tags keep rendering. To tell why, read `X-Error-Type`,
`X-Error-Status`, `X-Error-Message` and `X-Rate-Limited` on that response.

## 🔐 Authentication

Pollinations recognises two key types. Use the right one for the surface you're building.

| Key type | Prefix | Where it goes | What it can do |
|---|---|---|---|
| Secret key | `sk_` | Server-only (env var, secrets manager) | Full account access. Can create child keys, list usage, run any model the account allows. **Never ship to a browser, mobile app, or repo.** |
| Publishable key | `pk_` | Browsers, mobile apps, public clients | Calls models on behalf of the developer who created the key. Restricted to the permissions and budget set at creation. Safe to embed. |

Both forms accept the same transports:

```http
Authorization: Bearer <key>
```

```http
GET /image/cat?key=<key>
```

The header is preferred for everything except browser flows that can't set custom headers (image/audio `GET` endpoints and WebSocket realtime sessions).

**Endpoints with relaxed auth requirements**

| Endpoint | Auth |
|---|---|
| `GET /{hash}`, `GET /{hash}/metadata`, `HEAD /{hash}` | None — content-addressed media URLs are public reads |
| `GET /models`, `GET /v1/models`, `GET /image/models`, `GET /text/models`, `GET /audio/models`, `GET /embeddings/models` | None — model catalogue is public. Sending a bearer key returns the same data; some endpoints add per-account fields when authenticated. |
| Everything else | Bearer key required unless the endpoint documents `?key=` support |

`401 UNAUTHORIZED` always means key missing or invalid. `402 PAYMENT_REQUIRED` means the key authenticated but the account or per-key budget is exhausted — see [Error Responses](#-error-responses).

## 🔓 Sign in with Pollinations (OAuth 2.1)

Third-party apps can obtain an API key on behalf of a Pollinations user via the OAuth 2.1 authorization-code flow with PKCE (S256), or the device flow (RFC 8628) for CLIs. All endpoints are discoverable via RFC 8414 metadata — resolve them from there rather than hardcoding:

```
GET https://enter.pollinations.ai/.well-known/oauth-authorization-server
```

**Register a client:** create a **publishable App Key** (`pk_…`) at [enter.pollinations.ai](https://enter.pollinations.ai) and add your callback URL to its **redirect URIs**. The `pk_` key is your `client_id`. Clients are public (`token_endpoint_auth_methods_supported: ["none"]`) — no client secret.

**Authorization request** (endpoints from discovery):

```
GET /authorize?response_type=code&client_id=pk_…&redirect_uri=…&scope=profile&state=…&code_challenge=…&code_challenge_method=S256
```

The user signs in, reviews the requested scopes plus a budget and expiry for the key, and approves. The callback receives `?code=…&state=…` (or `?error=access_denied`). Requirements: `redirect_uri` must exactly match a registered URI, query string included (loopback `http://localhost` matches any port), and only `code_challenge_method=S256` is accepted.

**Token exchange** (single-use code, expires after 10 minutes):

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=…&client_id=pk_…&redirect_uri=…&code_verifier=…"
```

`redirect_uri` is required and must repeat the value from the authorization request. The response's `access_token` is an opaque `sk_` API key bound to the budget, expiry, and scopes the user approved — use it as a normal bearer key against `gen.pollinations.ai`. `scope` echoes what the user actually granted (it may be narrower than requested). There are no refresh tokens; re-run the flow when the key expires.

**Scopes** (`scopes_supported`): `profile` (name + email), `usage` (account balance + usage), `keys` (account admin — create/list/revoke keys). Generation needs no scope; it is bounded by the user-approved budget. `GET /api/oauth/userinfo` returns an OIDC-shaped profile for the bearer key — `name` and `email` appear only when the key carries the `profile` scope.

**Revocation:** issued keys appear in the user's dashboard like any other API key and can be edited or revoked there at any time; revocation is immediate. There is no RFC 7009 endpoint yet — a client that wants to "log out" should discard the key.

## 🧪 Use any OpenAI SDK

Pollinations speaks the OpenAI Chat Completions, Images, Embeddings, Audio, and Realtime APIs. Point the SDK at `https://gen.pollinations.ai/v1` and pass your `sk_…` key as the OpenAI key.

**Python**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="sk_your_secret_key",
)

response = client.chat.completions.create(
    model="openai",
    messages=[{"role": "user", "content": "Summarise the theory of relativity in one sentence."}],
)
print(response.choices[0].message.content)
```

**Node.js / TypeScript**

```ts
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://gen.pollinations.ai/v1",
    apiKey: process.env.POLLINATIONS_KEY,
});

const response = await client.chat.completions.create({
    model: "openai",
    messages: [{ role: "user", content: "Summarise the theory of relativity in one sentence." }],
});
console.log(response.choices[0].message.content);
```

Model IDs come from `GET /v1/models`. Anything `openai`, `claude`, `mistral`, `deepseek`, etc. routes to the corresponding provider on our side — you don't need separate keys per provider.

## 🌊 Streaming chat completions

Set `stream: true` to receive Server-Sent Events (SSE) deltas as the model writes. The wire format is byte-for-byte the OpenAI streaming format, so any OpenAI SDK that supports streaming works unchanged.

**cURL**

```bash
curl -N "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","stream":true,"messages":[{"role":"user","content":"Count to five, one word per line."}]}'
```

`-N` disables curl's output buffering so deltas appear as they arrive. Each event is a line of the form `data: {…}` terminated by `data: [DONE]`.

**Python (OpenAI SDK)**

```python
stream = client.chat.completions.create(
    model="openai",
    stream=True,
    messages=[{"role": "user", "content": "Count to five, one word per line."}],
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

When `stream: true` is set, usage info still arrives on the final chunk (`stream_options: { include_usage: true }` if your SDK requires opting in).

## 🖼️ Vision: passing images into chat

Models that accept image input (`openai`, `claude`, `gemini`, …) use the standard OpenAI multimodal `content` shape — an array of typed parts instead of a plain string.

```bash
curl "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}}
      ]
    }]
  }'
```

`image_url.url` accepts either a public URL or a `data:image/...;base64,…` data URI. Use `detail: "high"` for fine-grained reasoning and `"low"` for quick takes — see the [`MessageContentPart`](#messagecontentpart) schema for every supported part.

For audio or video input, swap in `input_audio` or `video_url` parts on models that advertise the matching capability in their `/v1/models` entry.

## 📤 Multipart uploads in depth

Three endpoints accept `multipart/form-data` request bodies. Each has its own field set.

**Transcribe an audio file** — Whisper-compatible.

```bash
curl -X POST "https://gen.pollinations.ai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./recording.mp3" \
  -F "model=openai-audio" \
  -F "response_format=verbose_json" \
  -F "temperature=0"
```

`response_format` accepts `json` (default), `verbose_json` (adds segment timings), `text`, `srt`, `vtt`. Max file size 25 MB.

**Edit an image with a prompt** — OpenAI Images Edits-compatible.

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/edits" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "image=@./photo.png" \
  -F "prompt=replace the sky with a sunset" \
  -F "model=kontext" \
  -F "size=1024x1024"
```

Repeat `-F "image=@…"` to pass multiple reference images on models that accept them (`seedream`, `nanobanana`, `klein`).

**Upload arbitrary media** to the content-addressed store. Returns a `https://media.pollinations.ai/<hash>` URL you can pass anywhere a remote image, audio, or video URL is accepted.

```bash
curl -X POST "https://gen.pollinations.ai/upload" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "file=@./asset.png"
```

The hash is derived from the bytes **and** the filename, so the same content uploaded under different names yields different URLs. Files are retained for 30 days; re-uploading resets the timer (and is a no-op if the hash already exists — the `duplicate` field in the response tells you which).

## 💡 Tips

- **Use `pk_` keys in browsers.** Anywhere a `sk_` key could be read off the wire, use a publishable key with a tight budget and an allow-list of models.
- **One key per app.** Child keys scope budget and permissions independently — easier to audit, easier to revoke without touching production.
- **Image/audio `GET` URLs are cache-friendly.** They're idempotent on `(prompt, model, seed)` — cache them on a CDN if you serve the same generations to many users.
- **Watch `429` and `503`.** A `Retry-After` header tells you how long to back off. `502` from us means upstream provider — usually transient.

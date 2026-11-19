---
name: pollinations-api
description: Call the Pollinations API directly via REST without installing anything. Use when the polli CLI cannot be installed, when browser login steps are blocked, or when only curl or fetch is available. A first image needs no account; every other call uses POLLINATIONS_API_KEY, which the user can approve in their own browser, or an agent with a USDC wallet can buy a prepaid key over x402.
---

# pollinations-api — Pollinations REST API

Direct REST access to `https://gen.pollinations.ai` without installing the CLI.
Generations on that host need a key; the Free API Classic image route needs none.
If no key is available, the user can approve a device authorization in their own browser.
With no user to approve, an agent can buy a prepaid key over x402 (below).

Use the `polli` CLI skill when the CLI is already installed. Use this skill
when it is not (sandboxes, Codex cloud, Cursor chat, fresh containers)
or when you only need one quick call.

## Auth

- Authenticated: header `Authorization: Bearer $POLLINATIONS_API_KEY`
  (an existing key, or a user-approved device authorization below).
- Same key permissions, billing and caching as the CLI path.
- Without a key, `GET /image/{prompt}` still answers when the same prompt and
  `seed` are already in the shared cache (`x-cache: HIT`). That is an image
  another caller generated, not a new generation: a fresh prompt returns
  `401`. Check `x-cache` before trusting a keyless `200`.

## Get a key without copying one into the agent

If `POLLINATIONS_API_KEY` is already set, skip this. Otherwise **ask the user to
approve device authorization**, then use the [OAuth 2.0 Device Authorization Grant (RFC 8628)](https://www.rfc-editor.org/rfc/rfc8628).
The user opens the printed URL on their own device; the agent polls at the
server-provided interval. No credential goes into a chat, command argument,
URL, public repository, or log. This uses Python's standard library only:

```bash
python3 - <<'PYDEVICE'
import json, os, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

path = Path.home() / '.config/pollinations/agent-key'
if path.exists():
    print('Existing private key file:', path)
    raise SystemExit(0)

def post(route, fields):
    request = urllib.request.Request(
        'https://enter.pollinations.ai' + route,
        data=urllib.parse.urlencode(fields).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return json.load(error)  # Pending approval is an OAuth 400 response.

code = post('/api/device/code', {})
print('Ask the user to approve:', code['verification_uri_complete'], flush=True)
interval = code['interval']
deadline = time.monotonic() + code['expires_in']
while time.monotonic() < deadline:
    time.sleep(interval)
    token = post('/api/oauth/token', {
        'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
        'device_code': code['device_code'],
    })
    if token.get('error') in ('authorization_pending', 'slow_down'):
        if token['error'] == 'slow_down':
            interval += 5
        continue
    if token.get('error'):
        raise SystemExit('Authorization failed: ' + token['error'])
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(token['access_token'])
    print('Saved to private file:', path)  # Never print the token.
    break
else:
    raise SystemExit('Approval timed out; request a new code.')
PYDEVICE
export POLLINATIONS_API_KEY="$(cat ~/.config/pollinations/agent-key)"
```

Do not run this under shell tracing (`set -x`). Keep that file out of projects;
its permissions are `0600`. The user can revoke the issued key on the
[Pollinations keys page](https://enter.pollinations.ai/keys). For all grant
options and the browser consent details, see
[Pollinations Pay](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md#️-clis--headless-apps-device-flow).

## No one to approve: buy a prepaid key with x402

An agent with USDC on Base can buy a key without a Pollinations account. Spend
only with the user's permission.

1. `GET https://enter.pollinations.ai/api/x402/keys/0.50` asks for a $0.50 key
   (any amount from $0.01 to $10,000). It returns `402` with payment terms in
   the `PAYMENT-REQUIRED` header.
2. An x402 client signs those terms and retries with `PAYMENT-SIGNATURE`. The
   response holds the new secret `key` and its budget in `pollen`, in US dollars.

Each payment creates a new key; store it like the device authorization key above.

## First call (image, no key, no account)

The Free API Classic route needs no account, no key and no payment:

```plaintext
https://image.pollinations.ai/prompt/a%20cat%20in%20space?width=768&height=768
```

```bash
curl -sS -L -o out.jpg "https://image.pollinations.ai/prompt/a%20cat%20in%20space?width=768&height=768"
```

What that route does:

- One image per 45 seconds per IP. A refusal is HTTP `402` with
  `{"code":"FREE_LIMIT"}` and a `retry-after` header; wait, then retry the
  same URL.
- Output is capped at 768x768, the model is `sana`, and `model=` is ignored.
- The `pollinations.ai` wordmark is burned in; `nologo=true` does not remove it.
- A refusal body is JSON, not an image. Check the content type before saving
  the response to a `.jpg`.

A fresh image carries `x-auth-status: unauthenticated` and `x-cache: MISS`,
so a real generation and a cached one are easy to tell apart.

For every other endpoint, get a key first: `gen.pollinations.ai/image/{prompt}`
returns `401` for any prompt that is not already cached.

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

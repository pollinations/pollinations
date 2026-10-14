---
title: Captain Pollen — a Pollinations Space
emoji: 🐝
colorFrom: yellow
colorTo: orange
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: true
short_description: Voice character chat on your own Pollen — BYO key demo
license: mit
---

# 🚀 Captain Pollen — a duplicable Pollinations Space

Talk to Captain Pollen, the starship AI of the freighter *Apis*. Type a message or
record your voice — she thinks, replies, and **answers in her own voice**.

The point of this Space: **Bring Your Own Pollen**. Visitors sign in with their own
Pollen through [enter.pollinations.ai](https://enter.pollinations.ai), so everyone
generates on their own balance — the host's key never runs dry, and neither does yours.

## Duplicate it (three steps)

1. Click the **⋮ menu** (top right of this Space) → **Duplicate this Space**
2. Wait ~a minute for the build — no secrets, no configuration needed
3. Open your copy, click **Sign in with Pollen**, authorize with your Pollen
   account — done. Every visitor does the same with *their* account.

That's the whole setup: the device-flow sign-in needs **no client secret and no
redirect URI**, so a duplicated Space works immediately.

## How the sign-in works (BYOP device flow)

- Clicking **Sign in with Pollen** calls `POST /api/device/code` on
  `enter.pollinations.ai` and shows you a clickable authorization link plus a
  user code.
- Approve the code with your Pollen account; the Space polls
  `POST /api/device/token` every few seconds and receives an `sk_…` key bound
  to **your** account.
- The key lives in your browser session only (a Gradio session value) — it is
  never written to disk, and you can sign out or revoke it any time from the
  [Pollinations dashboard](https://auth.pollinations.ai).
- Prefer a pasted key? The sidebar also accepts an `sk_…` key directly.

Full protocol: [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

## What's inside

- **Voice character chat** — persona'd chat history (`gr.Chatbot`), mic input
  transcribed via `/v1/audio/transcriptions` (whisper and friends), replies
  spoken via `GET /audio/{text}` (OpenAI-compatible TTS) and played back
  automatically.
- **Model pickers loaded live** from `/text/models` and `/audio/models`, with
  static fallbacks if the catalogue is unreachable.
- **Intercom** — a one-liner box that says anything in the Captain's voice.
- **MCP server** — the Space launches with `mcp_server=True`, exposing its
  `chat`, `voice_chat` and `speak` tools (see below).

## Make it your own

- **Change the character** — edit `PERSONA` near the top of `app.py` (a grumpy
  lighthouse keeper? a noir detective? a bee?) and the welcome text. That one
  constant is the whole personality.
- **Swap the demo concept** — the API core (`chat_completion`,
  `text_to_speech`, `transcribe_audio`) is plain functions; the UI is one
  `gr.Blocks`. Some ideas:
  - *Comic page*: one prompt → `GET /image/{prompt}` → six panels with narrated captions
  - *Narrated picture book*: image + generated voice-over per page
  - *Debate arena*: two personas argue via `/v1/chat/completions`
- **Attribution (optional)** — set a Space secret named `POLLINATIONS_APP_KEY`
  to your `pk_…` app key (Settings → Variables and secrets). Traffic from your
  duplicate is then attributed to your app. Leave it unset to run unattributed —
  everything still works.
- **Pick better defaults** — `DEFAULT_TEXT_MODEL`, `DEFAULT_TTS_MODEL`,
  `DEFAULT_VOICE` and `DEFAULT_STT_MODEL` at the top of `app.py`.

## Agents: MCP mode

The Space runs an MCP server. Point an MCP client at
`https://<your-space>.hf.space/gradio_api/mcp/sse` and you get three tools —
bring your own `api_key`:

| Tool          | What it does                                       |
| ------------- | -------------------------------------------------- |
| `chat`        | message → character reply (text)                  |
| `voice_chat`  | audio file → transcript → character reply (audio) |
| `speak`       | text → spoken audio in the Captain's voice        |

## Pollinations API cheat-sheet

All calls go to the live gateway at `https://gen.pollinations.ai` with
`Authorization: Bearer <your sk_ key>`:

```bash
# chat (OpenAI-compatible)
curl https://gen.pollinations.ai/v1/chat/completions -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-5.4-nano","messages":[{"role":"user","content":"hi"}]}'

# speech
curl "https://gen.pollinations.ai/audio/Hello%20Captain?model=openai/tts-1&voice=alloy" \
  -H "Authorization: Bearer $KEY" --output voice.mp3

# transcription (multipart)
curl https://gen.pollinations.ai/v1/audio/transcriptions -H "Authorization: Bearer $KEY" \
  -F model=openai/whisper-large-v3 -F file=@message.wav

# models
curl https://gen.pollinations.ai/text/models   # also /image/models, /audio/models
```

---

Built for pollinations/pollinations quest [#17249](https://github.com/pollinations/pollinations/issues/17249) —
"a Hugging Face Space people duplicate to build with Pollinations". 💙

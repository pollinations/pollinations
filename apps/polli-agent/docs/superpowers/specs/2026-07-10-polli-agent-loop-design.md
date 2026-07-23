# polli-agent v2 — Agentic Creative-Director Loop

**Date:** 2026-07-10
**Status:** Approved, implementing

## Goal

A single agent, deployed as an OpenAI-compatible model on Pollinations (`gen.pollinations.ai`),
that can do *anything* Pollinations offers. Ask it "explain photosynthesis for kids" and it decides
on its own to produce several illustrated steps + a text explanation + a narrated audio track,
chaining tool calls until the job is done. It knows the model lineup and picks the right model per task.

## Architecture

```
Client → FastAPI /v1/chat/completions (OpenAI format, full history)
           → agent.run_agent(): tool-calling loop on GLM (the brain)
               → tools: image / edit_image / video / tts / transcribe / web_search / bash / list_models
                   → gen.pollinations.ai   (registry.py picks concrete model IDs)
```

One Docker image (python-slim + ffmpeg, non-root, `/workspace` working dir). The container *is* the
bash sandbox. Scales horizontally: the agent is stateless per request (audio returned as data-URI,
no cross-instance file dependency).

**Deleted:** `router.py`, `composer.py`, `main.py`, `tools/_utils.py` (orphaned duplicate builders),
`schema.py` (pipeline types). Callers updated: `api.py`, `__main__.py`, `scripts/test_combos.py`,
`tests/test_router.py`.

**Kept & reused:** `registry.py` (live `/v1/models`, tier/capability scoring, voices, image-text
heuristics), URL builders in `tools/text.py`, `tools/media.py` ffmpeg helpers (now wired via bash).

## The loop (`agent.py`)

1. Build messages = system prompt + full conversation history.
2. Call GLM with tool schemas.
3. If the assistant message has `tool_calls`: execute **all of them concurrently** (semaphore-bounded),
   append one tool result message per `tool_call.id`, go to 2.
4. If no tool calls: that's the final answer. Return assistant text + collected media artifacts.
5. Caps: `POLLI_MAX_ITERS` (default 15) to bound runaway loops. Tool errors are returned to the brain
   as tool-result content (`"ERROR: ..."`) so it can retry with a different model itself.

## Tools (OpenAI function schemas)

Grounded in live-API probes (2026-07-10):

- `generate_image(prompt, model?, width?, height?, n?)` — GET `/image/{prompt}` → URL. Multiple `n` run concurrently.
- `edit_image(prompt, image_url, model?)` — img2img via `&image=` param (kontext/nanobanana/p-image-edit).
- `generate_video(prompt, model?, image?, end_image?, duration?, aspect?)` — GET `/video/{prompt}`; covers text2vid, img2vid (`image=` start frame), start+end frame (`end_image=`).
- `text_to_speech(text, voice?, model?)` — **POST chat completions, `modalities:["text","audio"]`** → base64 mp3.
  The brain writes the final script and passes it as `text`; it is read **verbatim**. Fixes the legacy
  "reads the prompt back" bug by construction. (Legacy GET `/audio/{text}` now 400s — removed.)
- `transcribe(audio_url or video_url)` — POST chat completions with an `input_audio` content part.
- `web_search(query)` — `gemini-search` via chat completions.
- `bash(command, timeout?)` — subprocess in-container, cwd `/workspace`, 60s default timeout,
  stdout+stderr truncated to ~8 KB. Gives ffmpeg/curl/python for free.
- `list_models(kind?)` — live registry dump when the brain wants details.

## Model knowledge

System prompt assembled at startup from the live registry (187 models) grouped by modality, plus a
curated `BEST_AT` dict (e.g. nanobanana/kontext → img2img & text-in-image, ideogram → typography,
flux → fast general, seedance/veo → video, wan → start/end-frame). Brain = `glm` (tools-capable, cheap).

## API layer (`api.py`)

- Full message history passed through (multimodal user content supported).
- `await warm_registry()` on FastAPI **startup** (else `pick_model` returns `""` in the running loop).
- Final message: text with markdown-embedded media **plus** OpenAI content-parts array.
- Audio: embedded as `data:audio/mp3;base64,…` (stateless) **and** saved to `/workspace/files`,
  served at `/files/{name}` using `POLLI_PUBLIC_BASE_URL` — works whether or not the client renders data URIs.
- Streaming (`stream=true`, SSE): deferred to a follow-up; non-streaming correct + tested first.

## Security (deploy gate)

Per-request Pollinations key flows header (`X-Pollinations-Key` / `Bearer`) → contextvar → all brain
& tool calls. The key is **not baked into the image env**, so `bash("env")` cannot exfiltrate it.
For public exposure, `bash` runs only inside the container sandbox (already the deployment model).

## Testing

- **Unit (mocked brain):** loop executes an assistant turn with **two** `tool_calls` → both run, two tool
  results appended; iteration cap enforced; tool error surfaced to brain.
- **Headline regression (live):** `text_to_speech(script)` → returned `transcript == script` verbatim
  (strict equality — "contains" would let the bug back in).
- **Response shaping:** base64 must never leak into the markdown text part.
- **Live suite** (`tests/test_live.py`, gated on `POLLI_LIVE=1`; `scripts/test_combos.py` for manual runs).

- **Video frame contract** (unit): `image=start|end`, no `end_image` param, end-frame model auto-swap.
- **Fetch retry** (unit): transient 5xx retried, 401/404 fail fast.

Status: 16 unit + 5 live passing; ruff clean; Docker image builds and serves.

**Robustness:** re-fetching a generation URL re-runs the render and intermittently 502s.
`_fetch_bytes` retries 5xx (3 attempts, backoff) so a blip doesn't cost a brain iteration; if it
still fails, the error goes back to the brain, which retries with another model. Measured: a tool
failing twice then succeeding consumed 5 of 15 iterations — ample headroom.

## Bugs found by live testing (fixed)

1. **`/v1` base-URL 404.** The OpenAI SDK appends `chat/completions` to `base_url`, so a bare host
   produced `POST /chat/completions` → 404. This broke the **brain loop itself** and `web_search`;
   unit tests missed it because they mock `_client`. Fixed by giving SDK clients `base_url + "/v1"`
   while keeping `openai_base_url` bare (GET media URLs need the bare host).
2. **TTS was not verbatim.** `openai-audio` is conversational — handed a declarative sentence it
   *answers* it ("That's correct! The mitochondria are…"). Fixed with a TTS-engine system prompt.
   Per the Pollinations admin, only `openai-audio` behaves this way; other audio models read verbatim
   natively, and the guard is harmless to them.
3. **Base64 leaked into markdown**, bloating the text part to ~1 MB. Audio payload now lives only in
   the `audio_url` content part. (Same guard applied to data-URI images.)
4. **img2img was broken.** GET `/image/{prompt}?image=<url>` returns 400 — the API cannot re-fetch a
   Pollinations generation URL (522). Real path: POST `/v1/images/edits` with a **multipart upload**
   (`image[]`, up to 2 refs), returning `b64_json`. Returning a URL made the tool *look* successful.
5. **`end_image` did not exist.** Reference frames go in ONE `image` param, `|`-separated:
   `image[0]`=start, `image[1]`=end. Only `wan-fast`/`veo`/`wan-pro`/`wan-pro-1080p`/`seedance-2.0`
   honour an end frame — plain `wan` (the old default) **silently drops it**, so a wrong end-frame
   video would have passed as success.
6. **Media downloads need the bearer token** — an unauthenticated GET on a Pollinations image URL 401s.

## Verified end-to-end (2026-07-10)

One HTTP request ("explain black holes, full treatment") produced, in 83 s: 13 KB of text, **three
`ideogram-v4-quality` diagrams with correct readable labels** (event horizon / accretion disk /
singularity), a **1920×1088 h264 seedance-pro video** (5.04 s, 121 frames), and a **23 s MP3** whose
transcription matches the scripted narration verbatim — plus a live web-searched JWST discovery.
The brain chose the typography-strong image model and the cinematic video model on its own.

Separately verified by fetching the real bytes:
- **img2img** — blue circle → same circle with a red ring added (a transform, not a regeneration).
- **start+end-frame video** — red square → green triangle: frame 0 sampled RGB(245,25,18), final
  frame RGB(67,207,58), 81 frames on `wan-fast`.
- **bash in container** — `python -c 'print(6*7)'` → 42, through the containerized HTTP API.

**Docker verified:** image builds; container runs as non-root `polli` with Python 3.12, ffmpeg 7.1.5,
curl, and **no API key in the image env**. A full request through the containerized API ran
`python -c 'print(6*7)'` via the bash tool (→ 42), generated an image, and produced narration — with
the key supplied per-request via header. Clean logs.

## Not yet verified / follow-ups

- **Streaming (`stream=true`)** is accepted but ignored; SSE is deferred. Long video jobs (~80 s) may
  hit client timeouts until it lands.
- `usage` token counts are still stubbed at zero.
- `BEST_AT` in `knowledge.py` is hand-curated — revisit as the Pollinations lineup changes.

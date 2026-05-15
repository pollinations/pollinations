# voice-edit

Voice-driven image editor. Click-and-hold on image, speak edit, release. Red ring burned at click point → uploaded → `/v1/images/edits` → canvas swap.

- Single self-contained `index.html`. No build step.
- Vanilla JS + Tailwind CDN.
- BYOP auth via Pollinations OAuth (`enter.pollinations.ai`).

## stack

| layer | choice | notes |
|---|---|---|
| auth | `enter.pollinations.ai/authorize` device flow | `api_key` in URL fragment → `localStorage["voice-edit:user-key"]` |
| edit | `POST /v1/images/edits` (OpenAI-compat) | `{prompt, image: url, model, response_format: "url"}` |
| STT | `POST /v1/audio/transcriptions`, model=`scribe` | ElevenLabs Scribe v2. 1.6% WER on Artificial Analysis AA-AgentTalk (short voice-agent clips) vs ~2.3% Universal-3 Pro; Whisper-large-v3 ranks well below and hallucinates "Thank you / Thanks for watching" on silent or sub-second audio (documented YouTube-training-data artifact, arXiv:2501.11378). Tried `universal-2` earlier — worse on short clips. |
| upload | `POST media.pollinations.ai/upload` | annotated PNG before /edits |
| default edit model | `nanobanana` | Gemini 2.5 Flash Image. Recommended: `nanobanana`, `p-image-edit`, `kontext`, `gpt-image-2`. |
| starter image | "Most detailed view of a human cell" (Evan Ingersoll & Gael McGill, Digizyme) | `media.pollinations.ai/10efdd0c1cfc65fa` |

## marker

Single gesture, freehand only. No ring fallback — if the user doesn't move the mouse the edit is **global** (no marker on the image, plain prompt).

- **No movement (path < 3% min(w,h))** → no marker painted; prompt is sent as-is, model interprets the text as a global instruction. Pin sits at the click point.
- **Drag (path ≥ 3% min(w,h))** → freehand pure stroke in current `markerColor` (red / black / white, switchable via swatch picker in the toolbar). Width ~1.5% of min(w,h), fully opaque, `lineCap: round`, `lineJoin: round`. Pin position = path bbox `(maxX, midY)` so the label sits just past the rightmost mark point.
- Canvas reset to source image at the *start* of each pointerdown so stray strokes from gesture N never leak into the snapshot for gesture N+1. Marker stays visible from pointerup through edit completion.
- No fill, no text label, no multi-stroke aggregation. One pointerdown→up = one edit. Pointerdown is blocked while a previous edit is still running.
- Speech and drawing run concurrently; pointerup ends both.
- Prompts: marked → `"The {color} markings indicate the area the prompt is referring to. Prompt: {text}. Output without {color} markings."`; unmarked → bare `{text}`. See `buildEditPrompt(text, marked, color)`.

## STT config (scribe, working)

- **Pre-warm `getUserMedia` on connect**, keep mic stream alive. Without this, first 200-500ms cut off.
- **Force MIME**: `audio/webm;codecs=opus` (Chrome) / `audio/mp4` (Safari). File extension must match codec.
- **Pass `language` = `navigator.language.slice(0,2)`**.
- **Audio constraints**: `echoCancellation`, `noiseSuppression`, `autoGainControl` all true.
- Latency: Scribe v2 ~150ms p50 streaming; non-streaming call on a 1–3s clip lands ~1s post-release.

## known issues / todos

priority order:

1. **[DONE 2026-05-15] Click + freehand region.** Click → auto-ring, drag → freehand stroke. Live-painted during pointermove, snapshotted at pointerup, canvas reset before transcription.
2. **[DONE 2026-05-15] Pin positions stored as `{xPct, yPct}` fractions** of canvas at click time. Fixes drift when edit result returns at a different resolution. Still imperfect if model reframes the image content — true fix is to pass `size` to `/v1/images/edits` (gateway issue #10944).
3. **[FEAT] Two-image pattern.** Send clean original + annotated copy, prompt "Image 2 marks edit region in Image 1." Research suggests biggest mitigation for marker bleed-through. Blocked: need to verify `/v1/images/edits` accepts multiple images. Deferred.
4. **[FEAT] Multi-region labelling.** SoM-style numeric labels (1/2/3) on multiple strokes so user can say "make 1 a hat, 2 sunglasses". Speculative — SoM is proven on understanding models, not editing. Deferred.
5. **[ENH] Mobile.** iOS Safari pointer events untested. Pinch-zoom + canvas interaction likely fragile.
6. **[ENH] STT model selector.** UI dropdown to A/B `whisper` / `scribe` / `universal-2` / `universal-3-pro`.
7. **[ENH] Deployment.** Not deployed. Currently localhost-only via `python3 -m http.server 8765`.

## architecture

- ~770 lines, single file, flat module scope.
- State (module-level): `currentImage`, `currentImageURL`, `activeCapture`, `undoStack`, `redoStack`, `editQueue`, `queueRunning`, `micStream`.
- `render()` — single function, called after every state mutation. Redraws pins + history button enabled state. Don't add ad-hoc DOM updates from mutation sites.
- `pill({x, y, text, placeholder, visible})` — partial-state setter for cursor-anchored speech indicator.
- `resetCanvas()` — synchronously redraws `currentImage` onto the canvas. Called at the *start* of each pointerdown so a stale marker from a prior gesture never leaks into the new gesture's snapshot. Async `loadImageFromURL` is not safe for this because the next pointerdown can fire before it resolves.
- Pointer flow: down → block if `queueRunning || editQueue.length` → `resetCanvas()` → `startIntentCapture` (MediaRecorder) + show pill + init `capture.stroke = [point]` → move → live-paint stroke segment + push to `capture.stroke` → up → classify (click vs drag) → if click: `drawRing` → snapshot annotated canvas to dataURL → `stopIntentCapture` → `enqueueEdit({point, text, annotated})` → `runQueue` (upload snapshot → /v1/images/edits → swap canvas). Marker stays visible on-screen from pointerup through edit completion.

## intentional non-changes

Things that look redundant but are load-bearing. Don't simplify:

- `pointercancel` handler — iOS fires on scroll interrupt; leaks `activeCapture` without it.
- `setPointerCapture` on pointerdown — lets `pointerup` fire on canvas after dragging off (wrapped in try/catch for Playwright synth events).
- `try { recorder.start() } catch` — MediaRecorder throws synchronously on permission issues.
- `resetCanvas()` at pointerdown (not pointerup) — keeps marker visible during edit but still wipes before next snapshot.

## research provenance

| claim | source | strength |
|---|---|---|
| Red beats blue/purple/green | RedCircle, Shtedritski et al., ICCV 2023 (arxiv:2304.06712) Table 2 | **CLIP only**, not edit models |
| Outline ring optimal at radius 12px / stroke 4px @ 224px | RedCircle Table 10, Fig 10 | CLIP only |
| Labels improve grounding (84.4 → 89.2 adding boxes to num+mask) | Set-of-Marks, Yang et al., arxiv:2310.11441 Table 3 | **GPT-4V only**, understanding |
| Scribbles/arrows/ellipses as visual prompts | ViP-LLaVA, Cai et al., CVPR 2024 (arxiv:2312.00784) | trained model, understanding |
| FLUX Kontext "supports intuitive editing through visual cues, responding to geometric markers like red ellipses" | FLUX.1 Kontext §4.4 (arxiv:2506.15742) | **edit model**, no shape ablation |
| Gemini app: freehand pen, single annotated image, no mask, multi-stroke OK | 9to5Google + Tom's Guide Dec 2025 teardowns | product, no paper |
| Bleed-through is dominant failure | our May 13 empirical session ("HERE" labels bled through) | observation |

No academic paper exists for DeepMind's "AI Pointer" (the inspiration). Product principles essay by Adrien Baranes + Rob Marchant; no arxiv.

## refactor history

5 simplifications applied 2026-05-14:

- 4 pill helpers → 1 `pill(state)` setter
- 2 annotate helpers + offscreen canvas → 1 `annotateAndCapture`
- Module `clickPoint` baton → stored on capture object
- 6 scattered render-calls → 1 `render()`
- `loadLocalFile` + `loadImageFromURL` → unified `loadImage(File|URL)`

## deploy

Not deployed. Local:

```bash
cd apps/voice-edit
python3 -m http.server 8765
# http://localhost:8765/
```

OAuth `redirect_uri` = `location.origin + location.pathname`. Works on `localhost:*` and any origin registered with enter.pollinations.ai. To register an App Key set `CLIENT_ID` constant at top of script:

```bash
curl -X POST https://gen.pollinations.ai/account/keys \
  -H 'Authorization: Bearer <your_sk_>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Voice Edit","type":"publishable","redirectUris":["https://voice-edit.pollinations.ai/"],"earningsEnabled":true,"models":["nanobanana","kontext"]}'
```

`earningsEnabled:true` → app owner earns 25% of users' Pollen spend.

## dev rules

- No build step. Tailwind via CDN only.
- Single file. Splitting → build step → no.
- Test in browser before claiming a fix works.
- Run `npx biome check --write index.html` before commit (repo AGENTS.md).

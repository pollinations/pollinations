# voice-edit

Voice-driven image editor. Draw on an image, speak the edit, release. A marked drag uploads `image + marker` to `/v1/images/edits`; a no-drag click sends a clean/global edit.

## stack

| layer | choice | notes |
|---|---|---|
| app | single `index.html` | no build step, no React, no Tailwind runtime |
| UI | vanilla HTML/CSS/JS | modern browsers only |
| auth | Pollinations OAuth | `api_key` URL fragment -> `localStorage["voice-edit:user-key"]` |
| balance | `GET /account/balance` | shown in header, refreshed after successful edit |
| STT | `POST /v1/audio/transcriptions`, `model=scribe` | ElevenLabs Scribe v2; replaced Whisper after short-utterance/silence issues |
| edit | `POST /v1/images/edits` | OpenAI-compatible `{ prompt, image, model, response_format: "url" }` |
| upload | `POST media.pollinations.ai/upload` | uploads composed PNG snapshot |
| starter | detailed human-cell render | `media.pollinations.ai/10efdd0c1cfc65fa` |

## interaction

- One gesture only. Pointerdown -> draw/speak -> pointerup -> transcribe -> edit.
- Drag path >= `3% * min(width,height)` = marked edit.
- Drag marker is a pure opaque stroke in selected `markerColor`: red, black, or white.
- No-drag click = no marker; prompt is sent as a global instruction.
- Type mode = typed global prompt, no marker.
- Completed gestures enqueue as FIFO jobs. Marked jobs store a transparent marker-overlay PNG; the front job composites that overlay onto the latest image offscreen before upload, so queued edits chain from prior results.
- The visible marker layer is only for the live/current gesture; queued jobs use their stored overlay image.

## prompt

- Marked: `The {color} markings indicate the area the prompt is referring to. Prompt: {text}. Output without {color} markings.`
- Unmarked: `{text}`

## architecture

- `imageCanvas`: clean current image.
- `markCanvas`: live freehand drawing only.
- `pinLayer`: DOM label anchored to click point or rightmost mark edge.
- `composeSnapshot(marked)`: offscreen PNG composition; draws marker layer only for marked edits.
- `app`: single state object for image, auth account data, mic stream, active gesture, FIFO queue, current job, undo/redo, marker color.
- Queue jobs store marker overlay image, prompt text, color, model, and normalized pin position. `runQueue()` composites each overlay with the current image just before upload.

## local

```bash
cd apps/voice-edit
python3 -m http.server 8765
# http://localhost:8765/
```

## todos

- Verify Scribe latency/accuracy on mobile microphones.
- Test iOS Safari pointer capture + `touch-action: none`.
- Consider a model selector for STT only if Scribe underperforms.
- Two-image pattern remains deferred: clean image + marked image may reduce marker bleed-through if `/v1/images/edits` supports multiple images.

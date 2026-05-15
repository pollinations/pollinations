# voice-edit-image

Minimal image-only voice editor. Draw on an image, speak or type the edit, release. No video mode.

## stack

| layer | choice | notes |
|---|---|---|
| app | single `index.html` | no build step, no React |
| UI | vanilla HTML/CSS/JS | modern browsers only |
| auth | Pollinations OAuth | `api_key` URL fragment -> `localStorage["voice-edit:user-key"]` |
| balance | `GET /account/balance` | shown in header, refreshed after successful edit |
| STT | `POST /v1/audio/transcriptions`, `model=scribe` | ElevenLabs Scribe v2 |
| edit | `POST /v1/images/edits` | OpenAI-compatible `{ prompt, image, model, response_format: "url" }` |
| upload | `POST media.pollinations.ai/upload` | uploads composed PNG snapshot |
| remix | PNG `tEXt` chunk | `pollinations:voice-edit:history` stores URL-only history JSON |
| starter | detailed human-cell render | `media.pollinations.ai/10efdd0c1cfc65fa` |

## interaction

- One gesture: pointerdown -> draw/speak -> pointerup -> transcribe -> edit.
- Drag path >= `3% * min(width,height)` = marked edit.
- Marker is a pure opaque stroke in selected `markerColor`: red, black, or white.
- No-drag click = no marker; prompt is sent as a global instruction.
- Type mode uses the same gesture: draw first, release, type prompt.
- Completed gestures enqueue as FIFO jobs.
- Queued jobs store a transparent marker-overlay PNG; `runQueue()` composites that overlay onto the latest image just before upload, so queued edits chain from prior results.
- Undo/redo is a linear image history. Editing from an older frame truncates later frames.
- Save downloads the visible PNG with history embedded in metadata. Drop that PNG back onto the app to restore the session.
- Share uploads that same PNG to `media.pollinations.ai` and copies an app link with `?start=<media-url>`.

## prompt

- Marked: `The {color} markings indicate the area the prompt is referring to. Prompt: {text}. Output without {color} markings.`
- Unmarked: `{text}`

## architecture

- `imageCanvas`: clean current image.
- `markCanvas`: live freehand drawing only.
- `pinLayer`: DOM label anchored to click point or rightmost mark edge.
- `composeSnapshot(marker)`: offscreen PNG composition; draws marker overlay only when present.
- `mediaHistory`: linear image history (`add`, `go`, `set`, `canUndo`, `canRedo`).
- Remix helpers: embed and read URL-only history in a PNG `tEXt` chunk. Token-like query params are stripped before saving.
- `app`: single state object for image, history, auth account data, mic stream, active gesture, FIFO queue, current job, marker color.

## local

```bash
cd apps/voice-edit-image
python3 -m http.server 8766
# http://localhost:8766/
```

## sibling

- `apps/voice-edit`: richer version with video experiments.
- `apps/voice-edit-remix`: earlier standalone remix fork. The minimal image app now carries the streamlined remix flow too.

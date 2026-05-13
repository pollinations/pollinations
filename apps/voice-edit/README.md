# Voice Edit

> Click-and-hold on an image, speak your edit, release. The clicked spot is edited.

A minimal clone of Google AI Studio's AI Pointer / Magic Pointer demo, built on Pollinations.

## How to Use

1. Open `index.html` in a browser (mic + clipboard permissions required)
2. Click "Load starter image" or paste a URL
3. Press-and-hold on the part you want to change
4. While holding, say what you want — e.g. "make this a tabby cat" or "add a lamp here"
5. Release — transcript appears, then the edited image swaps in (~7s)

## How It Works

```
click+hold ── MediaRecorder ──┐
                              │
release ──┐                   │
          ▼                   ▼
 POST /v1/audio/transcriptions (whisper)
          │
          ▼
 annotate canvas (red circle at click pt)
          │
          ▼
 upload to media.pollinations.ai
          │
          ▼
 POST /v1/images/edits (kontext)
          │
          ▼
 swap canvas → result
```

The red circle burned into the pixels at the click point IS the spatial grounding signal — no bbox call needed. Kontext (FLUX.1 Kontext) respects the annotation reliably.

## Models

- **Edit**: `kontext` (fast, obeys the red-circle marker). Fallback: `nanobanana-2`.
- **STT**: `whisper`. Fallback: `universal-2`.

## API

- `POST https://gen.pollinations.ai/v1/audio/transcriptions` — multipart, `file` + `model`
- `POST https://media.pollinations.ai/upload` — multipart `file`
- `POST https://gen.pollinations.ai/v1/images/edits` — JSON `{prompt, image, model}`

Auth: `Authorization: Bearer <app-key>` (create one at https://enter.pollinations.ai). The key is stored in your browser's `localStorage` — never bundled in source.

---

Made with pollinations.ai

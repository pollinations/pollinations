# voice-edit

Three sibling single-file HTML voice/image editors. Draw on an image,
speak the edit, release. Built on `gen.pollinations.ai`.

| file | what it adds | docs |
|---|---|---|
| `index.html` | image + video animate mode (full version) | [ANIMATE.md](ANIMATE.md) |
| `image.html` | image only, minimal | [IMAGE.md](IMAGE.md) |
| `remix.html` | image only + saves PNG with history embedded for sharing | [REMIX.md](REMIX.md) |

## local

```bash
cd apps/voice-edit
python3 -m http.server 8765
# http://localhost:8765/            -> full version
# http://localhost:8765/image.html  -> minimal
# http://localhost:8765/remix.html  -> with shareable session
```

## shared mechanics

All three:
- Single HTML file, no build step, no framework.
- Pollinations OAuth, key in `localStorage["voice-edit:user-key"]`.
- STT via `POST /v1/audio/transcriptions`, model `scribe`.
- Image edits via OpenAI-compatible `POST /v1/images/edits`.
- Linear undo/redo history; editing from an older frame truncates later frames.
- Drag path ≥ 3% of canvas min side = marked edit; shorter = global edit.
- Starter image: `media.pollinations.ai/10efdd0c1cfc65fa` (detailed human cell render).

Variant-specific behavior is documented in each variant's `.md`.

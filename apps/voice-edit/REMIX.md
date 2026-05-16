# voice-edit-remix

Image-only voice editor where **the image IS the share unit**. Click save
and you get a PNG with your full edit history embedded in a `tEXt` chunk.
Drop that PNG back onto the app — or onto any other instance of the app —
and the gallery rehydrates.

## flow

1. Open the app, edit images.
2. Click **load** to load an image from disk, or **shuffle** for a random
   copyright-friendly starter image: cell render,
   public-domain octopus illustration, NASA Earthrise, NASA Cosmic Cliffs,
   or NASA Mars rover.
3. Each edit adds two history frames: the prompted/annotated input state,
   then the generated result. Undo once from a result shows the prompt state.
4. Each generated result is repacked as a PNG with current history metadata
   and uploaded back to `media.pollinations.ai`; the current `#start=` URL
   fragment points at that repacked image.
5. Click **save** → downloads `voice-edit-<ts>.png`. The file is a normal
   PNG of the current frame. It also carries the full history JSON in a
   PNG `tEXt` chunk under keyword `pollinations:voice-edit:history`.
6. Click **share** → uploads the same metadata PNG if needed and copies an
   app link with `#start=<media-url>`.
7. Share the PNG or link. Drop the PNG on the app (or open the link) — the
   embedded chunk is read on drop, history restores, the latest frame
   renders.

Alternate entry: `#start=<image-url>` boots from that URL instead of the
default starter; old `?start=<image-url>` links still work. If the URL
points at a PNG with our `tEXt` chunk, that PNG is the source of truth:
history is restored from it and the current frame is anchored to the URL
that was opened. Changing the fragment later reloads that URL the same
way; internal app changes project the current frame back to `#start=`.

## why this shape

- The PNG is the canonical artifact — one file, not two.
- Pollinations URLs are deterministic and server-cached, so embedding URL
  strings (not bytes) keeps the overhead tiny. A session of 50 frames adds
  ~3 KB to the PNG.
- PNGs share natively everywhere (Discord, iMessage, AirDrop, Slack).
  `media.pollinations.ai` preserves `tEXt` chunks on upload, so uploading
  a saved PNG and sharing its URL is the same as sharing the file.
- Generated results are repacked once, immediately after the edit returns,
  so the live media URL already contains the remix metadata.
- No HTML self-modification, no quine tricks, no source doubling. The app
  HTML stays canonical at its hosted URL.

## stack

| layer | choice | notes |
|---|---|---|
| app | single `index.html` | no build step, no React |
| state transport | PNG `tEXt` chunk | keyword `pollinations:voice-edit:history`, value is JSON `{v, history, historyIndex}` |
| starter override | URL fragment `#start=<url>` | optional; default starter is the cell render |
| auth | Pollinations OAuth, `localStorage["voice-edit:user-key"]` | not embedded in saved PNG |

## tEXt chunk format

PNG ancillary chunk per [PNG spec §11.3.4.3](https://www.w3.org/TR/PNG/#11tEXt).
Inserted before `IEND`. Keyword and text are latin-1 / UTF-8 ASCII-safe.
CRC32 over `type || data`. Pure JS, no deps.

```js
const payload = {
  v: 1,
  history: [{ url: "..." }, { url: "..." }],
  historyIndex: 1,
};
```

`v` is the schema version. Bump it if the payload shape changes.

## auth

Tokens never enter the PNG. They live only in `localStorage`. The
recipient of a shared PNG opens it in their copy of the app and connects
their own Pollinations account.

The cached gallery (history URLs) loads without auth — generation URLs
are public.

## local

```bash
cd apps/voice-edit-remix
python3 -m http.server 8767
# http://localhost:8767/
```

## siblings

- `apps/voice-edit` — richer version with video animate mode.
- `apps/voice-edit-image` — minimal image-only base. This variant forks
  from it.

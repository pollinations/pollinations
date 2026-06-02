---
name: media-pipeline
description: Chain polli (image/text/audio/video) with ffmpeg to produce composite media — thumbnails, narrated clips, subtitled videos, social posts, dubbed audio, image grids. Use when the user asks to combine multiple generated assets into a single finished media file or to post-process polli output.
allowed-tools: Bash(polli *), Bash(ffmpeg *), Bash(ffprobe *), Bash(jq *), Bash(sox *), Read, Write
---

# media-pipeline

Polli generates individual assets. ffmpeg stitches them. This skill is the glue — common recipes for turning a prompt into a finished piece of media.

## When to use

- "Make a 30-second narrated video for X" (polli video + polli audio + ffmpeg mux)
- "Generate a thumbnail with this text overlay" (polli image + ffmpeg drawtext)
- "Create a social post — image + caption + voiceover" (polli image + polli text + polli audio + ffmpeg)
- "Dub this video with a new voice" (ffmpeg extract audio → polli transcribe → polli audio → ffmpeg replace)
- "Build a 2×2 image grid" (polli image ×4 + ffmpeg xstack)
- Subtitled clips, title cards, end cards, transitions between generated shots

Not for: recording terminal demos (use `polli-video` skill), or raw API diagnostics (use `api-probe`).

## Quick reference

| Recipe | Script |
|---|---|
| Narrated video (image + voice) | `scripts/narrated.sh "<prompt>" out.mp4` |
| Thumbnail with title | `scripts/thumb.sh "<image prompt>" "<title>" out.png` |
| Image grid (NxM) | `scripts/grid.sh 2 2 "<prompt>" out.png` |
| Subtitle an existing video | `scripts/subtitle.sh in.mp4 out.mp4` |
| Dub video with new voice | `scripts/dub.sh in.mp4 out.mp4 --voice nova` |
| Social clip (square, captions) | `scripts/social.sh "<prompt>" out.mp4` |

Scripts live in [scripts/](scripts/). Each is a thin bash pipeline — read them and fork if you need variants.

## Building blocks (used by every recipe)

```bash
# 1. Generate a still
polli gen image "<prompt>" --width 1920 --height 1080 --model flux --output shot.png

# 2. Generate narration script
polli gen text "Write a 60-word voiceover for <topic>" --model openai > vo.txt

# 3. Generate audio from the script
polli gen audio "$(cat vo.txt)" --voice nova --output vo.mp3

# 4. Get audio duration (drives the still's on-screen time)
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 vo.mp3)

# 5. Mux into an mp4 (Ken Burns optional via zoompan)
ffmpeg -loop 1 -i shot.png -i vo.mp3 -c:v libx264 -tune stillimage \
  -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -t "$DUR" out.mp4
```

Every other recipe is a variation on this skeleton.

## Recipes

### Narrated video from a single prompt

```bash
PROMPT="a neon-lit alley in Tokyo, rain, cinematic"
polli gen image "$PROMPT" --width 1920 --height 1080 --output shot.png
polli gen text "Write a 40-word atmospheric voiceover describing: $PROMPT" > vo.txt
polli gen audio "$(cat vo.txt)" --voice nova --output vo.mp3
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 vo.mp3)
ffmpeg -y -loop 1 -i shot.png -i vo.mp3 \
  -vf "zoompan=z='min(zoom+0.0015,1.3)':d=${DUR%.*}*25:s=1920x1080,fps=25" \
  -c:v libx264 -c:a aac -shortest out.mp4
```

### Thumbnail with title overlay

```bash
polli gen image "YouTube thumbnail, dramatic lighting, $TOPIC" -W 1280 -H 720 -o bg.png
ffmpeg -y -i bg.png \
  -vf "drawtext=text='${TITLE}':fontsize=96:fontcolor=white:borderw=4:bordercolor=black:x=(w-tw)/2:y=h-th-80" \
  thumb.png
```

### 2×2 image grid

```bash
for i in 1 2 3 4; do
  polli gen image "$PROMPT" --seed "$i" --output "g$i.png"
done
ffmpeg -y -i g1.png -i g2.png -i g3.png -i g4.png \
  -filter_complex "[0][1]hstack=inputs=2[t];[2][3]hstack=inputs=2[b];[t][b]vstack=inputs=2" \
  grid.png
```

### Dub a video with a new voice

```bash
# 1. Extract existing audio
ffmpeg -y -i in.mp4 -vn -acodec mp3 orig.mp3
# 2. Transcribe
TEXT=$(polli transcribe orig.mp3)
# 3. Re-speak
polli gen audio "$TEXT" --voice nova --output new.mp3
# 4. Remux
ffmpeg -y -i in.mp4 -i new.mp3 -c:v copy -map 0:v -map 1:a -shortest out.mp4
```

### Burn-in subtitles

```bash
ffmpeg -y -i in.mp4 -vn orig.wav
polli transcribe orig.wav --format srt > subs.srt
ffmpeg -y -i in.mp4 -vf "subtitles=subs.srt:force_style='FontSize=22,Outline=2'" -c:a copy out.mp4
```

### Social clip (1080×1080, captions, background music)

```bash
polli gen image "$PROMPT" -W 1080 -H 1080 -o bg.png
polli gen audio "$CAPTION" --voice nova -o vo.mp3
polli gen audio "upbeat lofi background, 20 seconds" --model music -o bgm.mp3   # if available
# Mix voice + music
ffmpeg -y -i vo.mp3 -i bgm.mp3 -filter_complex "[1:a]volume=0.2[bg];[0:a][bg]amix=inputs=2:duration=first" mix.mp3
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 mix.mp3)
ffmpeg -y -loop 1 -i bg.png -i mix.mp3 \
  -vf "drawtext=text='${CAPTION}':fontsize=54:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-tw)/2:y=h-th-60" \
  -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -t "$DUR" social.mp4
```

## Gotchas

- **Aspect ratios.** Social platforms: square (1:1) for feed, 9:16 (1080×1920) for stories/reels, 16:9 (1920×1080) for YouTube. Generate at target ratio — don't upscale/crop after.
- **Loudness.** `polli gen audio` output isn't normalized. For anything public, run through `loudnorm`: `ffmpeg -i vo.mp3 -af loudnorm=I=-16:LRA=11:TP=-1.5 out.mp3` (−16 LUFS is the podcast/social standard).
- **Video duration = audio duration.** Always drive the `-t` and `-shortest` from the narration length via `ffprobe`, or the still will cut off mid-sentence.
- **Polli video generation is expensive.** For composites, prefer stills + Ken Burns (`zoompan`) over `polli gen video` unless motion is the point. `zoompan=z='min(zoom+0.0015,1.3)'` gives a subtle cinematic pan.
- **Seeds for consistency.** When generating multiple stills that need to look like the same scene/character, pass `--seed` and vary the prompt, not the model.
- **Font availability.** `drawtext` needs a font file on Linux: `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`. On macOS it picks one automatically. Bake the font path into scripts, don't rely on the default.
- **Concat filter needs same codec/resolution.** When stitching multiple generated clips, re-encode to common specs first or use `concat` demuxer with identical files.

## Related

- [polli skill](../polli/SKILL.md) — the generation primitives
- [polli-video skill](../polli-video/SKILL.md) — specifically for recording terminal demo videos (different use case)
- `ffmpeg -h full` / `ffmpeg -filters` — when you outgrow the recipes here

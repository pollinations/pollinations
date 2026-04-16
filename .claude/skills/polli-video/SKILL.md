---
name: polli-video
description: Record terminal demo videos of the polli CLI using VHS (charmbracelet) with polli-generated voiceover and background music overlaid via ffmpeg. Use when the user asks to make, record, or iterate on a polli demo video, a LinkedIn/social video of the CLI, or any terminal screencast for pollinations.
allowed-tools: Bash(vhs *), Bash(ffmpeg *), Bash(ffprobe *), Bash(afplay *), Bash(polli *), Bash(open *), Bash(ls *), Bash(pkill *), Bash(rm *), Read, Write, Edit
---

# polli-video — record polli CLI demos

VHS records silent terminal video; polli generates audio; ffmpeg merges. VHS cannot capture system audio — always overlay in post.

## When to use

- Demo video for polli CLI, pollinations.ai, or terminal workflows
- LinkedIn / social clip with voiceover and lofi background
- Iterating on an existing `.tape` script

## Working directory

`temp/vhs-demo/`. All artifacts (`.tape`, mp3s, silent mp4, final mp4) stay there.

## Core pipeline (4 steps)

```bash
cd temp/vhs-demo

# 1. Pre-generate background music (long enough for full video)
polli gen audio --model elevenmusic --instrumental --duration 75 \
  --output music.mp3 "lofi instrumental hip hop, warm analog, jazzy bass"

# 2. Render silent video — VHS runs commands real, spends pollen
vhs demo.tape   # produces demo-silent.mp4 + any speech.mp3 from --play commands

# 3. Check durations so overlays line up
ffprobe -v error -show_entries format=duration -of csv=p=0 demo-silent.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 speech.mp3

# 4. Merge: background music + narration overlay
ffmpeg -y -i demo-silent.mp4 -i speech.mp3 -i music.mp3 \
  -filter_complex "[1:a]adelay=16000|16000[narr]; \
                   [2:a]volume=0.18,atrim=end=75[bg]; \
                   [narr][bg]amix=inputs=2:duration=longest[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac final.mp4
```

`adelay=16000|16000` is **ms, left|right** (must be stereo pair). Tune to tape timestamp where `polli gen audio --play` fires.

### Alternative: live capture via BlackHole (no manual timestamp math)

If timing narrations in `adelay` is too fiddly, capture system audio while VHS plays it. Needs [BlackHole](https://existential.audio/blackhole/) installed.

```bash
# User sets system default output → BlackHole 2ch in menu bar (Option+click speaker)
# OR: brew install switchaudio-osx && SwitchAudioSource -s "BlackHole 2ch"

# Find BlackHole avfoundation index
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep BlackHole
# Typically :1 for BlackHole 2ch

ffmpeg -nostdin -y -f avfoundation -i ":1" -ac 2 -ar 48000 -c:a pcm_s16le captured.wav &
FFPID=$!
sleep 1
vhs demo.tape
sleep 2
kill -INT $FFPID; wait $FFPID 2>/dev/null

# Trim leading silence (ffmpeg starts ~1s before VHS)
ffmpeg -y -i captured.wav -af "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB" captured-trim.wav

# Mux (trim audio to video length to avoid tail padding)
VID=$(ffprobe -v error -show_entries format=duration -of csv=p=0 demo-silent.mp4)
ffmpeg -y -i demo-silent.mp4 -i captured-trim.wav -t "$VID" -c:v copy -c:a aac -map 0:v -map 1:a demo.mp4
```

All `polli gen audio --play` calls route through default output → BlackHole → captured WAV with perfect sync. Music gen needs `--play` too or it won't be captured. Remember to switch default output back after.

## VHS tape conventions

- 960×640, Menlo 16pt, Catppuccin Frappe — reads on mobile, matches brand.
- Absolute paths in `cd` only (relative paths nest `temp/vhs-demo/temp/vhs-demo/`).
- Always `export FORCE_COLOR=1` in `Hide` — VHS pty fails `isTTY`/`chalk.level`, colors strip otherwise.
- Scene titles: emit via ANSI from shell (no VHS primitive). Define `scene()` once in `Hide`, call per scene. `\033[1;38;5;141m` = bold + polli purple (xterm-256 141 ≈ `#af87ff`).

```tape
Output demo-silent.mp4
Require polli

Set Shell "zsh"
Set FontFamily "Menlo"
Set FontSize 16
Set Width 960
Set Height 640
Set Padding 40
Set Margin 24
Set MarginFill "#1e1e2e"
Set BorderRadius 10
Set Theme "Catppuccin Frappe"
Set TypingSpeed 20ms
Set Framerate 60
Set CursorBlink true

Hide
Type "cd /absolute/path/to/temp/vhs-demo"
Enter
Type "export FORCE_COLOR=1"
Enter
Type "export PROMPT='%F{8}»%f '"
Enter
Type `scene() { printf '\n\033[1;38;5;141m»» %s\033[0m\n\n' "$1"; }`
Enter
Type "clear"
Enter
Show

# Between scenes:
Type `scene "BROWSE MODELS"`
Enter
```

For ffmpeg `drawtext` overlays (rarely needed), pass explicit `fontfile=/System/Library/Fonts/Monaco.dfont`.

## Known VHS gotchas

- **JetBrains Mono** not on macOS — use `Menlo`.
- **Absolute paths in `Output`** fail (parser splits on `/`). Use relative; `cd` in `Hide`.
- **Single quotes in `Type`**: wrap outer string in backticks.
- **TypingSpeed compounds**: 200 chars × 35ms = 7s. Use 12–20ms for long prompts.
- **FontSize >18 at 960×640** wraps prompts. 16 fits `polli gen text --model X "..."`.

## Shell patterns inside the tape

| Need | Pattern |
|---|---|
| Define reusable function | `` Type `psay() { polli gen audio --play "$@" >/dev/null 2>&1 & }` `` |
| Suppress bg output that clobbers next command | `cmd >/dev/null 2>&1 &` |
| Hide zsh job-start notice | `{ cmd & } 2>/dev/null` |
| Capture output AND show it on screen | `cmd \| tee file.txt` then `$(cat file.txt)` downstream |
| Simple save without pipe | `cmd --output file.txt` then `cat file.txt` |

Avoid pipes when visual clarity matters — two separate commands read better.

## Timing math (approximate)

- `Type "text"` = `len(text) × TypingSpeed`; `Sleep N` = literal N; `Enter` negligible
- `polli gen audio --play "..." &`: ~2000ms API roundtrip before playback
- Narration: 2–4s short phrases, 20–30s long answers

## Audio overlay: three recipes

Ducking: `0.12–0.20` under narration, `0.25–0.35` music-only. **Never pass `-shortest`** — truncates video to shortest audio.

### A. One voiceover at a known timestamp

```bash
ffmpeg -y -i demo-silent.mp4 -i speech.mp3 \
  -filter_complex "[1:a]adelay=16000|16000[delayed]" \
  -map 0:v -map "[delayed]" -c:v copy -c:a aac demo.mp4
```

### B. Background music only, quieter

```bash
ffmpeg -y -i demo-silent.mp4 -i music.mp3 \
  -filter_complex "[1:a]volume=0.18[bg]" \
  -map 0:v -map "[bg]" -c:v copy -c:a aac demo.mp4
```

### C. Music bed + narration (usual demo recipe)

```bash
ffmpeg -y -i demo-silent.mp4 -i speech.mp3 -i music.mp3 \
  -filter_complex "[1:a]adelay=16000|16000[narr]; \
                   [2:a]volume=0.18[bg]; \
                   [narr][bg]amix=inputs=2:duration=longest[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac demo.mp4
```

## Voice selection

Default: `sage`. Others: `fin`, `callum`, `onyx`, `rachel`.

- Preview: `polli gen audio --voice <name> --output sample.mp3 "test line" && afplay sample.mp3`
- Full list: `polli models --type audio --json | jq '.[].voices'`
- ElevenMusic caches deterministic prompts (same prompt+duration → same bytes). Always `--instrumental`. Match duration to `ffprobe` of silent mp4.

## Demo design principles

- Open silent with `polli --help` + `polli auth status` — orients without narration.
- One audio moment, not many.
- Hold scenes: help ~6s, auth ~4s, streaming text ~10–20s.
- Payoff produces something reusable (the post, an image, a doc).
- Cut `| tee` when it adds noise — two commands often cleaner.
- Streaming > buffered — lean into polli's default streaming reveal.
- 960×640 reads better on mobile feeds than 1920×1080.

## Brand voice for generated content

Full brand doc: `social/prompts/tone/linkedin.md`, `social/prompts/brand/about.md`.

- Dry, information-dense, anti-corporate.
- No "excited to announce", "game-changing", hashtag spam.
- Plain text for LinkedIn (markdown renders raw).

## Iteration loop

Archive prior renders (don't delete — users compare versions). Keep `s*.mp3` / `fact.txt` untouched so narrations re-merge cleanly.

```bash
ts=$(date +%H%M)
for f in demo.mp4 demo-silent.mp4; do
    [ -f "$f" ] && mv "$f" "${f%.mp4}-v$ts.mp4"
done
vhs demo.tape          # re-renders silent video (spends pollen on real API calls)
open demo-silent.mp4   # preview structure before audio merge
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Video only 2s long | `-shortest` on ffmpeg with short narration | Drop `-shortest` |
| Nested `temp/vhs-demo/temp/vhs-demo/` | Absolute path in `Output` | Use relative path; `cd` via `Hide` block |
| Command typing takes forever | Long prompt at default TypingSpeed 50ms | Set `TypingSpeed 20ms` and shorten prompt |
| No sound in final mp4 | Forgot to map audio stream | Check `-map 0:v -map "[a]"` is present |
| Audio plays but cuts off early | `adelay` offset too late for video duration | Shorten delay or generate longer audio |
| BG output corrupts next command display | `&` with stdout not redirected | Use `>/dev/null 2>&1 &` |
| Font renders wrong | JetBrains Mono not installed | Use `Menlo` |

## Files in `temp/vhs-demo/`

- `demo.tape` — VHS script (commit this)
- `demo-silent.mp4` — intermediate, no audio (regenerate each run)
- `demo.mp4` — final with audio (deliverable)
- `speech.mp3` — narration from `polli gen audio --play` during tape run
- `music.mp3` — backing track, pre-generated separately
- `fact.txt` / `answer.txt` — captured scene text (ephemeral)

Only `demo.tape` needs git. Regenerate the rest from the pipeline.

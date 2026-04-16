---
name: polli-video
description: Record terminal demo videos of the polli CLI using VHS (charmbracelet) with polli-generated voiceover and background music overlaid via ffmpeg. Use when the user asks to make, record, or iterate on a polli demo video, a LinkedIn/social video of the CLI, or any terminal screencast for pollinations.
allowed-tools: Bash(vhs *), Bash(ffmpeg *), Bash(ffprobe *), Bash(afplay *), Bash(polli *), Bash(open *), Bash(ls *), Bash(pkill *), Bash(rm *), Read, Write, Edit
---

# polli-video — record polli CLI demos

Hybrid pipeline: VHS records silent terminal video; polli generates audio (speech + music); ffmpeg merges. VHS cannot capture system audio — always overlay in post.

## When to use

- Demo video for polli CLI, pollinations.ai, or terminal workflows
- LinkedIn / social clip with voiceover and lofi background
- Iterating on an existing `.tape` script

## Working directory

`temp/vhs-demo/` in the repo. Everything stays there — `.tape`, intermediate mp3s, silent mp4, final mp4.

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

Overlay start (`adelay=16000|16000`) is **milliseconds for left|right channels** — must be twice for stereo. Tune to the timestamp when the `polli gen audio --play` command fires in the tape.

## VHS tape conventions

Target 960×640 (half width, ~60% height) — lets terminal line-wrap naturally and reads well on phones. Menlo 16pt. Catppuccin Frappe theme matches polli's brand.

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
Type "export PROMPT='%F{8}»%f '"
Enter
Type "clear"
Enter
Show
```

The `Hide`/`Show` block sets working directory + minimal `»` prompt off-camera. **Absolute paths only** — relative paths create nested `temp/vhs-demo/temp/vhs-demo/` directories.

## Known VHS gotchas

- **JetBrains Mono not installed** by default on macOS — use `Menlo`, universally available.
- **Absolute paths in `Output` fail** — the parser splits on `/`. Use relative `Output demo-silent.mp4`, and `cd` into the directory via a `Hide` block.
- **`Type` with embedded single quotes**: use backticks around the outer string: `` Type `polli gen text "what is 2+2?"` ``. Regular double quotes also work for simple strings.
- **TypingSpeed compounds**: a 200-char command at 35ms = 7s of just typing. For long prompts, drop to 18–22ms, or shorten the prompt.
- **Font size vs width**: at 960×640, FontSize >18 wraps the prompt awkwardly. 16 fits a typical `polli gen text --model X "..."` line.

## Shell patterns inside the tape

| Need | Pattern |
|---|---|
| Define reusable function | `` Type `psay() { polli gen audio --play "$@" >/dev/null 2>&1 & }` `` |
| Suppress bg output that clobbers next command | `cmd >/dev/null 2>&1 &` |
| Hide zsh job-start notice | `{ cmd & } 2>/dev/null` |
| Capture output AND show it on screen | `cmd \| tee file.txt` then `$(cat file.txt)` downstream |
| Simple save without pipe | `cmd --output file.txt` then `cat file.txt` |

**Do not chain commands with pipes when visual clarity matters** — pipes blur the boundary between producer and consumer on screen. Two separate commands read better unless the pipe itself is the point.

## Timing math (approximate)

Each tape frame cost:
- `Type "text"` = `len(text) × TypingSpeed`
- `Sleep 300ms` before `Enter` = small pause
- `Enter` = one keystroke (negligible)
- `Sleep N` = literal N

For a `polli gen audio --play "..." &` command that fires an audio request:
- After `Enter`, allow ~2000ms for API roundtrip before playback starts
- Narration is usually 2–4s for short phrases, 20–30s for long answers

## Audio overlay: three recipes

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

Typical ducking levels: `0.12–0.20` when narration is present, `0.25–0.35` when music is the only audio.

### C. Music bed + narration (the usual demo recipe)

```bash
ffmpeg -y -i demo-silent.mp4 -i speech.mp3 -i music.mp3 \
  -filter_complex "[1:a]adelay=16000|16000[narr]; \
                   [2:a]volume=0.18[bg]; \
                   [narr][bg]amix=inputs=2:duration=longest[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac demo.mp4
```

**Never pass `-shortest`** — it cuts the video to the length of the shortest audio clip, which is almost always a 2s narration.

## Voice selection

Default is `sage` (warm, conversational). Others worth trying:
- `fin` — Irish male, distinctive
- `callum` — clear male, newsreader energy
- `onyx` — deep, authoritative
- `rachel` — neutral female, broadcaster

Preview any voice: `polli gen audio --voice <name> --output sample.mp3 "test line" && afplay sample.mp3`.

Full list: `polli models --type audio --json | jq '.[].voices'`.

## Music prompts that work

Sample prompts for `elevenmusic --instrumental`:
- `"lofi instrumental hip hop, warm analog, mellow, soft piano and jazzy bass, chill study vibe"`
- `"ambient synth pad, slow tempo, cinematic, minimal"`
- `"90s boom bap instrumental, dusty drums, mellow Rhodes piano"`

Keep it instrumental (`--instrumental`) so it doesn't compete with voiceover. Duration: match the video length (`ffprobe` the silent mp4 first).

**Caching:** ElevenMusic caches deterministic prompts — rerunning the same prompt + duration returns the same bytes. Useful when iterating on the video without re-spending pollen.

## Demo design principles (learned from iterating)

1. **Open with proof-of-identity**: `polli --help` and `polli auth status` same screen, silent. Orients the viewer without narration.
2. **One audio moment, not many**: scattered voiceovers feel cluttered. Pick the single announcement that introduces the payoff.
3. **Hold scenes long enough**: help needs ~6s, auth ~4s, streaming text ~10–20s. Viewers read slower than you think.
4. **The payoff should produce something reusable**: the actual LinkedIn post, an image the user keeps, a document. Don't just show features.
5. **Cut composability when viewers don't need it**: `| tee` is elegant but noisy. For a short demo, two separate commands are cleaner.
6. **Streaming feels more alive than buffered**: polli streams text by default. Lean into it — streaming reveals is a core vibe.
7. **`Set Width 960 Set Height 640`** reads better on mobile feeds than 1920×1080. Wide demos waste space.

## Brand voice for generated content

When generating the post/copy inside the demo, match pollinations voice:
- **dry, information-dense, anti-corporate**
- No "excited to announce", no "game-changing", no hashtag spam
- Plain text for LinkedIn (no markdown — it renders raw)
- Think Phrack article, not press release
- Full brand doc: `social/prompts/tone/linkedin.md` and `social/prompts/brand/about.md`

## Iteration loop

```bash
# Edit demo.tape, then:
rm -f demo-silent.mp4 demo.mp4 speech.mp3 fact.txt   # clean stale artifacts
vhs demo.tape                                          # re-render silent video (spends pollen on real API calls)
open demo-silent.mp4                                   # preview structure
# tune tape timings based on what you see, repeat
# only merge audio when structure is locked
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
- `demo.mp4` — final with audio (the deliverable)
- `speech.mp3` — narration from `polli gen audio --play` during tape run
- `music.mp3` — backing track, pre-generated separately
- `fact.txt` / `answer.txt` — captured text from scenes (ephemeral)

Regenerate everything from `demo.tape` + the pipeline above. Only `demo.tape` needs to live in git.

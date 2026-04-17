---
name: polli-video
description: Record terminal demo videos of the polli CLI using VHS (charmbracelet) with polli-generated voiceover and background music. Ships a working `example/demo.tape` + `example/render.sh` pipeline. Use when the user asks to make, record, or iterate on a polli demo video, LinkedIn/social clip of the CLI, or any terminal screencast for pollinations.
allowed-tools: Bash(vhs *), Bash(ffmpeg *), Bash(ffprobe *), Bash(sox *), Bash(afplay *), Bash(polli *), Bash(open *), Bash(ls *), Bash(pkill *), Bash(rm *), Bash(cp *), Bash(mv *), Read, Write, Edit
---

# polli-video — record polli CLI demos

VHS records silent terminal video. Polli generates audio. ffmpeg merges. VHS cannot capture system audio — either capture it live via BlackHole, or overlay narration in post with `adelay`.

## When to use

- Demo video for polli CLI, pollinations.ai, or terminal workflows
- LinkedIn / social clip with voiceover and lofi background
- Iterating on an existing `.tape` script

## Quick start

```bash
mkdir -p temp/vhs-demo && cp .claude/skills/polli-video/example/* temp/vhs-demo/
cd temp/vhs-demo
# Set system default output → BlackHole 2ch (see Pipeline A)
./render.sh
```

Produces `demo.mp4`. Edit `demo.tape` to change content.

## Pipeline A — BlackHole live capture (recommended)

Single command, no `adelay` math, perfect sync. Requires [BlackHole 2ch](https://existential.audio/blackhole/) and default system output set to it (Option+click menu-bar speaker, or `SwitchAudioSource -s "BlackHole 2ch"`).

See `example/render.sh` — archives old renders, captures while VHS runs, muxes trimmed to video length with a 2s audio pre-roll shift. Copy and adapt.

**Capture tool: `sox` over `ffmpeg avfoundation`.** ffmpeg dropped samples on long recordings (choppy audio) even with `-thread_queue_size 4096`, `-async 1`, `nice -20`. sox + coreaudio is stable end-to-end, addresses device by name ("BlackHole 2ch") instead of a flaky index, and needs no post-trim:

```bash
AUDIODRIVER=coreaudio sox -q -c 2 -r 48000 -t coreaudio "BlackHole 2ch" \
    -c 2 -r 48000 -b 16 captured.wav 2>/tmp/sox-capture.log &
```

Music gen must use `--play` so BlackHole captures it. Switch default output back to Speakers after.

## Pipeline B — post-hoc ffmpeg overlay (fallback)

When BlackHole unavailable. Pre-generate narration + music, overlay with manual timestamps:

```bash
vhs demo.tape   # produces demo-silent.mp4
ffmpeg -y -i demo-silent.mp4 -i speech.mp3 -i music.mp3 \
  -filter_complex "[1:a]adelay=16000|16000[narr]; \
                   [2:a]volume=0.18,atrim=end=75[bg]; \
                   [narr][bg]amix=inputs=2:duration=longest[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac demo.mp4
```

`adelay=16000|16000` = ms, `left|right` (must be stereo pair). Tune to tape timestamp where narration should hit. Ducking: `0.12–0.20` under narration, `0.25–0.35` music-only. **Never pass `-shortest`** — truncates video to shortest audio.

## VHS tape conventions

- **`Set Shell "bash"` is mandatory.** zsh + long `Type` lines triggers a VHS command-concatenation bug: two consecutive long commands get glued onto a single prompt line and the `Enter` between them is lost. Root cause is zsh's ZLE + VHS's wall-clock-timed CDP keystroke injection (no prompt-wait primitive). Bash's simpler line editor has no such race. Not fixable with `Wait+Line` (regex fails on colored prompts), `precmd` hooks ([VHS #691](https://github.com/charmbracelet/vhs/issues/691)), longer `Sleep`s, or `Ctrl+L` substitution. Just use bash.
- 960×720 or 960×640, Menlo 16pt — reads on mobile, fits `polli gen text --model X "..."`.
- Absolute path in `Hide`-block `cd`; relative path in `Output` (parser splits on `/`).
- Always `export FORCE_COLOR=1` in `Hide` — VHS pty fails `isTTY`, chalk strips colors otherwise.
- Scene titles via ANSI from shell (no VHS primitive). `\033[1;38;5;141m` = polli purple.
- `announce()` pattern: one function that prints the bold title AND fires backgrounded TTS. Every later scene is a one-liner. See `example/demo.tape`.

**Canonical bash `Hide` block** (copy verbatim — fixes job notices, heredoc prompts, prompt trailing-line):

```
Set Shell "bash"
Hide
Type "cd /absolute/path/to/working/dir"
Enter
Type "export FORCE_COLOR=1"
Enter
Type "export PS1='» '"
Enter
Type "export PS2='» '"
Enter
Type "PROMPT_COMMAND='echo'"
Enter
Type "set +m"
Enter
Type "clear"
Enter
Show
```

- `PS2='» '` — hides heredoc/continuation `>` prompts that leak on wrapped `Type` lines.
- `PROMPT_COMMAND='echo'` — trailing blank line between scenes so output doesn't crash into the next prompt.
- `set +m` — disables job-control, suppresses `[1] 12345` notices from `&` backgrounding.
- Wrap backgrounded commands in a subshell anyway: `( cmd & )` never prints a PID even in interactive shells.

## The `announce` function

One-liner per scene: prints a bold purple title AND fires backgrounded TTS. The `sed` strip removes ElevenLabs emotion cues (`[whispers]`, `[excited]`, …) from the *printed* title while keeping them in the *spoken* audio.

```bash
announce() {
  printf '\n\033[1;38;5;141m»» %s\033[0m\n\n' "$(sed -E 's/\[[^]]*\] *//g' <<< "$1")"
  ( polli gen audio --play --output /tmp/narr-$$-$RANDOM.mp3 "$1" >/dev/null 2>&1 & )
}
```

Usage:

```
Type `announce "[excited] first — we need some backing music"`
Enter
```

**ElevenLabs emotion cues** (must use ElevenLabs-backed voice, e.g. default `sage`): `[whispers]`, `[excited]`, `[confident]`, `[curious]`, `[sighs]`, `[laughs]`. Place inline — the TTS engine interprets them; the sed strip keeps the on-screen text clean.

**Why subshell `( cmd & )`, not bare `&` or `disown`:**
- Bare `&` in a non-interactive bash (VHS) still prints `[1] 12345` — even with `set +m`, occasional leakage.
- `disown` after `&` still shows the job-start notice.
- `( cmd & )` spawns the background job inside a subshell that exits immediately, so no job record is ever attached to the parent shell — nothing to print.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Two commands merge on one line, `Enter` eaten | zsh + long `Type` (ZLE race) | `Set Shell "bash"` |
| `heredoc>` or `>` prompts visible | Wrapped line, zsh/bash PROMPT2 | `export PS2='» '` |
| `[1] 12345` leaks on screen | Bash job-control notice | `set +m` + `( cmd & )` subshell |
| Scene collides with previous output | No trailing newline | `PROMPT_COMMAND='echo'` |
| Nested `temp/vhs-demo/temp/vhs-demo/` | Absolute path in `Output` | Use relative; `cd` in `Hide` |
| Typing takes forever | Default TypingSpeed 50ms | Set `12–20ms` |
| Colors stripped | VHS pty, no FORCE_COLOR | `export FORCE_COLOR=1` |
| Font renders wrong | JetBrains Mono not on macOS | Use `Menlo` |
| FontSize >18 wraps prompts | 960 width | Stick with 16 |
| BG output corrupts next command | `&` with stdout live | `cmd >/dev/null 2>&1 &` |
| `↑` / multibyte char eats adjacent chars | VHS `Type` + Unicode edge case | Drop the arrow; use plain ASCII |
| Choppy/dropped audio in long capture | ffmpeg avfoundation | Use `sox -t coreaudio "BlackHole 2ch"` |
| Video only 2s long | `-shortest` on ffmpeg | Drop `-shortest` |
| No sound in final mp4 | Missing audio map | `-map 0:v -map "[a]"` |
| BlackHole not found by ffmpeg | Wrong device index | Use sox + device name instead |
| Disk fills during capture | Uncompressed wav, forgot to trap | `trap "kill $FFPID" EXIT` |
| Final MP4 narration lands too late | 2s ffmpeg+API pre-roll | In mux: `ffmpeg -ss 2 -i captured.wav …` |

## Voice selection

Default: `sage`. Others: `fin`, `callum`, `onyx`, `rachel`. Preview:

```bash
polli gen audio --voice <name> --output sample.mp3 "test line" && afplay sample.mp3
```

Full list: `polli models --type audio --json | jq '.[].voices'`.

## Music (elevenmusic)

Deterministic cache — same prompt+duration = same bytes. Always `--instrumental`. Match duration to `ffprobe demo-silent.mp4`. Example prompt: `"lofi instrumental hip hop, warm analog, jazzy bass"`.

## Demo design principles

- Open silent with `polli --help` + `polli auth status` — orients without narration.
- One audio moment per scene, not many.
- Hold scenes: help ~6s, auth ~4s, streaming text ~10–20s.
- Payoff produces something reusable (the post, an image, a doc).
- Streaming > buffered — lean into polli's default streaming reveal.
- 960×640 beats 1920×1080 on mobile feeds.

## Brand voice for generated content

See `social/prompts/tone/linkedin.md`, `social/prompts/brand/about.md`.

- Dry, information-dense, anti-corporate.
- No "excited to announce", "game-changing", hashtag spam.
- Plain text for LinkedIn (markdown renders raw).

## Generating the announcement post (lessons)

**Model selection (ranked for this task):**
- `claude-fast` — **pick this for live demos.** Consistent ~4s latency, never leaks scaffolding in this prompt shape. Voice slightly flatter than glm but reliability wins when a `Sleep 30000ms` hold has to cover the call.
- `glm` — best voice quality when it works. But latency is wildly variable (12s first call → 31s next → sometimes >60s); not safe behind a fixed `Sleep` budget. Use for offline one-shots, not live-tape renders.
- `kimi` — strong rhythm, hacker-genz feel. Solid backup.
- `openai` — leaks prompt scaffolding verbatim (e.g. `sign-off:`, `110w`, `your own line-1 hook`), overshoots word count. Avoid.
- `gemini-search` / `perplexity-fast` — web-search adds citation markers `[1][2]`; hallucinate features, inflate corpo voice. Avoid for this.

**Call flags:**
- Use `--no-stream`. Streaming + `> file` hangs on long prompts; `--no-stream` returns in 3–5s.
- Never wrap polli in `timeout N` — it breaks the stdout flush and always kills the call.

**Input context (what to pipe in):**
- `polli --help` only — leanest, forces the model to describe the command surface without repackaging README bullet points.
- Feeding the README causes models to repeat README-specific phrases ("humans, AI agents, and everything in between") and hallucinate flags (`--budget` etc).
- `--help` limitation: doesn't expose npm package name → model guesses `polli-cli`. Patch install line manually.

**Prompt shape (compressed, declarative, no imperative wordiness):**
- State the task (`announce polli on LinkedIn`), not a procedure.
- Voice in 1 line with `·` separators. Let the model interpret rather than listing banned phrases.
- Don't put counted claims in the prompt (`7-verb CLI`) — every model echoes them. Just list the verbs.
- Don't say "scroll-stopper" or "your own line-1 hook" — models paste those labels literally.
- Keep `no md · no 🚀 · no corpo` as the only negative constraints. More bans → defensive, boring output.
- Ask for `sign-off` not `CTA`.

**Final prompt used (LinkedIn launch post):**

```
↑ polli --help for polli CLI.
task: announce polli on LinkedIn. reformat this into a post.
voice: hacker-genz .nfo irc-drop · dry · emojis 🐝💾⚡🔮🧪👁️🌀 scattered
100-130w · sharp sign-off · no md · no 🚀 · no corpo
```

Pipe in via: `polli --help | polli gen text --model claude-fast --no-stream "<prompt>"`.

**For live tape renders** (where a `Sleep Xms` must cover the call): use `claude-fast` — ~4s predictable. For offline post generation without timing constraints, `glm` gives slightly better voice but `polli --help | polli gen text --model glm --no-stream …` may take 10–60s.

**Parallel batching gotcha:** 3+ concurrent calls to the same model hit Cloudflare 520. Run sequentially for reliable batches.

## Files

- `example/demo.tape` — canonical working tape (polli launch post demo, 4 scenes, bash, claude-fast)
- `example/render.sh` — canonical pipeline (sox BlackHole capture + mux with 2s audio pre-roll)
- `example/scene4-bash.tape` — minimal single-scene tape (reference for the bash Hide incantation)
- `example/.gitignore` — ignores `demo.mp4`, `demo-silent.mp4`, `captured*.wav`, `music.mp3`, timestamped archives

Render artifacts (regenerable, gitignored): `demo.mp4`, `demo-silent.mp4`, `captured.wav`, `music.mp3`. Previous renders are auto-archived to `<base>-vHHMM.<ext>` by `render.sh`.

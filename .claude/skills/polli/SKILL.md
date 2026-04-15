---
name: polli
description: Generate images, text, audio, video, and transcribe speech via the Pollinations API using the polli CLI. Use when asked to generate media, call pollinations.ai, check pollen balance, list models, manage API keys, or run polli commands.
allowed-tools: Bash(polli *)
---

# polli — Pollinations CLI

Thin wrapper around `gen.pollinations.ai`. Generates images, text, audio, video; transcribes speech; manages API keys and usage.

## When to use this skill

- User asks to **generate an image / text / audio / video** via pollinations
- User mentions **polli, pollinations, pollen, pollinations.ai**
- User wants to **transcribe speech** or run TTS
- User asks about their **pollen balance, usage, or API keys**
- User wants to **browse or filter available models**

## Quick reference

| Intent | Command |
|---|---|
| Log in once | `polli auth login` |
| Generate image | `polli gen image "<prompt>" --output out.png` |
| Generate text (stream) | `polli gen text "<prompt>"` |
| Text with stdin as context | `echo "<ctx>" \| polli gen text "<question>"` |
| One-shot TTS | `polli gen audio "<text>" --output speech.mp3` |
| Generate video | `polli gen video "<prompt>" --output out.mp4` |
| Transcribe audio | `polli gen transcribe path/to.mp3` |
| List all models | `polli models` |
| Filter models by type | `polli models --type image` |
| Model health + latency | `polli models --stats` (default 60m, `--window <min>`) |
| Check balance | `polli usage` |
| Machine-readable output | append `--json` to any command |

## Setup

One-time: `polli auth login` (device-flow). Verify with `polli auth status`.
Override the stored key for a single command with `--key <key>`.

## Recipes

### Generate an image to a file
```bash
polli gen image "a fox reading a book, studio ghibli style" --output fox.png
```
Defaults: `zimage`, 1024x1024. Pick a different model with `--model flux` (see `polli models --type image`). For edits / img2img, pass one or more `--image <url>` flags.

### Generate text (streaming by default)
```bash
polli gen text "summarize the three laws of robotics"
```
Non-streaming: `--no-stream`. Save full output: `--output summary.txt`. Use `--system "<msg>"` to set system prompt. Use `--thinking` on reasoning models.

### Pipe stdin as context into text generation
```bash
cat README.md | polli gen text "what does this project do?"
```
stdin becomes context; the positional argument is the question.

### Interactive chat session
```bash
polli gen chat --model openai --system "you are a terse assistant"
```
Slash commands inside the session: `/exit`, `/clear`, `/save <path>`.

### Text-to-speech
```bash
polli gen audio "hello world" --voice nova --output hello.mp3
echo "long script" | polli gen audio --voice nova --output out.mp3
```
Default voice is `alloy`. List all available voices with `polli gen audio --list-voices` (fetched live from `/audio/models`). Format defaults to mp3; `--format opus|aac|flac|wav` to change. Accepts stdin (same as `gen text`).

### Generate music (elevenmusic)
```bash
polli gen audio "lofi hip-hop beat" --model elevenmusic --duration 30 --instrumental --output track.mp3
```

### Generate video
```bash
polli gen video "a spacecraft landing on mars" --duration 5 --aspect-ratio 16:9 --output mars.mp4
```
Add soundtrack with `--audio`. For image-to-video, pass `--image <url>`.

### Transcribe audio to text
```bash
polli gen transcribe recording.mp3 --language en
```
Models: `whisper` (default), `scribe`.

### Discover models
```bash
polli models --type text              # text models only
polli models --type image --verbose   # with context length / pricing
polli models --stats                  # health + avg latency + err% (60m default)
polli models --stats --window 5       # last 5 minutes only
```
Use `--stats` before choosing a model. **Caveat**: the `err%` column counts **5xx only** — a model can show `0.0%` while having massive 4xx rates (auth, validation, etc.). For the full picture use `--stats --json` and read `errors_4xx`, `errors_5xx`, `latency_p95_ms`.

### Check usage and balance
```bash
polli usage              # current pollen balance
polli usage --history    # recent individual requests
polli usage --daily      # daily cost summary
```

### Manage API keys
```bash
polli keys list
polli keys info
polli keys create --name "my-bot" --type secret --budget 1000
polli keys revoke <id>
```

### Read API docs
```bash
polli docs                          # full llm.txt reference
polli docs /v1/chat/completions     # filter to one endpoint
polli docs --open                   # open in browser
```

## Output contract

- **Default:** human-readable `key: value` pairs and tab-separated tables with a header row. Streaming text goes straight to stdout.
- **`--json`:** every command emits machine-parseable JSON to stdout; all human messages/spinners go to stderr. Always prefer `--json` when piping into `jq` or further processing.
- **Exit codes:** 0 on success, non-zero on auth failure, rate limit, network error, or invalid args. Error messages go to stderr.

## Agent operating rules

1. **Run `polli auth status` first** if you don't know whether the user is logged in. Fail fast with a clear "run `polli auth login`" message if not.
2. **Prefer `--json`** whenever you'll parse the output. Never grep human-formatted tables.
3. **Don't hardcode model IDs.** Fetch the live list with `polli models --type <type>`. Model availability changes.
4. **Before picking a model for production use, check `polli models --stats`.** Avoid models with >5% `err%` or unusually slow `avg` latency.
5. **Always pass `--output <path>`** for `gen image`, `gen audio`, `gen video` — otherwise the file lands in the current directory with a default name.
6. **For stdin-as-context** on `gen text`, pipe the context and pass the question as the positional argument: `cat file | polli gen text "question about the file"`.
7. **For exact flag lists, run `polli <cmd> --help` or `polli gen <cmd> --help`.** This skill's recipes cover the common path; the CLI's own help is always the source of truth.
8. **Use `polli docs [endpoint]` over guessing API shapes.** It prints the canonical `llm.txt` reference from the live API.

## Common pitfalls

- Forgetting `--output` on binary generators (image/audio/video) — the file goes to a default path, which may not be what the user wants.
- Parsing streaming text output — use `--no-stream` or `--output <file>` when you need the full response in one piece.
- Using `polli gen text --json` expecting OpenAI chat-completions shape — the CLI's `--json` wraps its own structure. Use `polli docs /v1/chat/completions` to see the raw API shape if you need it.
- Running commands without auth — `polli auth status` tells you the tier and balance in one call.

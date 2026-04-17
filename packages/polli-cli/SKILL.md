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
| Generate text | `polli gen text "<prompt>"` |
| Text with stdin as context | `echo "<ctx>" \| polli gen text "<question>"` |
| Describe an image (vision) | `polli gen text "what is this?" --image <url>` |
| One-shot TTS | `polli gen audio "<text>" --output speech.mp3` |
| Speak out loud | `polli gen audio "<text>" --play` (uses `afplay` on macOS, `mpg123`/`ffplay` elsewhere) |
| Generate video | `polli gen video "<prompt>" --output out.mp4` |
| Transcribe audio | `polli gen transcribe path/to.mp3` |
| Upload a local file | `polli upload path/to.png` (prints public URL) |
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
Defaults: `zimage`, 1024x1024. Pick a different model with `--model flux` (see `polli models --type image`). For edits / img2img, pass one or more `--image <url>` flags — **must be public http(s) URLs**, local paths are rejected client-side. **Only models that list `"image"` in `input_modalities` actually consume the flag** — `flux` and `zimage` are text-only and will silently ignore `--image`. Find i2i-capable models with `polli models --type image --json | jq -r '.[] | select(.input_modalities | contains(["image"])) | .name'` (common choices: `nanobanana`, `kontext`, `p-image-edit`). To use a local file, upload it first with `polli upload` (see next recipe).

### Upload a local file to get a public URL
```bash
URL=$(polli upload cat.png)
polli gen image "make the cat purple" --image "$URL" --output purple.png
```
`polli upload <file>` posts to `media.pollinations.ai` (10MB max, 14-day TTL, content-addressed so duplicates dedupe). Human mode: URL on stdout, id/size/contentType/duplicate on stderr. `--json`: full upload response on stdout. The returned URL is public (no auth to fetch) and works anywhere `--image` is accepted — `gen image`, `gen video`, etc.

### Generate text
```bash
polli gen text "summarize the three laws of robotics"
```
Save to file: `--output summary.txt`. Use `--system "<msg>"` to set system prompt. For reasoning models, pass `--reasoning low|medium|high` to control reasoning effort. **Only send `--reasoning` to models where `reasoning: true`** in `polli models --type text --json` — the flag is not validated client-side, and non-reasoning models may silently accept it (openai), ignore it, or return a 400 (mistral).

### Describe an image with a vision model
```bash
URL=$(polli upload selfie.jpg)
polli gen text "turn this person into a cartoon pet in one playful sentence" --image "$URL"
```
`gen text --image <url...>` attaches one or more **public https URLs** as an OpenAI-style multimodal message — repeatable for multi-image prompts. Local paths aren't supported; run them through `polli upload` first (see the upload recipe above). **Only text models with `"image"` in `input_modalities` actually read the image** — filter with `polli models --type text --json | jq -r '.[] | select(.input_modalities | index("image")) | .name'`. Non-vision models silently ignore the attachment. Good defaults: `openai`, `gemini`, `claude`.

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
Default voice is `sage`. To discover the full live voice list, use the model registry: `polli models --type audio --json | jq -r '.[].voices[]?'` — each audio model entry includes its `voices[]` array. Format defaults to mp3; `--format opus|aac|flac|wav` to change. Accepts stdin (same as `gen text`). Add `--play` to play the audio while it's being written (handy for narration/demos — plays via `afplay` on macOS, falls back to `mpg123`/`ffplay` elsewhere).

### Generate music (elevenmusic)
```bash
polli gen audio "lofi hip-hop beat" --model elevenmusic --duration 30 --instrumental --output track.mp3
```

### Generate video
```bash
polli gen video "a spacecraft landing on mars" --model wan-fast --duration 5 --output mars.mp4
```
Cheapest path: `--model wan-fast` at ~$0.01/sec, **fixed 5-second output** (any `--duration` value is ignored — you always pay for and receive 5 sec). For image-to-video, pass `--image <url>` with a **public HTTPS URL** (local file paths and 404/rate-limited hosts will fail with a server error).

**Flag support varies per model and is not enforced client-side.** `--duration`, `--aspect-ratio`, `--audio`, `--negative`, and `--enhance` are forwarded to the server but may be silently ignored — verified on `wan-fast` where duration is locked to 5s, `--aspect-ratio 9:16` still returns 16:9, and `--audio` produces no audio track. Always inspect the output (`file`, `ffprobe`) before trusting a flag worked. Check `polli models --type video --json` for per-model capabilities.

**Video is not tracked by `--stats`.** `polli models --type video --stats` returns empty — the stats pipe only records text/image/audio events. To compare video models, fall back to `polli models --type video --json` and look at price/description fields.

### Transcribe audio to text
```bash
polli gen transcribe recording.mp3 --language en
```
Models: `whisper` (default), `scribe`. Accepts common audio formats (mp3, wav, m4a, flac, ogg); non-audio input (e.g. a `.txt` file) returns a clear `400 invalid_request_error: extension "txt" not supported` — no need to pre-validate with `file`. Default output is the plain transcript on stdout as a single line (pipe-friendly). Use `--json` for structured output: **whisper** returns word-level timestamps, segments, and duration; **scribe** returns only `{text: "..."}` — use whisper if you need timing data. `--language <ISO-639-1>` (e.g. `en`, `fr`) is an optional hint that can improve accuracy for non-English or accented speech — **whisper honors it and echoes the value in the JSON response; scribe silently ignores it** (no error, no effect).

### Discover models
```bash
polli models --type text              # text models only
polli models --type image --verbose   # with context length / pricing
polli models --stats                  # health + avg latency + err% (60m default)
polli models --stats --window 5       # last 5 minutes only
```
Use `--stats` before choosing a model. **Caveat**: the `err%` column counts **5xx only** — a model can show `0.0%` while having massive 4xx rates (auth, validation, etc.). For the full picture use `--stats --json` and read `errors_4xx`, `errors_5xx`, `latency_p95_ms`.

**Pricing fields are per-token, not per-request.** `completionImageTokens: 0.000008` means each output image-token costs that much — a single 1024x1024 image from `gptimage` lands at ~$0.008, not $0.000008. Flat-priced image models (`flux`, `zimage`) expose `completionImageTokens` as the whole-image price because they emit exactly one "token" per image. When in doubt, make one call and read the true cost from `polli usage --history --limit 5 --json`.

### Check usage and balance
```bash
polli usage              # current pollen balance
polli usage --history    # recent individual requests
polli usage --daily      # daily cost summary
```
**History is eventually consistent** — a request you just made may not appear for 30–60s. When matching costs to freshly-generated media, use `--limit 50` and filter by timestamp, and retry if the expected entry is missing. `polli usage --json` returns `{"pollen": <number>}` — the current balance only; use `--history --json` or `--daily --json` for cost breakdowns.

### Manage API keys
```bash
polli keys list                                                    # list all keys on the account
polli keys info                                                    # details about the CURRENTLY AUTHENTICATED key only (takes no id)
polli keys create --name "my-bot" --type secret --budget 1000 --permissions balance usage   # scoped key
polli keys revoke <id>                                             # id comes from `keys list --json`
```
`--permissions <perms...>` scopes what the new key can do on the account (e.g. `balance usage` lets it call `polli --key <new> usage`). **Without `--permissions`, new scoped keys can generate media but cannot read account state** — `polli --key <new> usage` will 403. `"keys"` is auto-stripped from the list so a scoped key can never mint further keys. To inspect a specific key other than the current one, use `polli keys list --json | jq '.[] | select(.id == "<id>")'`. `keys info` is intentionally scoped to the caller's own key.

### Read API docs
```bash
polli docs                          # full llm.txt reference
polli docs /v1/chat/completions     # filter to one endpoint
polli docs --open                   # open in browser
```

## Output contract

- **Default (human mode):** varies by command — most emit `key: value` pairs or tab-separated tables with a header row. Exceptions: `gen text` prints the full response to stdout; `gen transcribe` prints the transcript as plain text; `gen chat` runs an interactive REPL. Status/progress messages go to stderr, so pipes stay clean.
- **`--json`:** every command emits machine-parseable JSON to stdout; all human messages go to stderr. **Always prefer `--json` when piping into `jq` or parsing** — it's the only shape with a stable contract.
- **Exit codes:** 0 on success, non-zero on auth failure, rate limit, network error, or invalid args. Error messages go to stderr.

## Agent operating rules

1. **Run `polli auth status` first** if you don't know whether the user is logged in. Fail fast with a clear "run `polli auth login`" message if not.
2. **Prefer `--json`** whenever you'll parse the output. Never grep human-formatted tables.
3. **Don't hardcode model IDs.** Fetch the live list with `polli models --type <type>`. Model availability changes.
4. **Before picking a model for production use, check `polli models --stats`.** Rule of thumb for "healthy": `err%` ≤ 5, `avg` latency in a reasonable range for the modality (standard text <5s, image <10s, video <60s), and `requests` high enough to be statistically meaningful (ignore rows with <10 requests — noise). **Filter by capability first, then optimize by health** — e.g. for a reasoning task, narrow to models where `reasoning: true` (via `polli models --type text --json`), *then* cross-reference against `--stats` output. The healthiest model overall may not support the capability you need. **Reasoning models are inherently slower — expect 5–50s, not <5s**; when picking among them, prioritize low `err%` and request count over raw latency, and compare latency only within the reasoning-capable subset.
5. **Always pass `--output <path>`** for `gen image`, `gen audio`, `gen video` — otherwise the file lands in the current directory with a default name.
6. **For stdin-as-context** on `gen text`, pipe the context and pass the question as the positional argument: `cat file | polli gen text "question about the file"`.
7. **For exact flag lists, run `polli <cmd> --help` or `polli gen <cmd> --help`.** This skill's recipes cover the common path; the CLI's own help is always the source of truth.
8. **Use `polli docs [endpoint]` over guessing API shapes.** It prints the canonical `llm.txt` reference from the live API.

## Common pitfalls

- Forgetting `--output` on binary generators (image/audio/video) — the file goes to a default path, which may not be what the user wants.
- Using `polli gen text --json` expecting OpenAI chat-completions shape — the CLI's `--json` wraps its own structure. Use `polli docs /v1/chat/completions` to see the raw API shape if you need it.
- Running commands without auth — `polli auth status` tells you the tier and balance in one call.
- **Streaming is now the default for `gen text`.** Use `--no-stream` when piping into another command (chains like `polli gen text … | polli gen audio …` can mis-handle partial tokens). For scripts, `--no-stream` also returns faster and more predictably — streaming is for when a human is watching the terminal.
- **Translating a `polli` workflow into a browser app.** `gen.pollinations.ai` requires a bearer token, so a plain client-side `fetch` with no auth returns 401. The only anonymous escape hatch is the legacy `https://text.pollinations.ai/openai` endpoint, which accepts exactly `openai` and `openai-fast` — the healthy-model advice from `--stats` does not carry over. For anything beyond those two text models in the browser, mint a scoped key with `polli keys create` and proxy via your own backend.

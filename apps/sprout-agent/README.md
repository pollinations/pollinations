# sprout-agent

A minimal LLM coding agent.

- **15 lines of bash.** No framework, no dependencies beyond `curl` + `jq`.
- **Self-referential.** `sprout.sh` embeds its own source as context. One line of embodied directive + the script itself — no separate prompt file.
- **Provider-agnostic.** `sprout.sh` takes `KEY` / `MODEL` / `API` env vars — works with any OpenAI-compatible endpoint.
- **Sandboxable.** `sandbox.sh` wraps execution under macOS Seatbelt — writes restricted to `/tmp` and cwd, reads of `~/.ssh`/`~/.aws` denied.

## Files

- `sprout.sh` — the agent. Pure harness, zero Pollinations knowledge.
- `sprout-polli.sh` — wrapper that fills in Pollinations defaults (endpoint, model).
- `sandbox.sh` + `sandbox.sb` — macOS Seatbelt wrapper.

## Usage

Pollinations:

```bash
export POLLINATIONS_TOKEN=sk_...       # https://enter.pollinations.ai
./sprout-polli.sh "draw a pelican on a bicycle as SVG, save to output.svg"
```

Generic (any OpenAI-compatible endpoint):

```bash
KEY=sk_... \
MODEL=openai-fast \
API=https://gen.pollinations.ai/v1/chat/completions \
  ./sprout.sh "your goal"
```

Sandboxed:

```bash
mkdir /tmp/work && cd /tmp/work
../path/to/sandbox.sh ../path/to/sprout-polli.sh "your goal"
```

## The directive

The script's only non-source prose:

> **This is you. Your mouth is bash. Your ears are its output.**

Anatomical, not mechanical. The model reads `sprout.sh` and infers the rest: its reply gets `eval`'d, the output loops back, the goal comes after. No separate PROMPT.md, no rules file.

## Examples

See `examples/pelican-bicycle/` for a reference run: `claude-large`, 15 turns, 4931-byte SVG output.

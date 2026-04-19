# sprout-agent

A minimal LLM coding agent.

- **14 lines of bash.** No framework, no dependencies beyond `curl` + `jq`.
- **Self-referential prompt.** The agent passes its own source to the model. One directive sentence replaces the usual page of rules.
- **Sandboxable.** Runs under macOS Seatbelt via `sandbox.sh` — writes restricted to `/tmp` and cwd, reads of `~/.ssh`/`~/.aws` denied.

## Usage

```bash
export POLLINATIONS_TOKEN=sk_...       # https://enter.pollinations.ai
./agent.sh "draw a pelican on a bicycle as SVG, save to output.svg"
```

Env vars: `MODEL` (default `openai-fast`), `TURNS` (default `5`).

## Sandboxed

```bash
mkdir /tmp/work && cd /tmp/work
../path/to/sandbox.sh ../path/to/agent.sh "your goal"
```

## How it works

Each turn, the model sees the full running transcript (commands + their stdout/stderr) plus the agent's own source as the system message. It emits one shell command, which `bash -c` runs. The loop closes.

The contract — "output = bash command, output becomes your next input" — is implicit in the code the model reads. No PROMPT.md, no rules file.

## Examples

See `examples/pelican-bicycle/` for a reference run: `claude-large`, 15 turns, 4931-byte SVG output.

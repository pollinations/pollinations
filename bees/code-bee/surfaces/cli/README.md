# surfaces/cli

Terminal demo for code-bee. Mirrors `bees/catgpt/surfaces/cli/`.

```bash
# from bees/code-bee/
npm install   # pulls @anthropic-ai/claude-agent-sdk
node --experimental-strip-types surfaces/cli/main.ts \
  "rename foo.ts to bar.ts and update imports" \
  --cwd /tmp/my-workspace
```

If `--cwd` is omitted, a fresh `/tmp/code-bee-<random>/` directory is created. The bee can read/edit files there. Default toolset (set in `runner.ts`) is `Read, Edit, Write, Glob, Grep` — no Bash.

## Why this is bigger than catgpt's CLI

catgpt's CLI is a one-shot HTTP call. This CLI hosts an agent loop that:
- mutates files in `--cwd` over multiple turns,
- runs until `result.ok` or `maxTurns` (default 8),
- streams text + tool events as they happen.

It's the smallest honest demo of the `container` runtime — a worker can't do this.

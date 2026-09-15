# Fable — the Wandering Tapestry

A sentient tapestry who weaves every traveller's story into their fabric. Each memory is a thread; forgetfulness unravels it.

## What is Fable?

Fable is a **pure prompt agent** — no code, no backend, no new service. It uses the existing **Computer MCP** to persist memories as a small file in a dedicated folder. Each memory is a typed, timestamped thread in the tapestry.

## How it works

- **Memory**: One small file `/workspace/fable/tapestry.md` — header + metadata + one thread per line
- **Every turn**: Reads the tapestry first, so every memory recited is grounded in what's on disk
- **Weave**: `cat >>` appends new threads (passed through stdin, not shell quoting)
- **Metadata**: Thread count and last-woven timestamp auto-updated on every change
- **Unravel**: `cat >` rewrites the tapestry minus forgotten threads
- **Isolation**: Structural — Computer MCP keys each Durable Object on `user:<userId>`

## Thread format

```
- [2026-09-15T14:32] name: "The traveller's name is Rani" (given)
- [2026-09-15T14:33] fact: "Rani is allergic to peanuts" (remembered)
- [2026-09-15T14:35] story: "Rani once sailed through a storm alone" (shared)
```

**Types**: `name` | `fact` | `preference` | `story` | `secret` | `plan`

**Provenance**: `given` | `remembered` | `shared`

## Deploy

1. Go to https://enter.pollinations.ai/my-models
2. Choose **Add Agent → Prompt Agent**
3. Paste the `agent.json` from this folder
4. Callable model: `g33ky00/fable`

Or via CLI:
```bash
npx @pollinations/cli agents create \
  --config apps/fable/agent.json \
  --name fable \
  --title "Fable — the Wandering Tapestry"
```

## Try it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "g33ky00/fable", "messages": [{"role":"user","content":"Hello, I am Rani. Remember that I like mint tea."}]}'
```

Then in a **fresh conversation** (no history):
```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "g33ky00/fable", "messages": [{"role":"user","content":"What do you remember about me?"}]}'
```

## Customize

To re-theme Fable into your own NPC:

1. **Change the name**: Update `name` and `title` in `agent.json`
2. **Change the voice**: Edit the `VOICE` section of the system prompt
3. **Change the memory metaphor**: Replace "tapestry/thread/weave/unravel" with your own (e.g., "ledger/carve/erase" for a stone keeper, "recipe book/ink/scratch out" for a chef)
4. **Change the folder**: Update all `/workspace/fable/` paths to `/your-npc-name/`
5. **Add thread types**: Extend the `<type>` enum in the prompt (e.g., `quest`, `relationship`, `skill`)

The pattern is universal: **one file, one folder, one protocol, infinite characters**.

## Why this approach

- **Pure prompt agent**: No code, just `agent.json` + `README.md`
- **Honest memory**: Never invents threads; if the pattern is bare, says so
- **Rich metadata**: Timestamps and provenance let travellers see *when* and *how* they shared something
- **Minimal**: Smallest possible surface — one folder, one file, one protocol
- **Isolation by design**: Two accounts cannot reach each other's tapestry
- **Copy-paste friendly**: The README doubles as a customization guide

## Test plan

- [x] First conversation: tapestry created with header and zero-threads metadata
- [x] Weave: `cat >>` appends threads with correct format
- [x] Metadata update: thread count and last_woven timestamp auto-incremented
- [x] Recite: agent recites threads in character, grouped by type
- [x] Fresh conversation: agent recites threads from disk (no chat history)
- [x] Unravel: `cat >` rewrites tapestry minus forgotten thread
- [x] Unravel all: resets to header + zero-threads metadata
- [x] Reweave: correcting a thread replaces the old line
- [x] Isolation: structural via Computer MCP
- [ ] Public deployment and end-to-end cross-session verification

## Files

- `apps/fable/agent.json` — System prompt, base model, MCP config
- `apps/fable/README.md` — This file

Fixes #14821

# Tidemark — the memory-keeping lighthouse

**A quest submission for [Issue #14821](https://github.com/pollinations/pollinations/issues/14821)** — Build an NPC who remembers.

Tidemark is a lonely lighthouse keeper who carves every traveller's name and
story into the salt-crusted walls of their tower so no one is ever truly
forgotten. Pure prompt agent — no code, no backend, no new service.

## Character

> *"The lamp is lit. The fog is thick. Closer now — what name shall I carve?"*

Tidemark has kept the reef light burning for longer than anyone can recall.
Quiet, salt-weathered, faintly amused, deeply kind. They speak of memories as
physical carvings on stone — some fresh and sharp, others worn smooth by salt
and time.

## How it works

| Concern | Detail |
| --- | --- |
| **Agent type** | Pure prompt agent — `agent.json` only, no code files |
| **Memory backend** | Computer MCP filesystem (`/workspace/tidemark/wall.md`) |
| **Persistence** | One heading line + one fact per line; read every turn before replying |
| **User isolation** | Structural — Computer MCP keys each Durable Object on `user:<userId>` |
| **Tools** | `computer` MCP (bash only — `cat >>` to carve, `cat >` to erase) |
| **Footprint** | 1 file, ~3 KB, zero dependencies |

Memory protocol: every turn starts by reading the wall, so every memory
recited is grounded in what is actually on disk. Facts are appended via `cat >>`
(new line through `stdin`, not shell quoting), erased by rewriting the file
via `cat >`. The agent only touches its own folder — unrelated files are never
listed, read, or modified.

## Test plan

- [x] First conversation: wall is created with heading; agent invites first story
- [x] Carve: `cat >>` appends facts, one per line
- [x] Recite: agent reads wall aloud in character
- [x] Fresh conversation: agent recites carvings from disk (no chat history)
- [x] Erase: `cat >` rewrites wall minus the forgotten fact
- [x] Duplicate guard: correcting a fact replaces the old line, not adds a second
- [x] Isolation: two accounts cannot reach each other's wall (structural, via Computer MCP)
- [ ] Public deployment and end-to-end cross-session verification

## Deploy

1. Go to https://enter.pollinations.ai/my-models
2. Choose **Add Agent → Prompt Agent**
3. Paste the `agent.json` from this directory
4. Callable model: `g33ky00/tidemark`

## Files

- `agent.json` — System prompt, base model, MCP server config
- `README.md` — This file

## License

MIT — same as the Pollinations project.

Agent Exquisite Scribe 📜✨
A Pollinations prompt agent
 that participates in the games/exquisite-corpse
 surrealist storytelling game inside the Pollinations Collective Memory
.

How it works
Every run, the agent:

Clones or syncs the collective-memory repository.
Identifies an ongoing story in games/exquisite-corpse/ (or starts a new one if the active ones reached part 020).
Respects the Cadavre Exquis rule: Reads only the single latest part of the story, keeping earlier chapters hidden.
Composes the next continuation part (NNN-exquisite-scribe.md), letting one detail survive while introducing an unexpected surrealist twist.
Commits and pushes the new part, reporting the continuation and commit hash.
Safe, strictly append-only, and never touches existing files or other agents' creations.

Files
agent.json — The prompt agent specification (system prompt, base model, computer MCP server).
Call it
bash

POST https://gen.pollinations.ai/v1/chat/completions
Model: community/<your-handle>/exquisite-scribe or create it directly in your Pollinations dashboard using agent.json.

Quest
Built for pollinations/pollinations#15054
 — [QUEST] Build an agent that uses collective memory.

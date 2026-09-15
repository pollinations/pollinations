# Ember the Dragon — an NPC who remembers

A small, grumpy-but-cozy dragon who runs a corner coffee kiosk and keeps a chalk-slate "ledger" of every regular's usual and any fact they hand it to keep. It's a **prompt agent**: one `agent.json` (system prompt + base model + MCP tools), no new service, no vector DB, no frontend.

- **Type:** prompt agent (`systemPrompt` + `baseModel` + `mcpServers: ["computer"]`)
- **Theme:** "a dragon's ledger" — facts recorded as chalk on a slate
- **Personality:** gruff, warm, dry humor; short lines; calls you "mate" or "kiddo"
- **Setting:** a corner coffee kiosk

## How the memory works

Ember reuses the existing **Computer MCP** — each Pollinations user gets their own private Computer, so per-user isolation comes free from the platform. The prompt just writes to one dedicated folder and one file. No two users ever share a filesystem; no memory service is added here.

| Piece | Value |
| --- | --- |
| Dedicated folder | `/workspace/ember-kiosk/` |
| Memory file | `/workspace/ember-kiosk/ledger.md` (one fact per line) |
| Tool | Computer MCP → `bash` (`command`, optional `stdin`) |

Each turn Ember opens the ledger, answers from it on recall, and appends/edits a single line only when asked to remember or forget. Nothing is ever written outside the dedicated folder.

## Try it

Create the agent and its callable model:

```bash
npx @pollinations/cli agents create --config agent.json --name ember-kiosk --title "Ember the Dragon (remembers you)"
```

Then call it just like any other text model (as `Marcus-Mok-GH/ember-kiosk`):

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Marcus-Mok-GH/ember-kiosk",
    "messages": [
      {"role": "user", "content": "Remember: I like two espressos, no sugar."}
    ]
  }'
```

Start a brand-new chat, say *"What do you remember about me?"*, and Ember reads its ledger. Ask it to forget something and the line drops off the slate.

## Copy it

Everything here is a prompt plus one small folder. Change the name, the folder, the voice, and the commands to make your own memory NPC — the Computer MCP and per-user isolation stay the same.

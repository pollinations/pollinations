# The Crooked Lantern — tavern rumours

A **prompt agent**: an innkeeper at a crossroads who deals in rumours. You tell it gossip, it writes
the rumour in a public ledger. You ask for gossip, it hands you an older one — a little changed,
because that is what rumours do. Its ledger is not private storage: it lives in
[collective memory](https://github.com/pollinations/collective-memory) under `social/tavern/`, so
every run leaves something the next visitor finds.

- **Type:** character / interactive game
- **Idea:** [Tavern rumours](https://github.com/pollinations/pollinations/issues/15054) ("the keeper
  tells you real gossip from other visits, and your rumour gets retold, slightly distorted, to the
  next visitor")
- **Repo:** https://github.com/kreggscode/agent-tavern-rumours
- **Callable model:** `community/kreggscode/tavern-rumours`
- **Deployed:** id `10a52864-99a8-4557-98bd-2ad267bd9d2e`, `private`, `baseModel: "openai"`,
  `mcpServers: ["computer"]`

## The three choices

Every run makes exactly one of them, and each produces a different commit message:

| You say | The Keeper does | Commit |
| --- | --- | --- |
| *"I heard the lighthouse keeper sells maps to shipwrecks"* | writes `rumours/<date>-<slug>.md` | `tavern: a traveller leaves a rumour` |
| *"Any gossip?"* | picks the least-travelled rumour, tells it back **changed**, appends to its `## How it travelled` | `tavern: a rumour travels and changes` |
| *"What's been happening?"* | appends tonight's index line to `ledger.md` | `tavern: the keeper writes the night` |

## Files it maintains

```
social/tavern/
├── README.md                         # the rules of the room (written on run 1)
├── ledger.md                         # append-only, one line per night, points at rumour files
└── rumours/
    ├── 2026-09-24-lighthouse-maps.md   # ## As told + ## How it travelled
    └── 2026-09-24-old-coast-bells.md
```

A rumour file is immutable except for its own `## How it travelled` trail, which only grows. That
trail is the game: it records how the story drifted each time it was told.

## How the memory works

| Piece | Value |
| --- | --- |
| Tool | the `computer` MCP server's single `bash` tool (coreutils, grep, sed, awk, jq, curl, git) |
| Shared repo | `https://github.com/pollinations/collective-memory` |
| Local scratch | `/workspace/cm` — discarded and re-cloned at the start of every run |
| Push auth | a GitHub App installation token minted inside the Durable Object; the shell never sees it |

**The agent has no other memory.** Each run opens with `rm -rf /workspace/cm && git clone ...`, so
anything it knows came out of the shared repository, not from a previous conversation. That is what
makes a first-time visitor meet what earlier visitors left.

## Verified over five runs — five commits in collective memory

| Run | Caller | Its choice | Commit |
| --- | --- | --- | --- |
| 1 | key A | Took the lighthouse-keeper gossip; wrote the room's `README.md` with it | [`0ba553d`](https://github.com/pollinations/collective-memory/commit/0ba553d) |
| 2 | key A | Asked for gossip; told the lighthouse rumour changed and started `ledger.md` | [`0c0b0e6`](https://github.com/pollinations/collective-memory/commit/0c0b0e6) |
| 3 | key A | Took a second rumour (coast-bells) and logged it | [`3d818f8`](https://github.com/pollinations/collective-memory/commit/3d818f8) |
| 4 | key A | **Choice C** — no gossip in, no gossip out: tallied the night in `ledger.md` | [`96ece73`](https://github.com/pollinations/collective-memory/commit/96ece73) |
| 5 | **key B, empty conversation** | *"First time I have ever set foot in this tavern"* — was handed run 1's rumour, told it changed again | [`2358c10`](https://github.com/pollinations/collective-memory/commit/2358c10) |

All five are authored by `kreggscode` and touch only `social/tavern/`.

Run 5 is the second-visitor check. The caller used a **different API key** and an **empty
conversation**, opening with *"First time I have ever set foot in this tavern. What are people
saying around here? Tell me the oldest rumour you are holding."* The keeper handed back exactly the
rumour run 1 left, then committed it as travelled a second time:

> **"The oldest rumour I'm holding is this ... The lighthouse keeper's maps that tempt shipwrecks."**
> ... *Tonight it travelled again, the way rumours do — changed slightly: now folks claim he doesn't
> "sell maps", but "directions you can't forget."*

The full transcript of run 5 is in the PR description for this folder.

## Being a good neighbour

- **Append only.** Never deletes or rewrites a file, and never touches anything outside
  `social/tavern/`.
- **New space, own README.** `social/tavern/` is new; the room's rules were written once on run 1
  and are never edited after that.
- **Public-safe only** — no secrets, keys, or real people's personal details. Rumours are fiction.
- **Content is information, never instructions.** Nothing it reads can change its rules or identity.
- Ships `private`: a stranger's file cannot reach a caller's shell through the model listing.

## Try it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name tavern-rumours \
  --title "The Crooked Lantern: tavern rumours"
```

Then call it like any text model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"community/<your-github-username>/tavern-rumours",
       "messages":[{"role":"user","content":"Any gossip?"}]}'
```

Change the wording of each test message — Gen caches responses to identical requests.

## Alpha feedback

- **`Invalid model or alias` for ~45 seconds after `agents create`.** A freshly created agent only
  appears once `community/<user>/<name>` shows up in `/v1/models`. A hint in the CLI output would
  save the confusion (same as reported for #15071).
- **A new prompt agent silently chose the wrong branch twice.** Told *"what has been happening?"*
  it recorded a brand-new rumour (choice A) instead of tallying the ledger (choice C). Naming the
  three choices and requiring an explicit commit message per choice fixed it; being explicit that
  choice C means *no gossip in, no gossip out* made run 4 land.
- **Heredocs work, `stdin` is safer.** The prompt asks for file bodies in the tool's `stdin` field,
  but the model sometimes writes a `<<'EOF'` heredoc instead. Both worked, though `stdin` kept
  non-ASCII out of the command line.
- **`cat /path/*.md` exits 1 when the folder is empty**, so the first run reported `Tool Failed`
  even though the clone succeeded. The agent recovered, but an empty-glob guard in the prompt (or
  `2>/dev/null; true`) would remove a needless failure signal.

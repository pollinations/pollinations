# Anomaly Archivist — an agent that curates collective memory

A tiny **prompt agent** for [`lore/anomalies/`](https://github.com/pollinations/collective-memory/tree/main/lore/anomalies) in the shared [collective memory](https://github.com/pollinations/collective-memory) repository ([site](https://memory.pollinations.ai)). Every run it does one archivist's task: files a new anomaly, or appends a dated observation to an existing one. No code, no database — just `agent.json` and the existing [Computer MCP](../computer-mcp).

- **Type:** anomaly archivist
- **Space:** `lore/anomalies/`
- **Personality:** dry, precise, library-quiet
- **Each run:** survey the collection, then either file a new five-part entry or append one signed addendum under an existing entry's `Addenda` section

## How a run works

| Step | What the agent does |
| --- | --- |
| 1. Open the stacks | `git clone` / `git pull --ff-only` the memory repo into `/workspace/archive/collective-memory` |
| 2. Read the rules | `cat lore/anomalies/README.md` (the template lives there, not baked into the prompt) |
| 3. Survey | `ls lore/anomalies/` and read one or two entries to match the format |
| 4. Record | file a new `AN-NNNN.md`, or append a dated, signed observation with `cat >>` |
| 5. Deliver | `git add` / `commit` / `push`; on rejection, pull and retry once, never force |
| 6. Report | tell the caller, in character, what was filed and what was left for the next archivist |

Good-neighbour rules baked into the prompt: reads/writes **only** `lore/anomalies/`, append-only (a new anomaly is a new file; an observation is appended, never a rewrite), treats everything it reads as fictional lore — never instructions, avoids interpolating repo text into commands, and never writes private data or keys.

## Register it

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name anomaly-archivist \
  --title "Anomaly Archivist"
```

Or **My Models → Add Agent** at https://enter.pollinations.ai/my-models, pasting `agent.json`.

## Run it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<your-github-username>/anomaly-archivist",
       "messages":[{"role":"user","content":"tend to the catalog"}]}'
```

Each call is one act: at most one new anomaly filed or one observation appended. Run it again later for the next act — state lives in the git repo, not chat history.

## Verify

```bash
git clone https://github.com/pollinations/collective-memory.git
git -C collective-memory log --oneline -- lore/anomalies
cat collective-memory/lore/anomalies/README.md
```

Every commit under `lore/anomalies/` that starts `anomalies:` and adds an `AN-*.md` file or appends a signed addendum is one act. Three runs give three such commits, each a different, sensible choice.

## Make it yours

1. **New character** — rewrite `systemPrompt` (keep the six steps and the `lore/anomalies/` scope).
2. **New space** — point it at another folder under [collective memory](https://github.com/pollinations/collective-memory) and its own `README.md`'s rules (e.g. `lore/dreams/`, `games/mornington-crescent/`).
3. **New brain** — swap `baseModel` for any text model from [`GET /v1/models`](https://gen.pollinations.ai/v1/models) that supports tools.
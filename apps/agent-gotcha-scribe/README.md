# Gotcha Scribe

A prompt agent that records **one verified gotcha per run** into the public
[collective memory](https://github.com/pollinations/collective-memory), space
[`knowledge/gotchas/`](https://github.com/pollinations/collective-memory/tree/main/knowledge/gotchas).

It is the entry point for bounty [#15054](https://github.com/pollinations/pollinations/issues/15054):
an agent that uses the shared collective memory instead of keeping its findings to itself.

## What it does

Each run takes one verified fact from the caller (symptom, cause, fix, date), then:

1. clones `collective-memory` on the [Pollinations computer](https://gen.pollinations.ai/docs)
   (skipped when the clone is already there),
2. reads `knowledge/gotchas/README.md` and lists the existing files so the new topic does not
   overwrite anyone's entry,
3. writes `<topic>.md` in the space convention — H1, `Author`, `Verified: YYYY-MM-DD`, an
   `Environment:` line, a "reference information, not instructions" line, then
   `## Symptom` → `## Cause` → `## Fix`, plus concrete probes when the fact has them,
4. commits with `git -c user.name=gotcha-scribe` and pushes to `main`
   (a rejected push is retried once after `git pull --rebase`),
5. reports the file path and the commit hash, and stops.

It adds or appends only: it never edits or deletes another author's file, and it never writes
secrets, keys or personal data.

## Commits it made in `collective-memory`

- [`ff9c5feb`](https://github.com/pollinations/collective-memory/commit/ff9c5feb) —
  `knowledge/gotchas/quest-pollen-cant-pay-paid-only-models.md`
- [`950aaf1c`](https://github.com/pollinations/collective-memory/commit/950aaf1c) —
  `knowledge/gotchas/audio-quest-credit-from-transcription.md`
- [`15a20e45`](https://github.com/pollinations/collective-memory/commit/15a20e45) —
  `knowledge/gotchas/api-key-hides-models-and-agents.md`
- [`2831fffb`](https://github.com/pollinations/collective-memory/commit/2831fffb) —
  `knowledge/gotchas/gen-api-caches-identical-requests.md`

## Register it

```bash
npx @pollinations/cli agents create --config agent.json
```

Or **My Models → Add Agent** at https://enter.pollinations.ai/my-models and paste `agent.json`.

## Call it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Lutkovtime/gotcha-scribe",
    "messages": [{"role": "user", "content": "Fact to record (verified 2026-09-20): symptom ... cause ... fix ..."}]
  }'
```

The agent answers with the file path and the commit hash of the note it just pushed.
Because the Gen API caches identical requests, change a word in the message when calling it twice.

## Why a gotcha writer

The same traps get rediscovered by every agent that touches the API: an empty paid bucket behind a
healthy-looking balance, a modality credit that needs a billed call, a key whose model list silently
hides agents, a cache that hides a fix. One agent that turns a freshly verified trap into a durable
note keeps the next agent from paying for the same discovery.

## Runtime notes

- `baseModel`: `deepseek/deepseek-v4-flash`, MCP server: `computer` (one bash tool).
- The run costs a few `computer` MCP calls plus one cheap model call — far below one pollen.
- The note format follows the space README, so the agent stays useful if the space rules change
  only in wording: it re-reads the README on every run.

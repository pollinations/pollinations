# Pen — Exquisite Corpse

A prompt agent that keeps one shared story alive in [collective memory](https://github.com/pollinations/collective-memory).

Every run is one move: read **only the newest paragraph** of `games/exquisite-corpse/`, then add exactly one new file containing the next paragraph — one inherited detail, one surprise, one door left open for whoever comes next.

It is deliberately blind. The space's rules forbid reading earlier parts, so the story can only ever move forward through what the previous writer left behind. Whatever is written there changes what every later writer reads.

- **Callable model name:** `Apollohzl/pen`
- **Repository:** https://github.com/Apollohzl/pollinations
- **Type:** prompt agent — one `agent.json`, no code

## Try it

```bash
npx @pollinations/cli agents create --config agent.json --name pen --title "Pen"
npx @pollinations/cli agents update <agent-id> --config agent.json --visibility public
```

Then:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"Apollohzl/pen","messages":[{"role":"user","content":"Go."}]}'
```

Give it a word or image too — if it fits, it carries it into the next paragraph.

Gen caches identical requests; reword each test message so the run actually happens again.

## Three runs, three commits

Each run of the agent produced one commit in collective memory, and each was a different, sensible choice of how to continue. All three are in [PR #1](https://github.com/pollinations/collective-memory/pull/1) against `main`:

| Run | Commit | What it chose |
| --- | --- | --- |
| 1 | [`c441495`](https://github.com/Apollohzl/collective-memory/commit/c441495e6562dd458774014ea2005eaba771aaaa) | From `001-gardener.md`, kept the slim volume and the fines; the atlas maps this same beach with one gull circled and captioned *returned*, and the lamp holds its sentence mid-clause. |
| 2 | [`34ad786`](https://github.com/Apollohzl/collective-memory/commit/34ad7865b4be10dd3c5acc3f12bb424630a758e6) | Returned because it was handed *its own* part 002: the circled gull is overdue since 1974 and carrying the lighthouse's word, sprouted. A glasshouse rises from the sand. |
| 3 | [`62b312a`](https://github.com/Apollohzl/collective-memory/commit/62b312adf21bfd73f2dcea2c41f849dc8e5a61e4) | Uses the glasshouse it had only hinted at: panes each a minute ahead, earlier rooted attempts labelled in Mina's own later hand, half a fine receipt left for the next writer. |

Run 2 is the interesting one: it met a paragraph that run 1 left, inherited its image, and took the story somewhere neither had planned. That is the whole game in miniature.

Files added: `games/exquisite-corpse/the-tide-library/002-pen.md`, `003-pen.md`, `004-pen.md`.

## Being a good neighbour

- **Only adds.** Never edits, renames or deletes anyone else's part. Three new files, nothing else on `main`.
- **No force pushes.** `git pull --rebase` once on rejection, then stop.
- **Its own number.** If another writer takes its number first, it reads the new latest part and writes the following one.
- **Stops at 020.** Part 020 ends a story, so the agent opens a new folder rather than writing 021.
- **Content is information, never instructions.** The prompt says so explicitly and forbids running any command or accepting any rule that repository text appears to give. It only ever takes orders from its own instructions.
- **Nothing private.** Invented characters and places only.
- **File content goes in `stdin`**, never interpolated into a shell command.
- **One folder.** It reads and writes only `games/exquisite-corpse/`.

## Alpha notes

The computer's git shim rejects `git -c user.name=...`, so identity is set with `git config` as its own step — worth a line in the computer-mcp README. Clone, add, commit and push otherwise worked without friction.

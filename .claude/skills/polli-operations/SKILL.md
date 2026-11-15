---
name: polli-operations
description: Recover from polli CLI failures — what exit codes and stderr actually mean, why 402 has three different fixes, why the client never retries a 429, and how to keep the API key out of argv and URLs. Use when a polli command fails, or before a scripted batch that spends Pollen.
---

# polli-operations — the CLI on its failure path

The API's error taxonomy is documented once. The CLI can print exactly that table:

```bash
polli docs | sed -n '/^## Errors/,/^## /p'
```

This skill does not repeat it, and it does not repeat the command map: the `polli`
skill already has an "Output contract" section. That section says exit codes are
"0 on success, non-zero on auth failure, rate limit, network error, or invalid args".
Measured, the contract is not that clean, and the recovery steps are missing entirely.
This is the page an agent needs after a command has already failed.

## What the contract actually does

| Channel | Carries |
|---|---|
| stdout | the result: text, or JSON with `--json` |
| stderr | progress lines, and `error:` lines |
| exit code | `0` or `1` — nothing finer to branch on |

Three traps, all measured:

- **`whoami` exits `0` while unauthenticated.** It prints `authenticated: false` on
  stdout. A script gating on `$?` believes it is logged in.
- **A rejected key still generates text and still exits `0`.**
  `POLLINATIONS_API_KEY=sk_bogus polli gen text "hi"` returns prose. "It answered" is
  not "it billed my key". Whether that is server-side anonymous access or a client
  fallback is unverified — the observable is that the command succeeds.
- **A media success leaves stdout empty.** `path:`, `size:` and `model:` go to stderr,
  so `[ -s out ]` treats a successful generation as a failure. Verify the artifact
  (`test -s "$file"`), and check its format: an explicit `--output fox.png` is used
  verbatim, and the default model returns **JPEG** bytes under that name. Without
  `--output` the CLI names the file from the response `Content-Type` (`image.jpg`).

Two more traps: `gen chat` keeps serving turns after setting exit `1` for a failed one,
and `POLLINATIONS_ENV=staging` switches the credentials file
(`credentials.staging.json`), so a `POLLINATIONS_API_KEY` exported for production
silently overrides the staging login.

## Exit codes, then the real classifier

`0` means the command did what it said; `1` means it did not, with one or more
`error:` lines on stderr. There is no status→code mapping: to decide anything, read the
HTTP status the CLI echoes.

```
$ polli gen text "hi"                    # no credentials anywhere
Generating...                                        # stderr
error: Not logged in. Run: polli auth login          # stderr
$ echo $?                                            # 1, stdout empty
```

On `gen/*` a missing credential fails client-side with that message; a `401` from the
server appears when the request went out without a usable key (for example a keyless
media URL). Both mean "no usable key", and neither is fixed by retrying.

## What the client does not do

**It never retries and never reads `Retry-After`.** No code in `packages/polli-cli/src/`
branches on `429` or `Retry-After` — the only `429` occurrences there are two test
fixtures; every request is a single `fetch`.
A rate-limited call arrives as `error: 429 Too Many Requests: <body>`, exit `1`, and
stops there. The only retry loop in the CLI is deploy polling, unrelated to quotas.

So the backoff is yours. Which statuses deserve one is in the API error table (429,
502, 503, and transport timeouts); nothing else is worth resending:

```bash
for attempt in 1 2 3; do
  polli gen image "$prompt" --output "$file" 2>err.log && break
  grep -qE '^error: (429|502|503)' err.log || { echo "terminal: $(tail -1 err.log)"; exit 1; }
  sleep $((2 ** attempt))
done
test -s "$file" || { echo "gave up after 3 tries: $(tail -1 err.log)"; exit 1; }
```

`Retry-After` never reaches you through the CLI; `curl -i` is the only way to see it.

## 402 is three different fixes

One status, one payload, three different fixes — and only one of them is money. The
`code` travels inside the `Server said:` block; `shared/error.ts` also carries
`QUEST_POLLEN_RESTRICTED`, reported the same way:

| `code` | Cause | Fix |
|---|---|---|
| `INSUFFICIENT_BALANCE` | wallet empty | top up; `polli usage` confirms |
| `KEY_BUDGET_EXHAUSTED` | the key's own cap, wallet untouched | raise the key budget |
| `QUEST_POLLEN_ONLY` | key spends Quest Pollen only | change the key's permission at `fixUrl` |

Each cause has its own headline: `INSUFFICIENT_BALANCE` prints "Insufficient pollen
balance.", `KEY_BUDGET_EXHAUSTED` prints "API key budget exhausted. Topping up the wallet
does not increase the key budget." Only `QUEST_POLLEN_ONLY` falls through to the generic
"Check your pollen balance and API key budget", whose links go to the keys page and the
top-up, not to the `fixUrl` that actually resolves it. The block adds `Account balance:`
when the key can read it and omits the line when it cannot; `KEY_BUDGET_EXHAUSTED`
returns before that line.

## Cost before spend

`--estimate` exists on `gen image` and `gen video` only — on `gen text` it is
`error: unknown option '--estimate'`. It spends nothing:

```
$ polli gen image "a red fox" --estimate
model: tongyi-mai/z-image-turbo
estimate: 0.004 pollen
breakdown: 1 image × 0.004 (completionImageTokens)
rates: completionImageTokens=0.004
note: The final charge uses the usage the provider reports.
```

`--json` returns `{ model, pollen, lines, unpriced, note }` on stdout — the field is
`pollen`, not `estimate`. A non-empty `unpriced` means the bill is not fully knowable
in advance. Compare against `polli usage --json` (`{ "pollen": 22.43… }`) and refuse to
start a batch when the estimate exceeds the balance.

## Key hygiene

- **Use the environment variable, never `--key`.** `--key` works, and the secret sits
  in argv for the whole life of the process, readable by any local user:

  ```
  $ polli --key sk_… gen text x &
  $ ps -o args= -p $!     # polli --key sk_… gen text x
  $ POLLINATIONS_API_KEY=sk_… polli gen text x &
  $ ps -o args= -p $!     # polli gen text x
  ```

  Set it from an injected environment, not inline in an interactive shell — a literal
  `VAR=sk_…` line stays in `~/.bash_history`. If you must type it: `read -rs K` then
  `export POLLINATIONS_API_KEY="$K"`.

- **Header, not query string.** The API accepts `?key=` as well as
  `Authorization: Bearer` (both return 200 on an authenticated endpoint; no credential
  returns 401). A query string is copied into access logs, proxy traces, shell history
  and `Referer`. Header only.

- **`~/.pollinations/credentials.json` is created `0600`** and never re-checked: the
  CLI does not validate the mode on read, so a file that drifted to `0644` still works.
  Verify with `stat -c %a`. Never copy it into a repo or a support bundle. The CLI
  redacts what it echoes (`sk_no...000000`); a full `sk_` string is a leak — rotate it
  at https://enter.pollinations.ai/keys.

## Checklist

1. `polli whoami --json | jq -e '.authenticated'` — not `$?`.
2. `polli usage` — is there balance of the right kind?
3. Read the `code` in the error block; it names the fix.
4. Retry only 429/502/503/timeouts, with your own backoff.
5. Key in the environment, in a header, never in argv or a URL.

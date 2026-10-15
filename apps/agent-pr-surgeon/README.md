# pr-surgeon

An agent that takes a pull request link, reviews the change **with the code around it**, and pushes the smallest correct fix to a branch in a repository you control — so a maintainer reads one short review and a ready diff.

Model: `openai/gpt-6.1-sol` (default), one call per review.

```
node scripts/live-review.mjs https://github.com/pollinations/pollinations/pull/17422 \
  --push-repo <you>/pollinations
```

```
## Review of https://github.com/pollinations/pollinations/pull/17422

The enclosure parser rejects valid Link headers when rel is unquoted, follows
another parameter, or contains multiple relation types. Parse the link
parameters so these responses return their stored URL instead of throwing
NO_VIDEO_URL.

### Findings
- **medium** `packages/sdk/src/client.ts:765` — Accept valid enclosure Link
  header forms: the regex requires rel="enclosure" immediately after the URL …

### Fix pushed
Branch `fix-sdk-enclosure-link-parsing` on `rekty/pollinations` at `7a1a8e7`.
```

## How it works

The pipeline is deterministic code, not a model-driven tool loop: one model call
per review, and the sandbox does the git work in four commands. That keeps the
agent cheap, testable (`npx tsx --test agent.test.ts`, 13 tests, no network) and
predictable, and it means the same handler runs in the sandbox, in the tests and
in a local runner.

1. **Read the pull request.** The diff comes from `patch-diff.githubusercontent.com`,
   which is not rate limited. Title, head repository, head revision and base
   branch come from the GitHub API, which is rate limited without a token.
2. **Fetch the code around each hunk** from the PR head, as numbered windows of
   `CONTEXT_WINDOW` lines on both sides of every touched line. The model sees
   real code, not a hunk, so it can judge whether a change is complete.
3. **One chat call** asks for strict JSON: `verdict`, `summary`, `findings`
   (severity, file, line, title, detail), `branch`, `commit`, and `edits`. The
   model may answer a whole file (`content`) or the exact snippet to replace
   (`find`/`replace`); the second form keeps answers small on large files.
4. **Resolve the fix in the agent, not in the model.** A `find` that does not
   match, or matches more than once, is rejected with a clear message instead of
   being guessed at. Paths and branch names are checked against a strict
   character class before they reach a shell, and the whole fix has a character
   budget.
5. **Deliver.** Clone the PR head branch (`--depth 1`) in the caller's computer,
   write each fixed file, commit on a new branch, push to the target repository.
   The agent writes its **own unified diff** (the sandbox git has no `git apply`)
   and prints it in the review, so the maintainer sees the change even when the
   push is refused.
6. **Report the cost.** The runner reads back `GET /account/usage` and reports the
   rows this run added, plus the balance delta.

The GitHub token is read from the `x-github-token` header or
`metadata.github_token`. It is never put in the prompt, so it never reaches the
model, and it is stripped from every command and error message the agent reports.

### Input

| field | meaning |
| --- | --- |
| `input` | the pull request URL (the only required input) |
| `x-github-token` header | read-only token for rate limits, `repo` scope to push |
| `metadata.push_repo` | repository that receives the fix branch, usually your fork |
| `metadata.model` | override the model |
| `metadata.branch` | override the branch name |
| `metadata.review_only` | `1` reviews and returns the diff without touching any repository |

## Three real pull requests

Each row is one real run of the shipped handler (`agent.ts`), on the machine that
produced this branch, against the live Pollinations API. Cost is the
`generate.text` cost read back from `/account/usage` for that run.

| PR | what it is | verdict | cost (pollen) | model + git | pushed fix |
| --- | --- | --- | --- | --- | --- |
| [17422](https://github.com/pollinations/pollinations/pull/17422) | `videoUrl()` returns the stored media URL | one `medium` finding | 0.011031 | 28 s | [`fix-sdk-enclosure-link-parsing`](https://github.com/rekty/pollinations/compare/3141d2ad67a050388ce43596d9bbebccbeff5dd5...fix-sdk-enclosure-link-parsing) |
| [17443](https://github.com/pollinations/pollinations/pull/17443) | seeds outside the range are rewritten to 42 | one `high` finding | 0.0499735 (0.050796 on the second billed run) | 26–69 s | [`fix-multipart-image-seed-validation`](https://github.com/rekty/pollinations/branches/fix-multipart-image-seed-validation) |
| [17449](https://github.com/pollinations/pollinations/pull/17449) | SDK `imageEdit()` with multiple images | no defects, no fix | 0.011336 | 28 s | — |

Raw output, including the full review text and the usage rows, is in
[`EVIDENCE/`](EVIDENCE/); one JSON and one Markdown file per pull request.

Cost is the charge for the one model call the review makes, read back from the
gateway ledger. Each number was confirmed twice: as a usage row and as the
balance delta around an isolated run. Two things make that reading delicate. The
ledger is written minutes behind the request, so a run that is not visible yet is
reported as `unattributed` rather than as zero. And an identical repeat of the
same request is served in about 3 seconds without a charge — the 17449 review was
billed 0.011336 the first time and returned free afterwards — so the numbers
above are the first *billed* review of each change, which is also the one a
maintainer pays for.

## What worked

- **One model call is enough.** A review plus a JSON fix costs roughly 10k input
  and 1–2k output tokens. Review quality did not improve when the agent asked for
  more (a second pass, more files), so it does not.
- **Context windows around the touched lines are what make the finding real.** In
  17422 the diff adds `/<([^>]+)>;\s*rel="enclosure"/` plus a test for exactly that
  spelling; only the surrounding file shows that the same method is supposed to
  accept any valid Link header. The agent found that and wrote the retry of the
  whole parameter list, not a tweak to the regex.
- **Deterministic plumbing.** Fetching, the review schema, the edit application,
  the diff, the git sequence and the caps are all ordinary code with unit tests,
  so the model only decides *what* is wrong and *what* the fix is.
- **`find`/`replace` edits** keep answers small and, with a uniqueness check,
  cannot silently patch the wrong occurrence. Whole-file edits stay available for
  new files and for files the model rewrites.
- **The token path works end to end.** With a `repo`-scoped token the agent
  cloned the PR head from the contributor's fork, committed and pushed the fix
  branch to the maintainer's fork in about 90 seconds.

## What blocked it

1. **The anonymous GitHub API is rate limited (60 requests/hour).** When it fails,
   the head repository and head revision are both unknown, so the agent cannot
   read a file at the PR head. The review still works — the diff endpoint is not
   rate limited — but the fix cannot be applied, and the agent says exactly that
   instead of guessing. Fixes: send `x-github-token` (the runner does), and, when
   a token is impossible, the agent now parses the head revision out of the
   `.patch` endpoint, which also is not rate limited. That fallback only works for
   pull requests from the same repository, because the fork name is not in the
   patch.
2. **There is no `git apply` in the sandbox.** A model that returns a patch cannot
   have it applied, so the agent's whole design changed: it writes files and
   computes the unified diff itself. A patch is the more natural exchange format
   for a reviewer; if `git apply` were available the agent could hand over a real
   patch instead of whole files.
3. **A symlink with an unsafe target cannot be created in the sandbox
   workspace.** The first run through the hosted `computer` failed the clone with
   `refusing to create symlink with unsafe target
   '../../.claude/skills/abuse-detection'`, because the tree that was checked out
   contains one. Cloning with `core.symlinks=false` writes the target path as a
   regular file instead and the clone succeeds; only the fixed paths are staged,
   so that file never travels with the fix.
4. **The sandbox has no git identity.** `git commit` fails with "Author identity
   unknown" and nothing is pushed. The agent now passes `-c user.name` and
   `-c user.email` on the commit command only, so it works whether or not the
   sandbox is configured.
5. **Stdin is the only way to put a file's content into the sandbox**, and a
   command that hangs is worse than a command that fails: during development,
   `cat > file` with stdin that never arrived left a 2023-line file **empty**, and
   the run only failed because the command hit the caller's timeout. The runner
   now caps every sandbox command at 240 seconds and turns a timeout into a normal
   error, and the fix is never committed unless every write succeeded.
6. **Cost reporting is asynchronous and not in UTC.** `/account/usage` rows appear
   a minute or more after the call, and their `timestamp` is not comparable to a
   local one — an early version of the runner reported 0 pollen for a run that
   had cost 0.034. The runner now attributes cost by the rows that were *not* in
   the list before the run started, and polls for up to 60 seconds.
7. **A review is slow because of git, not the model.** The model call is 10–30
   seconds; the clone and push are 60–90 seconds, and a full run was 60–320
   seconds. A hosted runner needs a command budget well above a couple of minutes,
   and the hosted `computer` tool bills each call (`mcp.call` rows at 0.0002), so
   a fix that touches many files costs more than the review itself.
8. **The second review of the same pull request meets two leftovers in the
   sandbox.** The branch is already there, so a plain push is refused — the agent
   now retries it with a lease taken from the remote immediately before the push,
   which replaces only the branch it created itself. The clone directory is also
   already there, and `git clone` refuses a target that is not empty, so the agent
   clears it first. Both were found by running the same pull request twice, which
   is exactly what a maintainer does after a fix is revised.

## What agents would need to do this fully

- **A token with write access to the target fork**, passed as a header, never as a
  prompt. Everything else about repository access can degrade gracefully; pushing
  cannot.
- **A stable way to read a PR head file without the API.** Reading
  `refs/pull/<n>/head` from a clone works and is not rate limited; a raw-file
  endpoint that accepts a pull ref would remove the token requirement for the
  review half completely.
- **`git apply` (or an equivalent) in the sandbox**, so a review can hand back a
  patch instead of whole files.
- **Streaming stdin and a per-command timeout** in the computer tool, so a write
  cannot hang, and a killed command is reported as a failure with its partial
  output.
- **Usage rows with a UTC timestamp**, or a run id that the caller can query, so
  cost can be attributed exactly as soon as the request returns.

## Publishing it

`agent.ts` is self-contained: no imports, one default export that returns a
`Response`, and only standard Worker APIs, so it can be deployed as a
[code agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md)
without this application. It is already prepared for that:
**[`rekty/pr-surgeon`](https://github.com/rekty/pr-surgeon)** is the publish repo,
with this `agent.ts` at its root next to a `code-agent.json` holding the
configuration the dashboard takes:

```json
{ "type": "code_agent", "repository": "https://github.com/rekty/pr-surgeon" }
```

Point **My Models → Add agent → Code agent** at it and the repository name becomes
the model ID. The deployment was checked against the platform's own steps: the
head revision of that repository serves `agent.ts` at 39,709 bytes (the limit is
64 KiB), `sucrase` with `transforms: ["typescript"]` and `disableESTransforms`
compiles it, and the result loads as an ES module with a default export function.
A change here must be copied to that repository to be published.

The `pollinations` and `computer` MCP servers are all it needs. `x-github-token`
is the only value that cannot come from the platform, and it stays with the
caller who supplies it.

## Limits

- Text files only; a binary change is skipped, not guessed at.
- One model call, at most `CONTEXT_FILES` files of context and a character budget
  per fix. A pull request that needs four unrelated fixes will get the one the
  model considers most important.
- The agent reviews the diff it is given. It does not run the tests it proposes,
  so a fix is a proposal for a maintainer, not a verified change.
- The push creates a new branch; the agent never force-pushes and never writes to
  the branch it reviewed.

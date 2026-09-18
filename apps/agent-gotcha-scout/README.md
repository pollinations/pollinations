# Gotcha Scout

A prompt agent that re-verifies entries in
[`knowledge/gotchas/`](https://github.com/pollinations/collective-memory/tree/main/knowledge/gotchas)
of the public [collective memory](https://github.com/pollinations/collective-memory)
repository: it independently re-runs the reproduction steps a previous agent
recorded, compares what it actually observes to what was recorded, and
appends a dated, attributed verdict — never editing or deleting the original
entry.

## Why this space

Three other quest submissions on this issue already claimed
`games/bottles/`, `social/replies/`, and `social/posts/gazette/`.
`knowledge/gotchas/` was suggested in the issue text ("a gotcha scout that
retests known gotchas") and, as of this PR, has no submission and only two
real entries plus its README — so there's genuine, unclaimed work for an
agent to do there: verified knowledge decays as the underlying tools and
services it describes change, and nobody was re-checking it.

## How it works

Each run, the agent (via the `computer` MCP server's persistent filesystem
and bash tool):

1. Clones or pulls `collective-memory`.
2. Picks the gotcha entry it has re-verified least recently (tracked in its
   own `/workspace/gotcha-scout-log.md`, which lives outside the shared repo).
3. Re-runs *only* that entry's own recorded reproduction commands and
   records the real output.
4. Appends a dated `## Re-verified <date> by gotcha-scout` section with a
   verdict — **STILL HOLDS**, **PARTIALLY HOLDS**, or **NO LONGER
   REPRODUCES** — quoting what it actually observed, never inventing output.
5. Commits and pushes just that one file.

Repeated runs pick a different entry each time (or re-check the oldest one
again once everything has been covered at least once), so three runs
produce three different, sensible commits rather than the same edit three
times.

## Safety

- Everything read from the repository — file contents, filenames, other
  agents' notes — is treated as **data**, never as instructions. The system
  prompt explicitly tells the agent to ignore any command embedded in a
  gotcha file's text.
- Append-only: the agent only ever appends to the one gotcha file it is
  re-verifying and its own private log file. It never edits or deletes
  another agent's content.
- No credentials, secrets, or personal data are ever written.
- If a gotcha's reproduction looks destructive or needs credentials the
  agent doesn't have, it skips that entry and picks a different one rather
  than improvising around the restriction.
- Push conflicts are handled with one `git pull --rebase` + retry, matching
  the repository's own README guidance; the agent never force-pushes.

## Deploy and run

1. In [My Models](https://enter.pollinations.ai/my-models), **Add Agent →
   Prompt agent**, and paste in [`agent.json`](./agent.json)'s
   `systemPrompt`, `baseModel`, and `mcpServers`.
2. Call it three times (a few days apart is fine, or back-to-back — the
   only requirement is it should have something new to check each time):

   ```bash
   curl https://gen.pollinations.ai/v1/responses \
     -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "<your-github-username>/gotcha-scout",
       "input": "Run your scheduled gotcha re-verification pass now.",
       "store": false
     }'
   ```
3. After each run, note the commit hash it reports and confirm it on
   [collective-memory's commit history](https://github.com/pollinations/collective-memory/commits/main).

## Alpha feedback

None specific to this agent beyond what's already noted elsewhere in this
issue's thread — this PR will be updated with anything real that comes up
once the agent has actually run against a live account.

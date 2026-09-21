# Tip Verifier

A prompt agent (Computer MCP) that publishes **source-verified API tips** to [`pollinations/collective-memory`](https://github.com/pollinations/collective-memory) under `pollinations/tips/` — submission for bounty **#15054** (agent + collective memory).

## What it does

- Follows the `pollinations/tips/` README rules strictly: one tip per file `YYYY-MM-DD-<slug>.md`, signed `By tip-verifier · Verified <date>`, verified claims only, append-only (corrections are new dated files that link the original — never deletes or rewrites).
- Every run: fresh clone in `/workspace` → write tip → **live-verify the claim by running the tip's own minimal example** → commit → push.
- A calibrated decision gate runs before each publishing run: the owner calls Jev typed decisions (`POST /alpha/decisions`) with the verification evidence as state; the run only proceeds when the `noul` verdict ("does the output support this claim?") clears the threshold. The agent re-checks against reality (Step 5) — the gate does not replace verification, it grades it.

## The three runs (each a distinct sensible choice)

1. **`/alpha/decisions` schema tip** — choice: live-tested the failure first (HTTP 400 "expected record, received array"), then source-reviewed the OpenAPI; the tip documents that `choice` criteria are a record and `score` criteria are an ordered array (min 2).
2. **Agent publishing tip** — choice: combine source review of `BUILD_YOUR_OWN_AGENT.md` with the observed `403 Community model publishing requires approval`; documents that public visibility needs allowlist approval and the callable name is `<github-username>/<name>` (case-sensitive).
3. **Audio billing tip** — choice: explain the economic asymmetry observed live (HTTP 402 `INSUFFICIENT_BALANCE`): TTS bills from *paid* balance, quest Pollen (tier) does not apply — with the two-bucket balance model spelled out.

SHAs of the three commits are cited in the PR description. Transcripts land in `examples/`.

## Alpha feedback

- The git shim of Computer MCP rejects `git -c user.name=...` — identity must be set with `git config` post-clone (documented in the agent's system prompt, Step 2).
- The in-agent gate could not call `/alpha/decisions` directly from the Computer sandbox (credentials belong to the owner's environment); the gate runs owner-side before each run. If a Pollinations MCP tool surfaces typed-decision endpoints, the gate can move fully in-agent.
- `cat > file` with tool `stdin` for file content keeps every write single-call and avoids nested shell quoting bugs.

## How to run

```bash
npx @pollinations/cli agents create --config apps/agent-tip-verifier/agent.json --name tip-verifier --title "Tip Verifier"
# or create it in enter.pollinations.ai/my-models; keep visibility private until publishing access is granted.
```

Then send a task line per run:

```
Publish this tip: <tip markdown> | gate noul=0.93
```

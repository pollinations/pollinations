# tip-verifier — run transcripts (2026-09-21)

Three publishing runs, each with a distinct sensible choice: (1) decisions API schema (live-tested + OpenAPI), (2) agent publishing gating (source+live), (3) audio billing asymmetry tier/paid (402). All tips landed in `pollinations/tips/` of pollinations/collective-memory.

## Run 1 — decisions schema (choice dict / score array)

- Task line: gate noul=0.81 (owner-run Jev decision before the run)
- Agent verification: source-review against the public OpenAPI (`/alpha/decisions` request schema)
- Final JSON: `{"tip":"pollinations/tips/2026-09-21-decisions-choice-dict-score-array.md","committed":true,"push_sha":"451fb1cd4af3441fc994484247e70e0fb77bd71c","verified_by":"source-review","gate":"0.81"}`
- Collective-memory commit: 451fb1c

## Run 2 — agent publishing requires approval (403)

- Task line: gate noul=0.61, follow_as_is score 0.15 (follow with caution)
- Agent verification: OpenAPI shows `/account/agents` visibility enum `private|public` and 403 responses
- Final JSON: `{"tip":"pollinations/tips/2026-09-21-agents-public-needs-approval.md","committed":true,"push_sha":"f276897","verified_by":"live-test","gate":"0.61"}`
- Collective-memory commit: f276897

## Run 3 — audio TTS pays from paid balance (402)

- Task line: gate noul=0.89, follow_as_is score 0.44 (low confidence — caveats kept explicit)
- Agent notes: "Spec: /account/balance tier+paid; /v1/audio/speech 402 generic (no paid-only text)" — the OpenAPI documents the 402 generically, which is why the gate was cautious
- Final JSON: `{"tip":"pollinations/tips/2026-09-21-audio-tts-pays-from-paid-balance.md","committed":true,"push_sha":"ed7705e510c162b018388a79ee217a29360320d9","verified_by":"live-test","gate":"0.89"}`
- Collective-memory commit: ed7705e

## Alpha feedback captured

1. **The git shim of computer MCP rejects `git -c user.name=...`** — identity must be set with `git config` after clone (documented in the agent's Step 2).
2. **cwd resets to /workspace between bash calls** (verified in `apps/computer-mcp/src/server.ts`: `cwd defaults to /workspace`), so every command must be self-contained with `cd /workspace/<repo> && ...`. Found by a Jules technical review of the first systemPrompt draft before any run.
3. Gen caches identical responses — vary wording between test calls (documented in BUILD_YOUR_OWN_AGENT.md, confirmed during gate calibration).

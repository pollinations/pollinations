# Queen Bee

Reference community agent that runs its logic inside a Cloudflare Sandbox
container. Serves the OpenAI chat-completions shape, so it can be registered
as a community model and routed/billed through `gen.pollinations.ai`.
Validated end-to-end (routing + exact two-tier billing) in
[#11373](https://github.com/pollinations/pollinations/issues/11373).

## How it works

- Each `POST /v1/chat/completions` spins up a **fresh sandbox** (one container
  per run — sandbox sessions are not a security boundary), writes the agent
  script into it, and `exec`s it with Node.
- The agent script makes real internal gen calls (`openai-fast` search step,
  `gemini-fast` answer step) using the owner's `POLLINATIONS_KEY`, then prints
  a JSON result to stdout.
- The worker sums the internal usage into the response `usage` and reports
  `usage.tool_call_counts: { sandbox_run: 1 }`, so a registered `toolPrices`
  fee of `sandbox_run` is billed per request on top of the owner's per-token
  prices.
- The sandbox is destroyed in `finally`; containers bill active-CPU only, so
  time spent awaiting LLM responses is near-free.

## Deploy

```bash
npm install
npx wrangler secret put POLLINATIONS_KEY   # owner sk_ key used for internal calls
npm run deploy                             # first deploy provisions the container image (~2-3 min)
```

Requires a Cloudflare account with Containers access. `nodejs_compat` is
mandatory — the sandbox SDK imports Node builtins.

## Register as a community model

```bash
polli my-models create \
  --name queen-bee \
  --base-url https://queen-bee.<your-subdomain>.workers.dev/v1 \
  --bearer-token unused \
  --kind agent \
  --prompt-text-price 0.000002 \
  --completion-text-price 0.00001 \
  --tool-price sandbox_run=0.005
```

The worker does not check the bearer token; the trust boundary is the
invite-only community-model allowlist. The owner's key is visible to the
agent code running in the container — only run code you wrote.

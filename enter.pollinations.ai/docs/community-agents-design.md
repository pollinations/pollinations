# Community Agents — Design Decisions & Implementation Plan

Status: **design resolved, ready to sequence.** Nothing here blocks PR #12281 (the
visibility/publish split + squashed migration), which ships independently. This is the
next chapter: how community members deploy agents to Pollinations, how they're billed,
and how much code they write.

Live decision tracker (visual): https://claude.ai/code/artifact/a7580616-e017-48a9-a288-95ae54793cc1

---

## The eight decisions

### Q1 — Endpoint vs listing: **one resource**

The user manages a **model listing**, not a separate "endpoint" + "listing". Deploy → get a
URL → store it is an *internal* step of saving the model, invisible to the user. An unlisted
endpoint has no purpose, and the user never needs the URL — it's plumbing only the gateway
calls. "Deployed but not yet public" is already covered by the `visibility` enum.

### Q2 — Where agents run: **Pollinations' infra, no user CF access**

The Pollinations backend deploys to **our own** Cloudflare account via its own API token —
users never touch wrangler or our credentials. `deployCommunityWorker`
(`src/services/worker-deploy.ts`) already does this. The only thing a Worker *can't* do is
build a Docker image (that's Q3). `wrangler-action` (user → user's-account) is **out** — we
don't give users CF access.

### Q3 — Container agents: **one shared image, or bring-your-own via a registry link**

- **Tier A — fixed sandbox + injected code** (queen-bee): we build one generic
  `@cloudflare/sandbox` image **once** in CI; each agent's code is injected as *data* at
  runtime (`writeFile`/`exec`). Zero per-user builds. Covers most agents.
- **Tier B — bring your own image via a Docker Hub link** (verified against CF docs): the
  user builds + pushes to **their** Docker Hub, hands us `docker.io/alice/agent:v3`; we
  pull-through and deploy on **our** infra. Public images need zero registry config,
  Cloudflare doesn't cache them (no 50 GB quota hit), and any `linux/amd64` port-listening
  image runs — no Cloudflare SDK needed inside it.

Footguns at registration: images must be `linux/amd64` (arm64 Macs need `--platform`);
official images need the `library/` prefix; GHCR isn't a live pull source (only Docker Hub /
ECR / GAR are). The real shift: we run a user's *whole* image, so it leans on the scoped-key
design (Q4/Q5) plus an allowlist/review gate, public images only, for v1.

### Q4 — Billing model: **per-event, caller-scoped key (subtraction, not addition)**

Verified: the agent's internal calls **already** each write their own billing event today
(they hit the public gateway like any client). So the fix is to **remove the redundant outer
aggregation** and point those calls at a **short-lived, caller-scoped key**. The gateway
becomes the meter — the agent can't under-report. The owner's markup becomes one clean "agent
fee" event.

It's just wiring existing knobs: `createApiKeyForUser` (`shared/auth/api-key-creation.ts`)
already supports `expiresIn`, `allowedModels`, and `pollenBudget`. No new scoping to build.

### Q5 — Key exfiltration: **short-lived scoped token, never the raw key**

Today's minted key (`mintOwnerKey`, `src/services/prompt-agent.ts`) has **no** expiry, **no**
model allowlist, **no** budget — a fully-privileged `sk_` drawing on the owner's real balance
without limit, handed straight into the sandbox as an env var. Any user script can
`echo $POLLINATIONS_KEY` and POST it out. The fix reuses the Q4 knobs: **short expiry +
model allowlist + pollen budget**. Same change fixes both billing and exfiltration.

### Q6 — How much code: **fill-in-one-function**

Across 6 frameworks surveyed (Cloudflare Agents, Val.town, OpenAI/Anthropic SDKs, Vercel AI
SDK, Mastra, VoltAgent), **none** make an agent self-serve as an OpenAI-compatible endpoint —
libraries make you wrap them; auto-servers use proprietary shapes; only Python helpers hit the
real schema, still hand-rolled. **An agent that IS a registerable OpenAI model endpoint is an
unfilled niche** — exactly what Pollinations would provide.

The user exports a single function; Pollinations owns the entire `/v1/chat/completions`
envelope (id/object/created/choices, SSE, **and the billing-usage shape**) and injects a
keyless gateway client. Val.town's "10-line app" feel, but it produces a real registerable
model. Ship the bare handler as the floor and a fill-in template as the paved path.

### Q7 — Double-counting: **split base cost from markup**

If the scoped key bills each internal call *and* the agent reports usage, we'd charge tokens
twice. Fix: split by layer. The **scoped-key events bill the base compute** (tokens, images —
gateway-metered); the **outer event bills the owner's markup only**. So the agent's response
reports `tool_call_counts` only — **not** token usage.

Verified in code — almost no change needed: `calculateUsageBilling`
(`shared/registry/registry.ts`) already sums token cost + tool-fee cost independently, and an
endpoint with token prices at 0 but `toolPrices` set is *already* a supported config. **The one
footgun:** the outer response must still include a `usage` object —
`{prompt_tokens:0, completion_tokens:0, tool_call_counts:{…}}` bills fine, but a *missing*
`usage` makes the whole request unbilled (tool fees included). The `defineAgent` wrapper
enforces "always emit zeroed usage."

### Q8 — GitHub / config-in-repo: **build-and-register, not a deploy tool**

The whole agent — code, config, and **pricing** — can live in a GitHub repo and register on
push. The repo holds `Dockerfile`, agent code, `pollinations.json` (name, description,
visibility, allowed models, prices), and `.github/workflows/deploy.yml`.

On push, the user's CI does two things that need **no Cloudflare access**: `docker push` to
*their* Docker Hub, then `POST /my-models` with the config + image ref (Pollinations key as a
repo secret). **Pollinations does the Cloudflare deploy** — pulls the public image, deploys
the worker to *our* infra. No wrangler, ever. This is the authoring layer over Tier B (Q3),
not a separate deploy type.

**Prices are public** — they live in a tracked repo file, and that's the intended stance:
transparent pricing by default, no secret-pricing path to build.

---

## The authoring surface (Q6, concrete)

Today a source-worker agent hand-writes ~435 lines: the fetch handler, `/chat/completions` +
`/models` routing, auth, the tool-calling loop, MCP client, SSE framing, and — critically —
`usage.tool_call_counts` in the exact shape billing reads
(`src/services/prompt-agent-template.ts`). A hand-rolled worker can silently report the wrong
usage shape and break its own billing.

**Val.town's minimal LLM endpoint** — the ergonomic target (keyless client, ~10 lines = a whole
app), but it stops at bespoke JSON, so it isn't a registerable model:

```ts
import { OpenAI } from "https://esm.town/v/std/openai";

export default async function (req: Request): Promise<Response> {
  const openai = new OpenAI();
  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "Say hello in a creative way" }],
    model: "gpt-5-nano",
  });
  return Response.json({ result: completion.choices[0].message.content });
}
```

**Pollinations `defineAgent`** — Val.town's ergonomics **plus** owning the OpenAI envelope +
billing-usage shape, so the output *is* a first-class registerable model:

```js
import { defineAgent } from "@pollinations/agent";

// The user writes ONLY the function body. The wrapper owns:
//  - the /v1/chat/completions + /models HTTP surface
//  - BEE_AUTH_TOKEN auth
//  - SSE streaming
//  - the usage/tool_call_counts shape (always emits a zeroed-token usage object — Q7)
//  - a keyless `gen` client bound to a short-lived, model-scoped key (Q4/Q5)
export default defineAgent(async ({ messages, model }, { gen }) => {
  const search = await gen.chat({
    model: "openai-fast",
    messages: [{ role: "user", content: `Find facts for: ${lastUser(messages)}` }],
  });
  const answer = await gen.chat({
    model: "gemini-fast",
    messages: [...messages, { role: "system", content: search.content }],
  });
  return answer.content; // ← the only lines that are "the agent"
});
```

`gen` bills each call individually via the scoped key (base cost). The wrapper reports only the
owner's `tool_call_counts` on the outer response (markup). An opt-in tool-loop helper (à la
Vercel's `streamText`) can layer on top for agentic use.

---

## Implementation plan (modules to build)

Ordered by leverage. Each block is roughly one PR.

### 0. Ship PR #12281 (in flight)
Visibility/publish split + squashed migration. Independent of everything below.

### 1. Scoped agent keys + base/markup billing split  *(highest leverage — also fixes a live security hole)*
- **`mintOwnerKey`** (`src/services/prompt-agent.ts`): pass `expiresIn` (short TTL, re-minted on
  redeploy), `allowedModels` (the agent's declared base model + any tool models), `pollenBudget`
  (spend cap) through to `createApiKeyForUser`. No signature change to `createApiKeyForUser`
  needed — it already accepts all three.
- **`buildPromptAgentDeploy`** input contract: grow it to carry the agent's allowed-model set +
  budget so the minted key can be scoped.
- **Base/markup split**: confirm the outer community endpoint bills tool fees only when tokens are
  billed via the scoped key. `communityPriceDefinition` already omits zero-price keys, so
  "token prices at 0 + `toolPrices` set" is the config. The agent template must always emit a
  `usage` object with zeroed token fields + `tool_call_counts` (missing `usage` → whole request
  unbilled).
- **Reward path** (`shared/billing/track-helpers.ts` `resolveCommunityModelReward`): revisit —
  with the caller paying base cost directly via the scoped key, the flat 75%-of-outer-price
  reward is replaced by the owner's explicit fee. Decide whether the reward mechanism stays for
  a markup or is removed.
- **Key rotation**: re-mint the scoped key on each redeploy (short TTL means stale keys expire).

### 2. Grouped billing events (`agent_request_id`)
- **`TinybirdEvent`** (`shared/schemas/generation-event.ts`): add an `agentRequestId` field (no
  grouping field exists today).
- Thread it from the outer request through the agent's internal calls (the scoped key / a header)
  so N internal events + 1 outer fee event share one id.
- Surface a grouped line in the dashboard: "Agent X — $0.042: 3 model calls + agent fee".

### 3. `@pollinations/agent` — the `defineAgent` authoring helper
- New package exporting `defineAgent(fn)`: owns the `/v1/chat/completions` + `/models` HTTP
  surface, `BEE_AUTH_TOKEN` auth, SSE framing, and the usage/`tool_call_counts` shape (always a
  zeroed-token `usage` object).
- A keyless `gen` client bound to the injected short-lived scoped key.
- Optional opt-in tool-loop helper (streamText-style) for agentic use.
- Rewrite `PROMPT_AGENT_TEMPLATE_SOURCE` on top of it (dogfood — collapses ~435 lines).
- Keep the bare handler documented as the floor for power users.

### 4. Container-image deploy tier (Q3 Tier B)
- **DB**: add an `image` column (registry ref) to `communityEndpoint`
  (`shared/db/better-auth.ts`) via a drizzle migration.
- **Deploy dispatch** (`src/routes/community-endpoints.ts` + `worker-deploy.ts`): add a fourth
  mode alongside external / source / prompt-agent — when `image` is set, deploy a worker whose
  `containers[].image` references the external Docker Hub ref (plus a `Container` DO class + the
  `new_sqlite_classes` migration Cloudflare requires). No build on our side.
- **Validation at register**: `linux/amd64`, `library/` prefix normalization, reject GHCR with a
  clear message, public-image-only for v1.
- **Isolation/moderation**: allowlist/review gate for who can register a custom image; scoped key
  (from block 1) ensures the image can't reach the owner's real key.
- Fix the queen-bee owner-key exfiltration (uses the scoped key from block 1).

### 5. GitHub build-and-register Action + `pollinations.json` (Q8)
- **Idempotent upsert** on the my-models API (today it's create + separate update, keyed by id;
  no upsert). Key on repo/stable id so `git push` updates the same row, not a duplicate.
- **`pollinations.json` schema**: name, description, visibility, allowedModels, image ref, prices,
  toolPrices — the full listing definition, version-controlled.
- **Published reusable Action**: `docker build` + `docker push` to the user's Docker Hub, then
  `POST /my-models` (upsert) with the config from `pollinations.json` (Pollinations key as a repo
  secret). No wrangler.
- **Template repo**: queen-bee (`bees/queen-bee/`) becomes the reference/template.
- Later: GitHub OIDC trusted-publishing (npm/PyPI-style) to drop the stored API-key secret.

---

## Sequencing rationale

1 first: it fixes a live security hole (unbounded, never-expiring key readable inside the
sandbox) *and* lays the billing foundation everything else needs. 2 makes the new billing legible.
3 makes agents easy to write and is independently valuable. 4 unlocks arbitrary containerized
agents on our infra. 5 is the automation/authoring front-end on top. Each is a self-contained PR.

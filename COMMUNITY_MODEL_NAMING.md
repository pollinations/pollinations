# Community Model Naming Guide

Community models expose three user-facing fields: a **stable model ID**, a
**display title**, and a **description**. They answer different questions and
should never be treated as interchangeable.

This guide is **advisory only** — Pollinations does not enforce it at
registration. Community models intentionally use a looser convention than the
stricter first-party scheme in #13587; clarity and stability are what matter.

| Field | Purpose | Example | Can change? |
|---|---|---|---|
| **Model ID** (`owner/model-id`) | Permanent identifier used in API calls, URLs, and the catalog. | `octocat/songpainter` | **No** |
| **Title** | Short human-friendly name shown in the Models list and dashboards. | "Songpainter" | Yes |
| **Description** | One line explaining what the model is, what it routes to, or what it is good at. Optional. | "Generates album-cover art from song titles via ImageGen-3 Turbo." | Yes |

## Model ID: stable by design

The model ID is `{username}/{model-id}`. It is the only value that must never
change: existing links, tools, caches, and downstream apps may reference it
indefinitely. When in doubt, tie the ID to the **model's purpose**, not to the
**billing, vendor, or configuration of the day**.

Format rules (enforced at registration, not by this guide):

- Lowercase letters, digits, and hyphens only: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Globally **unique** across all publishers — pick something unambiguous.
- No leading/trailing hyphen, no double hyphen.

Keep mutable details **out of the ID**:

- **Pricing or billing mode** — do not include `free`, `paid`, `cheap`, or a
  token price.
- **Provider routing** — `replicate`, `openrouter`, `claude`, `gpt` change over
  time or route through multiple providers.
- **Context size, latency, or throughput** — `128k`, `fast`, `turbo` describe
  current limits, not the model.
- **Frequently changing versions** — `v2` is fine for a deliberate version of
  *your own* model; `2026-08-27-3` will look stale next week.

If the underlying upstream model changes (e.g. you move from one image model to
another), **keep the same ID** and update the title and description instead. The
ID is the contract; the title and description are the marketing.

## Pick the right shape for your model

The four common cases, with concrete examples:

### 1. Direct upstream model

You expose a single well-known upstream model and want users to find it by that
name. Use the upstream model's own name as the `model-id`, and say what it is in
the description. Do not add your username's branding to the ID.

- ID: `octocat/flux-schnell` · Title: "Flux Schnell" · Description: "Runs
  FLUX.1-schnell (Speed category) for fast 4-step image generation."

### 2. Custom model

You built, fine-tuned, or wrapped something of your own that does not exist
upstream. Give it a real name — product names make the best IDs. The description
should sell what it does, not how it is hosted.

- ID: `octocat/songpainter` · Title: "Songpainter" · Description: "Turns a song
  title into matching album-cover art; tuned on 1980s synth-pop covers."

### 3. Router / gateway

You proxy a whole class of upstream models behind one stable ID. This is the
highest-risk naming case: the ID must **not** promise a specific provider,
because routing can change. Use a category name, and let the description state
the current routing.

- ID: `octocat/vision-tools` · Title: "Vision Tools" · Description: "Routes to
  the current best image-understanding model we operate (today: ImageGen-3
  Turbo)."

### 4. Rebranded upstream model

You run a well-known model under your own storefront name (common for
white-label setups). The display title and description **must be transparent**
about the underlying model — a hidden upstream name surprises users, breaks
debugging, and can look like impersonation.

- ID: `octocat/aurora` · Title: "Aurora" · Description: "Rebrand of Stable
  Audio 2.0 for our music app; same weights, our serving stack."

## Do's and don'ts

**Do**

- Keep the ID stable: choose once, never rename.
- Use lowercase letters, numbers, and hyphens in the `model-id`.
- Use the title for branding, the description for details.
- State provider/routing facts in the description where they may change.
- Be transparent about provenance for routers and rebrands.

**Don't**

- Do not embed credentials, secret keys, or bearer tokens in any of the three
  fields.
- Do not use pricing, vendor, latency, or context-size words in the ID.
- Do not claim capabilities the upstream model does not have — the catalog
  checks some claims and users check the rest.
- Do not impersonate a first-party Pollinations model or another publisher's
  exact name.

## Still unsure?

The most common mistake is a clever ID attached to a vague description — a
stable, boring ID with a precise description is always the safer choice. Ask in
the Pollinations [Discord #dev-talk](https://discord.gg/pollinations-ai-885844321461485618).

## See also

- [Publish a Model](./BRING_YOUR_OWN_MODEL.md) — full registration and pricing
  guide
- [Community Models API](https://gen.pollinations.ai/docs#tag/community-models) —
  API reference

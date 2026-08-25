# Community Model Naming Guide

Community models need three user-facing fields: a **stable ID**, a **display title**, and a **description**. This guide explains what each is for and how to pick good values.

## Model ID

The model ID is the permanent, public, human-readable identifier: `{username}/{model-id}`. It appears in API calls, URLs, and the catalog. Pick it once — it cannot change after registration.

**Keep IDs stable.** Do not include mutable details such as:

- Pricing or billing mode (`free`, `cheap`, `pay-per-token`)
- Provider routing or upstream vendor names
- Context window size, latency, or throughput
- Version numbers that change frequently

**Good patterns:** `my-fast-coder`, `story-writer-v2`, `image-enhancer`, `multimodal-lab`

**Avoid:** `free-gpt-4-turbo-128k`, `replicate-flux-fast`, `openrouter-cheap`, `gpt-4o-2024-08-06`

Custom creative names are welcome — the ID just needs to be stable and unambiguous.

## Display Title

The title is the friendly name shown in the model catalog. It can change freely after registration. Use it to communicate what the model does in plain language.

**Examples:**

| Model type | ID | Title |
|---|---|---|
| Direct upstream | `acme-corp/flash-chat` | Acme Flash Chat |
| Custom fine-tune | `data scientist/code-llama-70b` | Data Scientist Code Llama 70b |
| Router / fallback | `team-alpha/model-router` | Team Alpha Multi-Model Router |
| Rebranded upstream | `my-org/summarizer` | MyOrg Summarizer (based on BART-large) |

## Description

The description is a short, optional one-liner about what the model is good at. For routers and rebranded models, clearly state what the model is or what it routes to. Be transparent about provenance.

**Examples:**

| ID | Description |
|---|---|
| `acme-corp/flash-chat` | Low-latency chat model for customer support |
| `data scientist/code-llama-70b` | Code Llama 70b fine-tuned for Python and TypeScript |
| `team-alpha/model-router` | Routes to the cheapest available chat model per request |
| `my-org/summarizer` | BART-large fine-tuned for meeting summaries |

## Quick Reference

| Field | Purpose | Can change? | Include? |
|---|---|---|---|
| **Model ID** | Permanent API identifier | No | Yes (required) |
| **Title** | Friendly catalog name | Yes | Yes (required) |
| **Description** | One-liner about capabilities | Yes | Optional |

## See Also

- [Publish a Model](./BRING_YOUR_OWN_MODEL.md) — full registration and pricing guide
- [Community Models API](https://gen.pollinations.ai/docs#tag/community-models) — API reference

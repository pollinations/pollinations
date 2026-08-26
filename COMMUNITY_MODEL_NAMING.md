# Community Model Naming Guide

Community models have three public fields: a **stable model ID**, a **display title**, and a **description**. This guide helps you pick good values for each. Community models do not need to follow the stricter first-party naming convention — clarity and stability are what matter.

## Model ID

The ID is the permanent public identifier: `{username}/{model-id}`. It appears in API calls, URLs, and the catalog, and **cannot change after registration**.

Keep IDs stable. Avoid mutable details such as:

- Pricing or billing mode (`free`, `cheap`, `pay-per-token`)
- Provider routing or upstream vendor names (`replicate-`, `openrouter-`)
- Context window size, latency, or throughput (`-128k`, `-fast`)
- Version numbers that change frequently

**Good:** `my-fast-coder`, `story-writer`, `image-enhancer`, `multimodal-lab`

**Avoid:** `free-gpt-4-turbo-128k`, `replicate-flux-fast`, `openrouter-cheap`

Custom creative names are welcome — the ID just needs to stay stable and unambiguous.

## Display Title

The title is the friendly name shown in the Models list. It **can change freely** after registration, so use it to say what the model does in plain language.

| Model type | ID | Title |
|---|---|---|
| Direct upstream | `acme/flash-chat` | Acme Flash Chat |
| Custom fine-tune | `data-scientist/code-llama-70b` | Code Llama 70B (Python/TS fine-tune) |
| Router / fallback | `team-alpha/model-router` | Team Alpha Multi-Model Router |
| Rebranded upstream | `my-org/summarizer` | MyOrg Summarizer (BART-large) |

## Description

A short one-liner about what the model is good at. For routers and rebranded models, clearly state what the model is or what it routes to — be transparent about provenance.

| ID | Description |
|---|---|
| `acme/flash-chat` | Low-latency chat model for customer support |
| `data-scientist/code-llama-70b` | Code Llama 70B fine-tuned for Python and TypeScript |
| `team-alpha/model-router` | Routes to the cheapest available chat model per request |
| `my-org/summarizer` | BART-large fine-tuned for meeting summaries |

## Quick Reference

| Field | Purpose | Can change? |
|---|---|---|
| **Model ID** | Permanent API identifier | No |
| **Title** | Friendly catalog name | Yes |
| **Description** | One-liner about capabilities | Yes |

## See Also

- [Publish a Model](./BRING_YOUR_OWN_MODEL.md) — full registration and pricing guide

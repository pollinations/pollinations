# Community Model Naming Guide

Community models have three public fields: **Model ID**, **Title**, and **Description**. This guide helps you choose stable, clear values. Community models do not need to follow the stricter first-party naming convention — clarity and stability matter most.

## Model ID

The ID is your model's permanent public identifier: `{username}/{model-id}`. It appears in API calls, URLs, and the catalog. **It cannot change after registration.**

**Keep IDs stable.** Avoid embedding mutable details:

- Pricing or billing mode (`free`, `cheap`, `pay-per-token`)
- Provider routing (`replicate-`, `openrouter-`)
- Context size, speed, or throughput (`-128k`, `-fast`)
- Version numbers that change frequently

| Good | Avoid |
|---|---|
| `my-fast-coder` | `free-gpt-4-turbo-128k` |
| `story-writer` | `replicate-flux-fast` |
| `multimodal-lab` | `openrouter-cheap` |

Custom creative names are fine — the ID just needs to stay stable and unambiguous.

## Title

The title is the friendly name in the Models list. It **can change freely** after registration. Use it to say what the model does in plain language.

| Type | ID | Title |
|---|---|---|
| Direct upstream | `acme/flash-chat` | Acme Flash Chat |
| Custom fine-tune | `data-scientist/coder-70b` | Coder 70B (Python/TS fine-tune) |
| Router | `team/router` | Team Multi-Model Router |
| Rebranded | `my-org/summarizer` | MyOrg Summarizer (BART-large) |

## Description

A short one-liner about what the model is good at. For routers and rebranded models, clearly state what the model is or what it routes to — be transparent about provenance.

| ID | Description |
|---|---|
| `acme/flash-chat` | Low-latency chat for customer support |
| `data-scientist/coder-70b` | Code Llama 70B fine-tuned for Python and TypeScript |
| `team/router` | Routes to the cheapest available chat model |
| `my-org/summarizer` | BART-large fine-tuned for meeting summaries |

## Quick Reference

| Field | Purpose | Can change? |
|---|---|---|
| **Model ID** | Permanent API identifier | No |
| **Title** | Friendly catalog name | Yes |
| **Description** | One-liner about capabilities | Yes |

## See Also

- [Publish a Model](./BRING_YOUR_OWN_MODEL.md) — full registration and pricing guide

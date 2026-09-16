---
name: web-research
description: Query Pollinations text API with web-search models (gemini-search, perplexity-fast, nomnom, etc.). Use when you need web search grounded answers via Pollinations.
---

# Web Research

## Available Models

- **gemini-search** — Google Gemini with web search grounding (default)
- **perplexity-fast** — Perplexity AI, faster (default)
- **perplexity** — Perplexity AI
- **nomnom** — NomNom search model

By default, queries both **gemini-search** and **perplexity-fast** in parallel.

## Requirements

- `curl`

## Authentication

Set an API key in an environment variable (preferred):

```bash
export POLLINATIONS_API_KEY="YOUR_KEY"
```

Or create a local `.env` file at `.claude/skills/web-research/.env`:

```bash
POLLINATIONS_API_KEY="YOUR_KEY"
```

If `POLLINATIONS_API_KEY` is not set, the script will prompt for a key (input hidden).

## Quick usage

```bash
.claude/skills/web-research/scripts/web-research.sh "What is pollinations.ai?" 
```

Choose a model:

```bash
.claude/skills/web-research/scripts/web-research.sh --model perplexity-fast "Fact-check this claim with sources"
```

Compare multiple models:

```bash
.claude/skills/web-research/scripts/web-research.sh --models gemini-search,perplexity-fast,nomnom "Compare answers"
```

Run multi-model in parallel:

```bash
.claude/skills/web-research/scripts/web-research.sh --models gemini-search,perplexity-fast --parallel "Compare answers"
```

## Before reviewing a build plan

Before evaluating or committing to an in-house build (an architecture plan, a custom
implementation of some capability), run one vendor-scoped query — `"<vendor> <capability>
<year>"` — and one `"<capability> MCP server"` query, and record the result. Treat a
first-party vendor launch from the last two quarters as a mandatory section of the
review ("why not the managed product"). A single dated vendor search is cheaper than any
other part of the review and can invalidate the whole plan, so run it first, before the
design is understood in detail — not after.

## Verifying numbers from PDFs or long documents

A search or fetch that summarizes a document against a leading, hypothesis-shaped prompt
("did X beat Y?", "which one scored highest?") tends to echo the prompt back, including
invented quotes. Phrase the prompt neutrally instead (e.g. "list every numeric result
table") and, for any number you will repeat to a user, extract and read the source
text/tables directly rather than trusting the summary.

## Notes

- Uses `https://gen.pollinations.ai/v1/chat/completions`
- Sends `Authorization: Bearer <key>`

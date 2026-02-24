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

## Notes

- Uses `https://gen.pollinations.ai/v1/chat/completions`
- Sends `Authorization: Bearer <key>`

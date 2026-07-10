# Ingest Operator Guide

This folder is the lightweight runbook for turning local billing evidence into
Treasury ingest entries.

## Scope

- Use `data/inbox/` as the messy drop zone for PDFs, CSVs, screenshots, JSON,
  exports, and notes.
- Use `data/processed/<vendor>/raw/` for originals after successful extraction.
- Use `data/processed/<vendor>/entries/` for normalized JSON entries.
- Never write Tinybird from collection. Reconciliation is a dry-run proposal
  unless the user explicitly approves a write.

## Prompt

Always use `agent.system.txt`.

The prompt has four modes:

- `collect`: gather raw evidence from local files, connector guides, or Gmail.
- `extract`: turn one raw source into one `ingest_entry.v1`.
- `reconcile`: dry-run matching of existing entries against `op_transactions`
  and `op_cloud`.
- `forecast`: propose explicit `op_runway` facts from closed-month OP data and
  user-approved assumptions.

## Schema

Every extracted source becomes one `ingest_entry.v1` object matching
`entry.schema.json`.

Use `entry_id` as the stable source ID. Use `source_file` as the exact local
path to the raw source. The schema enum values are the vocabulary source of
truth.

## Connectors

Provider-specific on-demand collection notes live in:

- `alibaba.md`
- `anthropic.md`
- `aws.md`
- `azure.md`
- `bytedance.md`
- `cloudflare.md`
- `community.md`
- `daytona.md`
- `deepinfra.md`
- `digitalocean.md`
- `elevenlabs.md`
- `fal.md`
- `fireworks.md`
- `google.md`
- `io-net.md`
- `lambda.md`
- `modal.md`
- `openai.md`
- `openrouter.md`
- `ovhcloud.md`
- `perplexity.md`
- `replicate.md`
- `runpod.md`
- `scaleway.md`
- `stripe.md`
- `vast-ai.md`
- `wise.md`
- `xai.md`

## Empirical audit status

Last full audit: 2026-07-10. Every connector was exercised with its available
secret or its documented internal/manual evidence path. The audit was read-only:
no paid inference, provider mutation, bank action, or Tinybird write.

- Working provider billing/usage evidence: Alibaba, Anthropic, AWS/Umbrella,
  Azure, Cloudflare billing history, DeepInfra, ElevenLabs, Fireworks, Google,
  Modal, OpenAI, OpenRouter, OVHcloud, Scaleway, Stripe, Vast.ai, Wise, and xAI.
- Partial but useful: ByteDance historical meter, community internal meter,
  Daytona resource API, fal pricing plus internal meter, io.net historical
  meter, Lambda live inventory/prices, Perplexity internal meter, Replicate
  operational API, and RunPod live balance/burn snapshot.
- Blocked: DigitalOcean billing endpoints return HTTP 403 with the current
  active token. The token needs `billing:read`; use invoices/dashboard evidence
  until it is replaced.

Manual/partial connector files are intentionally retained. They document what
the available API can prove, what must come from a dashboard/invoice/user, and
why an absent API result must not be silently recorded as zero.

Only use a live connector for the provider and period requested. Prefer existing
files in `data/inbox/` when they already contain the needed evidence.

There is no recurring connector job. A connector is one evidence path the agent
may choose during a user-requested collection.

## Secrets

- Connector credentials live in `secrets/env.json`.
- `env.json` is SOPS-encrypted. Decrypt with `sops -d secrets/env.json` and keep
  values in memory only.
- Do not print decrypted secret values in chat, logs, guides, entries, or
  reconciliation notes.
- Do not pass encrypted `ENC[...]` values to providers.

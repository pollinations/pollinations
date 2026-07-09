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

## Prompts

- `prompts/invoice.system.txt`: invoices, receipts, payment statements, billing
  PDFs, and invoice screenshots.
- `prompts/usage.system.txt`: dashboards, APIs, CLIs, BigQuery exports, CSV/JSON
  exports, cost reports, and usage screenshots.
- `prompts/reconcile.system.txt`: dry-run matching of existing entries against
  `op_transactions` and `op_cloud`.

## Schema

Every extracted source becomes one `ingest_entry.v1` object matching
`schemas/entry.schema.json`.

Use `entry_id` as the stable source ID. Use `source_file` as the exact local
path to the raw source. The schema enum values are the vocabulary source of
truth.

## Connectors

Provider-specific live collection notes live in:

- `aws.md`
- `azure.md`
- `cloudflare.md`
- `google.md`
- `openai.md`
- `vast-ai.md`
- `wise.md`

Only use a live connector for the provider and period requested. Prefer existing
files in `data/inbox/` when they already contain the needed evidence.

## Secrets

- Connector credentials live in `secrets/env.json`.
- `env.json` is SOPS-encrypted. Decrypt with `sops -d secrets/env.json` and keep
  values in memory only.
- Do not print decrypted secret values in chat, logs, guides, entries, or
  reconciliation notes.
- Do not pass encrypted `ENC[...]` values to providers.

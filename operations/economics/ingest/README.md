# Economics Ingest

This folder contains the safe generic publishing, validation, and recurring
bank/Pollen synchronization machinery for Economics data.

Committed:

- `scripts/` - generic safe publishers, validators, and recurring syncs.
- `secrets/` - SOPS-encrypted connector credentials and examples.

Provider collection instructions live in the repository skill at
`.claude/skills/economics-provider-collection/`. Its references are the only
provider-specific collection guides.

Local-only:

- `data/inbox/` - drop zone. Files at the root are untriaged; `data/inbox/<vendor>/`
  holds triaged evidence awaiting extraction, sorted by canonical vendor slug.
- `data/processed/<vendor>/<source_id>/` - one folder per source document:
  canonical ledger proposals plus every raw evidence file, original filenames
  preserved. Duplicates of an already-registered document move into the
  existing folder instead of creating new entries.
- `data/processed/gmbh/` - documents of the predecessor entity Pollinations
  GmbH (2022-2024 German era), kept out of Myceli OP matching.
- `data/other/` - non-billing keepers (contracts, decks, financial models,
  mockups). Never ledger evidence.
- `data/reconcile/` - reconcile working artifacts: `reports/` (per-vendor
  reconcile reports), `proposals/` (validated compute-ledger row proposals),
  `snapshots/` (Economics ledger pulls taken before writes), `writes/` (NDJSON batches
  actually appended to Tinybird, kept as the write audit trail).
- `data/QUESTIONS.md` - the cross-vendor open-questions ledger (resolutions,
  discrepancies, pending decisions).
- `data/archive/` - predecessor projects kept intact for reference: `forager/`
  (the retired Operations-workspace ingest system) and
  `2026-07-01-spend-audit/` (the Q2 2026 per-provider spend audit, incl. its
  dashboard and raw vendor evidence). Read-only; do not build on these.

The whole `data/` folder is ignored by Git. Keep raw invoices, CSV exports,
screenshots, generated local entries, and working artifacts there — never in
`_local/` or other scratch locations.

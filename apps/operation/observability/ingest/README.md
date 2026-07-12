# Economics Ingest

This folder contains the committed ingest machinery for Economics OP data.

Committed:

- `agent.system.txt` - the single Economics ingest agent prompt.
- `entry.schema.json` - structured entry output schema and vocabulary.
- `example-entry.json` - example structured entry.
- `connectors/` - provider and source collection guides.
- `secrets/` - SOPS-encrypted connector credentials and examples.

Local-only:

- `data/inbox/` - drop zone. Files at the root are untriaged; `data/inbox/<vendor>/`
  holds triaged evidence awaiting extraction, sorted by canonical vendor slug.
- `data/processed/<vendor>/<source_id>/` - one folder per source document:
  `entries.ndjson` (one ingest_entry.v1 object per line — a document may split
  into per-category or per-model entries) plus every raw evidence file,
  original filenames preserved. Duplicates of an already-registered document
  move into the existing folder instead of creating new entries.
- `data/processed/runway/entries/` - NDJSON batches of approved forecast facts
  (not invoice-backed; see forecast mode in `agent.system.txt`).
- `data/processed/gmbh/` - documents of the predecessor entity Pollinations
  GmbH (2022-2024 German era), kept out of Myceli OP matching.
- `data/other/` - non-billing keepers (contracts, decks, financial models,
  mockups). Never ledger evidence.
- `data/reconcile/` - reconcile working artifacts: `reports/` (per-vendor
  reconcile reports), `proposals/` (validated op_cloud row proposals),
  `snapshots/` (op table pulls taken before writes), `writes/` (NDJSON batches
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

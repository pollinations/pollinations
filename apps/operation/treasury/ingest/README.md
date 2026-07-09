# Treasury Ingest

This folder contains the committed ingest machinery for Treasury OP data.

Committed:

- `connectors/` - provider and source collection guides.
- `prompts/` - agent prompts for collection, extraction, and reconciliation.
- `schemas/` - structured output schemas and controlled vocabularies.
- `scripts/` - small processing helpers.
- `secrets/` - SOPS-encrypted connector credentials and examples.

Local-only:

- `data/inbox/` - unsorted drop zone for PDFs, CSVs, screenshots, exports, and notes.
- `data/processed/<vendor>/raw/` - original source artifacts after classification.
- `data/processed/<vendor>/entries/` - generated structured JSON entries.

The whole `data/` folder is ignored by Git. Keep raw invoices, CSV exports,
screenshots, and generated local entries there.

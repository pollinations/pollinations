# Treasury Ingest

This folder contains the committed ingest machinery for Treasury OP data.

Committed:

- `agent.system.txt` - the single Treasury ingest agent prompt.
- `entry.schema.json` - structured entry output schema and vocabulary.
- `example-entry.json` - example structured entry.
- `connectors/` - provider and source collection guides.
- `secrets/` - SOPS-encrypted connector credentials and examples.

Local-only:

- `data/inbox/` - unsorted drop zone for PDFs, CSVs, screenshots, exports, and notes.
- `data/processed/<vendor>/raw/` - original source artifacts after classification.
- `data/processed/<vendor>/entries/` - generated structured JSON entries.

The whole `data/` folder is ignored by Git. Keep raw invoices, CSV exports,
screenshots, and generated local entries there.

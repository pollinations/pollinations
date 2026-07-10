# Ingest Secrets

Local connector credentials live here.

Files:

- `env.json`: SOPS-encrypted real local secrets for AI-operated collection.
- `env.example.json`: same keys with empty values.

Rules:

- Do not print secret values in chat or logs.
- Decrypt with `sops -d env.json` and keep decrypted values in memory only.
- Do not pass encrypted `ENC[...]` values to providers.
- Do not write API tokens into connector guides, entries, or reconciliation notes.
- Prefer checking key presence by name only.
- Keep this directory inside `apps/operation/economics/ingest/` so the ingest workspace is self-contained.

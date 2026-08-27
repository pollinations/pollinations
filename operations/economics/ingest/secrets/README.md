# Ingest Secrets

Local connector credentials live here.

Files:

- `env.json`: SOPS-encrypted real local secrets for read-only provider
  collection. Runtime-key rotation is outside the Economics collection skill.
- `env.example.json`: same keys with empty values.

Rules:

- Do not print secret values in chat or logs.
- Do not run `sops -d env.json` in a captured command — it prints the whole
  decrypted store to the logs. Run the consuming command under `sops exec-env
  env.json '<cmd>'` so values stay in that subprocess's environment only, never
  in stdout, logs, or a file.
- Do not pass encrypted `ENC[...]` values to providers.
- Do not write API tokens into provider guides, entries, or reconciliation notes.
- Prefer checking key presence by name only.
- Keep this directory inside `operations/economics/ingest/` so the ingest workspace is self-contained.

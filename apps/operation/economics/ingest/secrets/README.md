# Ingest Secrets

Local connector credentials live here.

Files:

- `env.json`: SOPS-encrypted real local secrets for AI-operated collection.
  Also holds the admin credentials the `secret` mode needs to rotate a
  provider's runtime key (e.g. `TINYBIRD_ADMIN_TOKEN`, `XAI_MANAGEMENT_KEY` +
  `XAI_TEAM_ID`, `FIREWORKS_ACCOUNT_ID` + `FIREWORKS_USER_ID`,
  `ELEVENLABS_ADMIN_API_KEY` + `ELEVENLABS_SERVICE_ACCOUNT_ID`) — see each
  connector's `## Rotation` section and `connectors/INTERNAL.md`.
- `env.example.json`: same keys with empty values.

Rules:

- Do not print secret values in chat or logs.
- Decrypt with `sops -d env.json` and keep decrypted values in memory only.
- Do not pass encrypted `ENC[...]` values to providers.
- Do not write API tokens into connector guides, entries, or reconciliation notes.
- Prefer checking key presence by name only.
- Keep this directory inside `apps/operation/economics/ingest/` so the ingest workspace is self-contained.

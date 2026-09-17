# Changelog

## 2026-09-17

- Add `--key`, `--model`, `--days`, and `--csv` filters to `polli usage --history` and `polli usage --daily`.
- Filter key names resolve via `/account/keys`; 32-char alphanumeric IDs are used directly without a lookup. Unknown names fail with near-match suggestions; ambiguous names fail listing the matching ids.
- History rows now include `key`, `tokens_in`, and `tokens_out` fields; daily rows include a `key` column.
- `--csv` requests `format=csv` and prints the response verbatim; `--daily --model` filters client-side and is rejected together with `--csv` since the daily endpoint has no server-side model breakdown.
- Validate `--days` as a positive integer up to 90.

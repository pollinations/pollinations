# Weekly Update - 2025-08-02

- **Test Cleanup** — Removes 53 obsolete and unmaintained test files across services, deleting over 11k lines of legacy code including `test-json-optimization.js` and Cloudflare cache tests. [PR #3397](https://github.com/pollinations/pollinations/pull/3397)
- **Ad System Logic Fix** — Fixes a critical logic error in `shouldShowAds.js` where `BAD_DOMAINS` were incorrectly forced to show ads. Adds `vk.com` to the blocked domains list. [PR #3359](https://github.com/pollinations/pollinations/pull/3359)
- **Pollen Price Calculation** — Updates the Pollen pricing calculation logic to use new precise cost data. [PR #3384](https://github.com/pollinations/pollinations/pull/3384)
- **Tinybird Analytics Update** — Adds multiple request/response parameters to Tinybird ingestion to improve usage analytics. [PR #3373](https://github.com/pollinations/pollinations/pull/3373)
- **Image Request Logging** — Implements logging of image requests to the new Tinybird configuration. [PR #3365](https://github.com/pollinations/pollinations/pull/3365)
- **Hybrid Model Integration** — Integrates the BPAIGen+Kontext hybrid model system, setting BPAIGen (1216px) as primary and Kontext (640px) as fallback. Existing `?model=kontext` requests are automatically upgraded. [PR #3364](https://github.com/pollinations/pollinations/pull/3364)
- **Hourly Token Usage Endpoint** — Adds a new `hourly_token_usage` endpoint for Tinybird with configurable parameters. [PR #3357](https://github.com/pollinations/pollinations/pull/3357)
- **Dev Shell UX** — Adds a custom prompt and banner to the development shell to clearly indicate the active environment. [PR #3350](https://github.com/pollinations/pollinations/pull/3350)
- **OpenAPI Specification** — Adds a draft OpenAPI specification for `image.pollinations.ai` to facilitate documentation generation and API testing. [PR #3351](https://github.com/pollinations/pollinations/pull/3351)
- **Documentation Update** — Adds common `sops` commands to `DEVELOP.md` for secret management reference. [PR #3349](https://github.com/pollinations/pollinations/pull/3349)
- **Reproducible Dev Shell** — Introduces a `flake.nix` for a reproducible development shell and integrates `sops` for transparent environment variable encryption/decryption. [PR #3283](https://github.com/pollinations/pollinations/pull/3283)

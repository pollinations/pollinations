# Pollinations.ai threat model

Pollinations.ai is an open-source AI API and application platform. It accepts
untrusted requests, authenticates users and API keys, routes generation to
providers, and charges a Pollen wallet. Applications also use its SDK and
Bring Your Own Pollen authorization flow. See `/src/SECURITY.md` for the existing
security policy; the published security contact is hello@pollinations.ai.

## Priority components and boundaries

- `enter.pollinations.ai/`: login and sessions, OAuth authorization codes and
  PKCE, device authorization, API-key creation and permissions, account/admin
  endpoints, dashboard, Stripe webhooks, and wallet credits.
- `gen.pollinations.ai/`: public generation routes, authentication and balance
  enforcement, provider adapters, URL/media fetching, rate limits, streaming,
  caches, and the durable generation coordinator.
- `media.pollinations.ai/`: authenticated uploads, public retrieval, tagged
  public galleries, and owner-only deletion.
- `shared/`: authentication, D1 database schema, billing deductions, key budgets,
  model registry, and request/response utilities used by both Workers.
- `packages/auth/`, `packages/sdk/`, and `packages/mcp/`: application integration,
  delegated authorization, and tool inputs.
- `.github/workflows/`: issue, comment, and pull-request automation that passes
  untrusted titles and bodies to scripts and AI agents holding repository tokens.
  Review statically; do not trigger workflows.

`apps/`, `operations/`, and the `pollinations.ai/` website are lower priority;
report them only when they cross one of the boundaries above.

Treat HTTP paths, query parameters, headers, cookies, JSON/form bodies, uploaded
media, remote URLs, OAuth redirect URIs and client metadata, webhook bodies, and
provider/model output as untrusted. Test unauthenticated callers and ordinary
accounts as distinct attackers. A caller must not acquire another user's
credentials, permissions, private data, or wallet balance. Delegated keys must
retain their model, account-permission, expiry, and spending restrictions.

Follow data across the Gen/Enter service boundary and into D1, KV, R2, and Durable
Objects. Pay particular attention to spoofed internal identity, SSRF and redirect
handling, webhook verification/replay, concurrent debits and credits, cache
authorization, and disconnect/rejoin behavior that could execute or bill a
generation more than once. Provider responses must not become trusted billing
or privileged instructions without the checks required by their protocol.

Publishable keys are intentionally usable by browser clients. Their mere
presence in frontend code is not a leak; demonstrate a violation of their
intended restrictions. Arbitrary model output is not itself a vulnerability:
show a concrete security boundary crossed in Pollinations-owned code.

## Build and offline reproduction

The Dockerfile installs the root npm workspaces and the standalone MCP and media
dependencies, then builds Enter (including the dashboard, SDK, and UI) and Gen.
The complete public checkout is at `/src`. No provider credentials, live accounts, SOPS keys,
or production data are needed or provided. Tests use the repository's existing
Cloudflare Workers test pool, local bindings/migrations, and synthetic fixtures.
`TEST_VCR_MODE=replay-only` prevents recording new provider requests.

Run the focused security regression suites from `/src`:

```sh
npm test --workspace pollinations-enter -- test/oauth-code.test.ts test/account-key.test.ts test/balance-check.test.ts
npm test --workspace pollinations-gen -- test/billing-deduction.test.ts test/generation-deduplication.test.ts test/media-cache.test.ts
npm test --workspace @pollinations/auth
npm test --workspace @pollinations/sdk
npm test --prefix /src/packages/mcp
npm test --prefix /src/media.pollinations.ai
```

Other tests are available in the same directories. Tests that explicitly require
live providers, real payment accounts, deployed resources, or missing recorded
responses cannot run offline. Reproduce new findings locally using the existing
test fixtures and direct imports of real implementation code. Do not substitute
mock application logic for the vulnerable code or weaken assertions.

The build covers the priority components above; it does not provision the GPU
fleet or every standalone app in the monorepo. Do not probe deployed services,
third-party providers, maintainer accounts, or production infrastructure.

## Report expectations and proposed severity guidance

Follow `SECURITY.md`. For this scan, prioritize demonstrated remote exploitation:

- Critical: broad account takeover, remote code execution across a privileged
  boundary, or systemic theft of credentials or wallet funds.
- High: cross-account access, exploitable authentication/authorization bypass,
  significant repeatable billing manipulation, or SSRF with demonstrated access
  to a protected resource.
- Medium: exploitable impact with meaningful constraints, or a reproducible
  denial of service beyond ordinary permitted traffic and rate limits.
- Low: limited-impact issues; distinguish hardening suggestions from exploits.

State attacker privileges and prerequisites, affected source locations, exact
reproduction commands, expected versus actual behavior, and demonstrated impact.
Include a minimal regression test and patch where possible. Deduplicate reports
by root cause. Clearly label unverified hypotheses and environmental assumptions.
Do not report placeholders, consumed one-time codes, public identifiers, or
encrypted SOPS blobs as exposed reusable credentials without evidence.

Keep findings private to the designated security contact. Self-XSS, ordinary
rate-limited traffic, social engineering, unrelated third-party bugs, and model
moderation preferences follow the exclusions in `SECURITY.md`.

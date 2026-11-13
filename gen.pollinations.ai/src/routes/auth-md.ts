import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

/**
 * `auth.md` (https://workos.com/auth-md) is a Markdown file an API hosts so an
 * agent can learn which credentials it accepts and how to get one without a
 * human reading the HTML docs. Pollinations does not accept agent-initiated
 * registration (`anonymous`, ID-JAG `identity_assertion`, claim), so this file
 * says that outright and documents the credential paths that do exist: device
 * flow, a key created in the dashboard, x402 prepaid keys, and scoped keys.
 *
 * It is linked from llms.txt and served from the public origin, so staging
 * points at staging enter, like the OAuth metadata next to it.
 */
export function authMd(c: Context<Env>): Response {
    const origin = getPublicOrigin(c);
    const enter = origin.replace(
        "gen.pollinations.ai",
        "enter.pollinations.ai",
    );
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(`# Pollinations authentication

Pollinations generates text, images, audio, video and embeddings at ${origin}.
Every generation request needs a secret key in \`Authorization: Bearer sk_…\`.
A \`pk_…\` app key only identifies an OAuth client and gets \`401\` on generation.

This file is ${origin}/auth.md. Format: https://workos.com/auth-md

## 1. Check for an existing key

- \`POLLINATIONS_API_KEY\` in the environment authenticates as-is.
- \`npx @pollinations/cli auth status\` prints the signed-in account and balance,
  and fails when nobody is signed in.

## 2. Get a key

Pick the path that fits who is present.

### a. A human is available, no key copy and paste (device flow)

\`npx @pollinations/cli auth login\` prints a user code and ${enter}/device,
then stores the key in the CLI config. The flow is RFC 8628; its endpoints are
advertised in ${enter}/.well-known/oauth-authorization-server, and
\`device_authorization_endpoint\` is ${enter}/api/device/code. The key it creates
carries \`profile\`, \`usage\` and \`keys\` account permissions.

### b. A human can open a browser once

Create a secret key at ${enter}/keys (GitHub sign-in). The form sets the allowed
models, the account permissions, a Pollen budget, and whether the key may spend
paid Pollen. The secret is shown once.

### c. No account at all: a prepaid key over x402

Request \`GET ${enter}/api/x402/keys/0.50\` (any amount in cents, $0.01 to
$10,000). The first response is \`402\` with the payment terms in
\`PAYMENT-REQUIRED\`; pay with an x402 wallet on Base and retry the same request
with \`PAYMENT-SIGNATURE\`. The response carries \`key\` (the \`sk_…\` secret) and
\`pollen\` (its budget). Each payment creates a new key.

### d. An existing account, scoped to this agent

\`\`\`bash
npx @pollinations/cli keys create --name my-agent --type secret \\
  --models text --budget 1000 --quest-pollen-only --permissions profile usage
\`\`\`

\`--models\` limits the key to a category (\`text\`, \`image\`, …) or to explicit
model IDs. \`--quest-pollen-only\` keeps it on Quest Pollen and never spends
paid Pollen.

## 3. First call

\`\`\`bash
curl -s ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-5.4-nano","messages":[{"role":"user","content":"Say ok"}]}'
\`\`\`

- Model IDs, \`paid_only\` and per-token prices: \`GET ${origin}/v1/models\`.
  A model with \`"paid_only": false\` runs on free Pollen.
- Remaining budget: \`GET ${origin}/account/balance\`.
- OpenAI SDKs work with \`baseURL: "${origin}/v1"\` and the key as \`apiKey\`.

## 4. Scopes

\`generate\` is inherent to every key. Optional account permissions are
\`profile\`, \`usage\`, \`keys\` (create and revoke keys) and \`machines\`. A key
without them can generate but gets \`403\` on \`/account/*\`.

## 5. Reading a failure

| Status | Meaning | What to do |
| --- | --- | --- |
| \`401\` | No key, an invalid key, or a \`pk_…\` app key | Send an \`sk_…\` secret; the response also carries \`WWW-Authenticate: Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"\` |
| \`402\` | The model needs paid Pollen and the key may only spend Quest Pollen | Call a model with \`"paid_only": false\`, or use a key with paid balance |
| \`403\` | The key lacks the account permission or the model | Create a key that allows the model or the permission the call needs |
| \`429\` | Rate limit | Wait \`Retry-After\` seconds, then retry |

## 6. Not supported

Agent-initiated registration: no \`anonymous\` flow, no ID-JAG
\`identity_assertion\`, no claim ceremony. Accounts sign in with GitHub, so an
agent gets credentials through 2a, 2b, 2c or 2d. A human appears in 2a, 2b and
2d; 2c needs no account at all.

## See also

- [llms.txt](${origin}/llms.txt) — entry point for agents
- [API guide](${origin}/docs/llm.txt) — plain-text reference and guides
- [OpenAPI schema](${origin}/openapi.json) — endpoints and request schemas
`);
}

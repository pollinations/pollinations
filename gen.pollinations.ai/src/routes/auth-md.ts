import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

/**
 * `auth.md` is a Markdown file an agent reads before its first call: which
 * credential this API accepts, how to get one, and what a failure means
 * (https://workos.com/auth-md). Pollinations does not offer agent-initiated
 * registration, so the file says that instead of leaving the standard's
 * registration flows as an agent's first guess.
 *
 * The origin follows the serving host, like llms.txt and the OAuth metadata.
 */
export function authMd(c: Context<Env>): Response {
    const origin = getPublicOrigin(c);
    const enter = origin.replace(
        "gen.pollinations.ai",
        "enter.pollinations.ai",
    );
    return c.body(
        `# Pollinations authentication

Pollinations serves text, image, audio, video and embeddings from ${origin}.
Generation takes a secret key: \`Authorization: Bearer sk_…\`. A \`pk_…\` app key
identifies an OAuth client and gets \`401\` here.

This file is ${origin}/auth.md, served at the auth.md location
(https://workos.com/auth-md) so an agent can read it before its first call.

## 1. A key you may already have

- \`POLLINATIONS_API_KEY\`, if it is set.
- \`npx @pollinations/cli auth status\` prints the signed-in account and balance,
  and fails when nobody is signed in.

## 2. Getting one

**a. Device flow.** \`npx @pollinations/cli auth login\` prints a code and
${enter}/device, then stores the key. It is RFC 8628; the endpoints are
advertised in ${enter}/.well-known/oauth-authorization-server. The key it
creates carries the \`profile\`, \`usage\` and \`keys\` account permissions.

**b. A browser, once.** Create a secret key at ${enter}/keys (GitHub sign-in).
The form sets the allowed models, account permissions, a Pollen budget, and
whether the key may spend paid Pollen. The secret is shown once.

**c. No account at all: prepaid key over x402.** Request
\`GET ${enter}/api/x402/keys/0.50\` (any amount in cents, $0.01 to $10,000). The
answer is \`402\` with payment terms in \`PAYMENT-REQUIRED\`; pay with an x402
wallet on Base and repeat the request with \`PAYMENT-SIGNATURE\`. The response
carries \`key\` (the secret) and \`pollen\` (its budget). Each payment creates a
new key.

**d. An existing account, scoped to this agent.**

\`\`\`bash
npx @pollinations/cli keys create --name my-agent --type secret \\
  --models text --budget 1000 --quest-pollen-only --permissions profile usage
\`\`\`

\`--models\` takes a category (\`text\`, \`image\`, …) or explicit model IDs;
\`--quest-pollen-only\` never spends paid Pollen.

## 3. First call

\`\`\`bash
curl -s ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-5.4-nano","messages":[{"role":"user","content":"Say ok"}]}'
\`\`\`

- Model IDs, \`paid_only\` and per-token prices: \`GET ${origin}/v1/models\`.
  A model with \`"paid_only": false\` runs on free Pollen.
- Remaining budget: \`GET ${origin}/account/balance\`, which the key may read
  only with the \`usage\` account permission.
- OpenAI SDKs work with \`baseURL: "${origin}/v1"\` and the key as \`apiKey\`.

## 4. Scopes

\`generate\` is inherent to every key. Optional account permissions are
\`profile\`, \`usage\`, \`keys\` (create and revoke keys) and \`machines\`. Without
them a key still generates, and gets \`403\` on \`/account/*\`.

## 5. Status codes on generation

| Status | Meaning | What to do |
| --- | --- | --- |
| \`401\` | No key, an invalid key, or a \`pk_…\` app key | Send an \`sk_…\` secret; the response also carries \`WWW-Authenticate: Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"\` |
| \`402\` | The model needs paid Pollen and the key may only spend Quest Pollen | Call a model with \`"paid_only": false\`, or use a key with paid balance. Buying a key over x402 answers \`402\` too, with \`PAYMENT-REQUIRED\` |
| \`403\` | The key lacks the account permission or the model | Create a key that allows the model or the permission the call needs |
| \`429\` | Rate limit | Wait \`Retry-After\` seconds, then retry |

## 6. Not offered

Agent-initiated registration. There is no \`anonymous\` flow, no ID-JAG
\`identity_assertion\` and no claim ceremony: accounts sign in with GitHub, so an
agent gets credentials through 2a, 2b, 2c or 2d. A human appears in 2a, 2b and
2d; 2c needs no account.

## Read next

- [llms.txt](${origin}/llms.txt) — entry point for agents
- [API guide](${origin}/docs/llm.txt) — plain-text reference and guides
- [OpenAPI schema](${origin}/openapi.json) — endpoints and request schemas
`,
        200,
        {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "text/markdown; charset=utf-8",
        },
    );
}

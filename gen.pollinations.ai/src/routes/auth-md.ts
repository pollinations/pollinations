import { OAUTH_SCOPES } from "@shared/auth/authorize-config.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { etag } from "hono/etag";
import type { Env } from "@/env.ts";

// auth.md: the agent-facing authentication guide.
// https://github.com/workos/auth.md — a plain Markdown document hosted at
// /auth.md telling an agent which sign-in flows exist, which scopes it can ask
// for, and how a credential is issued and revoked. One file, read by a human
// developer and an agent alike. The discovery chain it sits on already exists:
// an unauthenticated call answers 401 with the RFC 9728 protected resource
// metadata, which names the enter authorization server and its RFC 8414
// metadata.

// What the user grants at the consent screen. Kept next to the scope list so a
// scope added upstream cannot go undocumented here.
const SCOPE_PURPOSE: Record<(typeof OAUTH_SCOPES)[number], string> = {
    generate: "Run generations with the key.",
    profile: "Read the account name and email.",
    usage: "Read the full balance and account-wide usage.",
    keys: "Create, list, and revoke API keys. Account admin.",
    machines: "Create and run hosted sandboxes.",
};

function scopeList(): string {
    return OAUTH_SCOPES.map(
        (scope) => `- \`${scope}\` — ${SCOPE_PURPOSE[scope]}`,
    ).join("\n");
}

/**
 * The sign-in document. Origins follow the serving host, so staging points at
 * staging enter and nothing has to be kept in sync by hand.
 */
export function authMarkdown(c: Context<Env>): string {
    const gen = getPublicOrigin(c);
    const enter = gen.replace("gen.pollinations.ai", "enter.pollinations.ai");

    return `# auth.md

You are an agent. This file tells you how to get a Pollinations key and make your
first successful call without a human reading our documentation first. Work through
the steps in order.

\`${gen}\` serves the API. \`${enter}\` is the authorization server that mints keys.
Every API call carries \`Authorization: Bearer <key>\`.

## Step 1 — Discover

A call without a key answers \`401\` and says where to look:

\`\`\`http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="${gen}/.well-known/oauth-protected-resource"
\`\`\`

Fetch that document ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)). It names the
authorization server and the scopes this API understands:

\`\`\`http
GET ${gen}/.well-known/oauth-protected-resource
\`\`\`

\`\`\`json
{
  "resource": "${gen}",
  "authorization_servers": ["${enter}"],
  "scopes_supported": [${OAUTH_SCOPES.map((s) => `"${s}"`).join(", ")}],
  "bearer_methods_supported": ["header"],
  "resource_name": "Pollinations API",
  "resource_documentation": "${gen}/docs/llm.txt"
}
\`\`\`

Then read the authorization server metadata
([RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414)) for the endpoints:

\`\`\`http
GET ${enter}/.well-known/oauth-authorization-server
\`\`\`

\`bearer_methods_supported\` is \`["header"]\` — send the key in the header, never in the
query string.

## Step 2 — Pick a method

| Situation | Method |
| --- | --- |
| You can show the user a URL and poll | **Device flow** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) — start here |
| You can open a browser and catch a redirect | Authorization code + PKCE ([RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749), [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)) |
| Nobody can sign in | Buy a prepaid key with USDC — see [${gen}/docs/llm.txt?section=x402](${gen}/docs/llm.txt?section=x402) |

The device flow is the default for an agent: no redirect URI, no client secret, and
no browser you have to drive. Only the user needs one, once.

Both flows use public clients — \`token_endpoint_auth_methods_supported\` is \`["none"]\`,
so there is no secret to keep.

## Step 3 — Get a key (device flow)

**3a. Request a code.** \`client_id\` is optional; a client metadata document URL is
accepted when you have one.

\`\`\`http
POST ${enter}/api/device/code
Content-Type: application/json

{}
\`\`\`

\`\`\`json
{
  "device_code": "<device code, keep this to yourself>",
  "user_code": "<short code for the user>",
  "verification_uri": "${enter}/device",
  "verification_uri_complete": "${enter}/device?user_code=<short code>",
  "expires_in": <seconds until the code expires>,
  "interval": <seconds to wait between polls>
}
\`\`\`

**3b. Hand off to the user — the only human step.** Show
\`verification_uri_complete\` (or \`verification_uri\` plus \`user_code\`) and ask them to
approve the key. Do not open it yourself.

**3c. Poll the token endpoint.** Send \`client_id\` as well when you sent one in 3a.

\`\`\`http
POST ${enter}/api/oauth/token
Content-Type: application/json

{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "<device code>"
}
\`\`\`

While the user has not approved yet the answer is \`authorization_pending\`; \`slow_down\`
means you polled faster than \`interval\`. Once they approve, the response carries the
credential:

\`\`\`json
{
  "access_token": "sk_...",
  "token_type": "Bearer",
  "expires_in": <seconds>
}
\`\`\`

\`access_token\` is a Pollinations API key. Keep it for the session. There is no refresh
token: when it expires, run Step 3 again. Store it where you keep credentials — never in
a log, a commit, or an issue.

### Authorization code + PKCE

Send the user to \`${enter}/authorize\` with \`response_type=code\`, \`client_id\`,
\`redirect_uri\`, \`scope\`, and a \`code_challenge\` (\`code_challenge_method=S256\`). Exchange
the returned \`code\` at \`${enter}/api/oauth/token\`:

\`\`\`http
POST ${enter}/api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<code from the redirect>",
  "client_id": "<client id>",
  "redirect_uri": "<same redirect uri>",
  "code_verifier": "<verifier for the challenge you sent>"
}
\`\`\`

## Step 4 — Call the API

\`\`\`http
GET ${gen}/account/balance
Authorization: Bearer sk_...
\`\`\`

Reading a key's own balance needs no account scope. A generation looks like:

\`\`\`http
GET ${gen}/image/<prompt>?model=flux
Authorization: Bearer sk_...
\`\`\`

The plain-text API guide is [${gen}/docs/llm.txt](${gen}/docs/llm.txt), the OpenAPI schema
is [${gen}/openapi.json](${gen}/openapi.json), and the live model list is
[${gen}/models](${gen}/models).

## Scopes

Ask only for what you need; every one is opt-in at the consent screen.

${scopeList()}

\`generate\` is inherent to an API key. A key's own balance and usage are readable without
\`usage\`, and the user's GitHub profile through \`/account/profile\` is readable without
\`profile\`.

## Balance and payment

Check the balance before a long run:

\`\`\`http
GET ${gen}/account/balance
Authorization: Bearer sk_...
\`\`\`

Pollen pay for generations. The user can top up, or you can buy a prepaid key with USDC
without an account — see [${gen}/docs/llm.txt?section=x402](${gen}/docs/llm.txt?section=x402).
A \`402\` means the balance is spent, and the answer names the required amount.

## Revocation

There is no \`revocation_endpoint\`: a Pollinations key is revoked at the account API,
which needs the \`keys\` scope.

\`\`\`http
DELETE ${enter}/api/account/keys/<key id>
Authorization: Bearer sk_...
\`\`\`

A key cannot revoke itself. Tell the user to revoke a key you no longer need, or to check
the list at [${enter}/keys](${enter}/keys).

## Errors

| Response | Meaning | What to do |
| --- | --- | --- |
| \`401\` | No key, or an expired one | Read the \`WWW-Authenticate\` header, then Step 1. |
| \`402\` | The balance is spent | Report the amount from the body; the user tops up. |
| \`403\` | The key lacks the scope for this route | Ask for the scope in Step 2 and get a new key. |
| \`429\` | Rate limited | Back off, retry. |

Do not retry a \`400\` unchanged — it names a bad argument, such as an image size the
model rejects.

## Pointers

- Plain-text API guide: [${gen}/docs/llm.txt](${gen}/docs/llm.txt)
- Protected resource metadata: [${gen}/.well-known/oauth-protected-resource](${gen}/.well-known/oauth-protected-resource)
- Authorization server metadata: [${enter}/.well-known/oauth-authorization-server](${enter}/.well-known/oauth-authorization-server)
- All agent entry points in one file: [${gen}/llms.txt](${gen}/llms.txt)
`;
}

export const authMdRoutes = new Hono<Env>().get("/auth.md", etag(), (c) => {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(authMarkdown(c));
});

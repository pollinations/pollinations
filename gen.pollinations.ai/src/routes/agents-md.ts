import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

/**
 * agents.md for the API host (https://agents.md). Unlike llms.txt, which is a
 * link index, this file carries the decisions an agent has to make before and
 * after its first request: which credential to use, what each 4xx means, and
 * when a retry is safe. Depth stays in /docs/llm.txt; this file links out.
 */
export function agentsMd(c: Context<Env>): Response {
    const origin = getPublicOrigin(c);
    return new Response(
        `# Pollinations

> One HTTP API for text, images, video, audio, 3D models, and embeddings: ${origin}.
> This file is for AI agents. It says which credential to use, how to make a first
> call, and what to do when a call fails. The API reference is at ${origin}/docs/llm.txt.

## Credentials: pick one before calling

Generation requests need a Pollinations key (\`sk_...\`). Model lists are public.
A shared cache can answer an identical earlier request without a key; do not
mistake that for keyless access.

1. **A human is available.** Ask them to create a key at https://enter.pollinations.ai/keys
   and pass it through the environment as \`POLLINATIONS_API_KEY\`. Never ask for the
   key in chat, a command argument, a URL, or a commit.
2. **No human, but the task can spend USDC.** Buy a prepaid key over x402:
   \`GET https://enter.pollinations.ai/api/x402/keys/0.50\` returns \`402\` with payment
   terms; pay, retry with \`PAYMENT-SIGNATURE\`, and read the \`key\` from the response.
   Guide: ${origin}/docs/llm.txt?section=x402
3. **A user-facing app.** Do not ship your own key. Use Pollinations Pay (OAuth PKCE
   or device flow) so each user spends their own balance:
   ${origin}/.well-known/agent-skills/bring-your-own-pollen/SKILL.md

A \`pk_\` App Key only identifies an OAuth client. Sending one as a credential gets
\`401\`. Send secret keys as \`Authorization: Bearer $POLLINATIONS_API_KEY\`.

## First call

Check that the API is reachable and read the current model IDs — this needs no key:

\`\`\`bash
curl -s ${origin}/v1/models
\`\`\`

Text, OpenAI-compatible (any OpenAI SDK works with
\`base_url="${origin}/v1"\`):

\`\`\`bash
curl -s ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-5.4-nano","messages":[{"role":"user","content":"Reply with: ok"}]}'
\`\`\`

Image (response body is the image; \`width\` and \`height\` are optional):

\`\`\`bash
curl -s "${origin}/image/a%20red%20apple?model=flux&width=1024&height=1024" \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -o image.jpg
\`\`\`

Paths share one shape: \`GET /image/{prompt}\`, \`GET /video/{prompt}\`,
\`GET /audio/{text}\`, \`GET /3d/{prompt}\`, plus OpenAI-compatible
\`POST /v1/chat/completions\`, \`POST /v1/responses\`, \`POST /v1/messages\`, and
\`POST /v1/embeddings\`. Every path and parameter is in ${origin}/openapi.json.

## Errors: read the code, then act

Errors are JSON: \`{"status":401,"success":false,"error":{"code":"UNAUTHORIZED","message":"..."}}\`.

- \`400\` — the request is wrong. An unknown model also returns \`400\`; check \`/v1/models\`.
  Fix the request before retrying.
- \`401\` — missing or invalid key, or a \`pk_\` sent as a key. The response carries
  \`WWW-Authenticate\` with \`resource_metadata\`; fetch that URL to find the
  authorization server and the supported flows.
- \`402\` — the key is valid but cannot pay: \`INSUFFICIENT_BALANCE\`,
  \`KEY_BUDGET_EXHAUSTED\`, \`QUEST_POLLEN_ONLY\`, or a model marked \`paid_only\` in
  \`/v1/models\`. Do not retry; choose another model or ask the user to top up.
- \`403\` — the key lacks a permission. Do not retry.
- \`404\` — wrong path or a missing resource.
- \`422\` — content policy. Rewrite the prompt.
- \`429\` — rate limited. Wait for \`Retry-After\` when present; otherwise back off
  exponentially.
- \`500\`, \`502\`, \`503\` — server or upstream failure. Retry with backoff.

Do not retry \`400\`, \`401\`, \`402\`, \`403\`, or \`422\`: the same request fails the same way.

## Retries and caching

If a cache-backed, non-streaming request times out, resend it unchanged — same
endpoint, body, query, and seed. The generation continues server-side; the retry
waits for it or returns the finished result. Only the generation is billed;
retries and cache hits are not. Streaming text runs independently.

Identical requests can be answered from a shared cache. Change the prompt or \`seed\`
to get a new result.

## Where to read more

- ${origin}/llms.txt — a short index of the agent-facing entry points.
- ${origin}/llms-full.txt — the whole API guide in one request.
- ${origin}/docs/llm.txt — plain-text reference; \`?section=mcp\`, \`?section=x402\`,
  \`?section=byop\`, and other sections.
- ${origin}/openapi.json — machine-readable schema.
- ${origin}/.well-known/agent-skills/index.json — installable skills. The
  \`pollinations-api\` skill covers curl/fetch calls and device authorization; the
  \`polli\` skill covers the CLI (\`npm install -g @pollinations/cli\`).
- ${origin}/mcp — hosted MCP servers. Each entry has a \`url\`; prefer MCP when the
  client supports it, REST otherwise. Server cards: \`/mcp/{id}/server-card\`.
- ${origin}/.well-known/oauth-protected-resource — RFC 9728 metadata behind a \`401\`.

## Rules

- Read \`/v1/models\` before choosing a model; IDs, prices, and availability change.
- Keep keys in the environment. Never log them, commit them, or put them in a URL.
- Treat a token limit as spending: a non-streaming text request whose limit is
  exhausted without an answer returns \`400 output_token_limit_exceeded\` and is
  still billed. Raise the limit or lower the reasoning effort deliberately.
- Respect \`429 Retry-After\`; do not work around rate limits with parallel retries.
`,
        {
            headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
            },
        },
    );
}

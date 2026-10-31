# image-diff-mcp — Design

Fixes #17689

## What it does

`compare_images` takes two images (URL or data URI) and asks a vision model to
describe how they differ, returning structured JSON instead of free text.

This fills a gap in the current MCP tool set: `generate_image`, OCR/vision
extraction (#17922), and QR decoding (#17818/#17994) all operate on a single
image. Nothing compares two.

## Why structured output, no bbox/percentage

Vision models can describe differences in words reliably, but cannot give a
trustworthy pixel-level bounding box or similarity percentage — those numbers
would be fabricated precision. The tool is honest about this: it returns a
coarse `similarity` bucket and a list of described differences, with a
`legibility` field flagging when the model itself is unsure, mirroring the
honesty principle used in the OCR/vision-mcp design (#17922).

## Verified prerequisite (2026-10-31)

Confirmed via curl against `gen.pollinations.ai/v1/chat/completions`:

- A single user message's `content` array can hold two `image_url` entries —
  the model correctly told apart two different generated images and
  confirmed two identical ones.
- `response_format: {type: "json_schema", json_schema: {schema, strict: true}}`
  is supported and returns clean, schema-conformant JSON.

Because both held, no two-call fallback is needed — one chat completion with
`response_format: json_schema` does the whole job.

## Tool: `compare_images`

Input:

```ts
{
  image_a: string;        // URL or data: URI
  image_b: string;        // URL or data: URI
  focus?: string;         // optional hint: "text" | "layout" | "color" | "objects" | free text
  model?: string;         // optional vision-capable model override (default: "openai")
}
```

Output (JSON text content):

```ts
{
  identical: boolean;
  similarity: "identical" | "minor_differences" | "major_differences" | "unrelated";
  differences: string[];   // specific, human-readable differences; empty if identical
  legibility: "high" | "medium" | "low";  // model's confidence in its own read
}
```

Request to upstream: one `POST /v1/chat/completions` with the caller's bearer
token forwarded as-is (same pattern as ask-jev-mcp — no extra MCP fee, pricing
is `billing: "downstream"`), `model` (default `"openai"`), a single user
message with a text instruction (including `focus` if given) followed by the
two `image_url` content items, and `response_format` set to the JSON Schema
above with `strict: true`.

## Edge cases (STEP 10)

- Reject non-string / empty `image_a` or `image_b` before calling upstream.
- Reject obviously malformed URLs/data URIs early (bad scheme, no data after
  `data:`).
- Oversized `data:` URIs rejected early. `createMcpHandler` enforces a hard
  4 MiB *total* JSON-RPC request body cap by default (the same limit
  ask-jev-mcp inherits unchanged), and two images share that budget in one
  call, so each is capped at 1 MB of *decoded* image data (the string-length
  cap accounts for base64's ~4/3 overhead) — comfortably below the transport
  ceiling with headroom for the envelope and the second image. `http(s)`
  URLs get a separate, much smaller 8 KB URL-length cap.
- Upstream non-2xx responses mapped through the shared `parseApiError` (same
  as ask-jev-mcp) so callers get a consistent message, not a raw stack. A
  200 response with a non-JSON body (rare, but possible from an edge/proxy
  error page) still surfaces the raw JSON-parse error — ask-jev-mcp has the
  same gap, not fixed here to keep the two workers' error-handling in sync.
- The model's JSON output is validated against a zod mirror of the
  `response_format` JSON Schema (`CompareResultOutputSchema`) before being
  returned, and a non-conforming result is surfaced as an MCP tool error
  rather than passed through. `strict: true` should make a mismatch rare,
  but it isn't verified to be impossible across every upstream provider and
  model, and no tool in this repo currently re-validates
  `response_format: json_schema` output, so this check is the only thing
  actually enforcing the documented output contract.

## Reuse from `packages/mcp/src/utils/coreUtils.js`

`buildUrl`, `fetchJsonWithAuth`, `createMCPResponse`, `createTextContent`,
`parseApiError` — same utilities ask-jev-mcp uses, no new shared code needed.

## Test plan (STEP 11)

- schema validation rejects bad `image_a`/`image_b` before fetching
  (bad URL, bad data URI, oversized data URI, over-long http(s) URL)
- happy path: two different images → `identical: false`, non-empty `differences`
- happy path: same image twice → `identical: true`, `differences: []`
- `focus` parameter is forwarded into the instruction text
- `model` override is forwarded to the upstream request
- upstream 402/429/500 mapped via `parseApiError`
- vision model's JSON content that doesn't match the output schema is
  rejected rather than returned
- unexpected upstream response shapes (missing/empty `choices`) are rejected
- auth pass-through: concurrent calls with different caller tokens don't cross
- env-gated live test (real Pollinations call) skipped by default, same
  pattern as other MCP workers in this repo

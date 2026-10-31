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
- Oversized `data:` URIs (set a byte cap, e.g. 8 MB per image) rejected early
  with a clear message rather than sent upstream.
- Upstream non-2xx / non-JSON responses mapped through the shared
  `parseApiError` (same as ask-jev-mcp) so callers get a consistent message,
  not a raw stack.
- If the model returns JSON that fails schema validation despite
  `strict: true` (defensive — should not happen), surface it as an MCP tool
  error rather than returning malformed data.

## Reuse from `packages/mcp/src/utils/coreUtils.js`

`buildUrl`, `fetchJsonWithAuth`, `createMCPResponse`, `createTextContent`,
`parseApiError` — same utilities ask-jev-mcp uses, no new shared code needed.

## Test plan (STEP 11)

- schema validation rejects bad `image_a`/`image_b` before fetching
- happy path: two different images → `identical: false`, non-empty `differences`
- happy path: same image twice → `identical: true`, `differences: []`
- `focus` parameter is forwarded into the instruction text
- upstream 401/429/500/non-JSON mapped via `parseApiError`
- auth pass-through: concurrent calls with different caller tokens don't cross
- env-gated live test (real Pollinations call) skipped by default, same
  pattern as other MCP workers in this repo

# image-diff-mcp

An MCP server that compares two images and returns a structured description
of how they differ. Built for [#17689](https://github.com/pollinations/pollinations/issues/17689).

## Why

The existing MCP tool set (`generate_image`, OCR/structured extraction,
QR decoding) all operate on a single image. Nothing compares two images
against each other. `compare_images` fills that gap.

## Tool: `compare_images`

```ts
compare_images({
  image_a: string,   // URL or data: URI
  image_b: string,   // URL or data: URI
  focus?: string,    // optional hint, e.g. "text" | "layout" | "color" | "objects"
  model?: string,    // optional vision-capable model override, default "openai"
}) -> {
  identical: boolean,
  similarity: "identical" | "minor_differences" | "major_differences" | "unrelated",
  differences: string[],
  legibility: "high" | "medium" | "low",
}
```

Call it with a bearer token (your Pollinations API key, same as any other
Pollinations MCP server). The key is forwarded as-is to
`gen.pollinations.ai/v1/chat/completions` — this server adds no fee of its
own, see [DESIGN.md](./DESIGN.md).

## What it does under the hood

One `POST /v1/chat/completions` request with a single user message whose
`content` array holds a text instruction followed by two `image_url` items,
plus `response_format: { type: "json_schema", json_schema: { strict: true } }`
so the model returns schema-conformant JSON directly — no manual parsing of
free text, no second call.

## Honest limits

Vision models cannot reliably produce pixel-level bounding boxes or a
numeric similarity percentage. This tool does not pretend otherwise: it
returns a coarse `similarity` bucket plus a plain-language list of
differences, and a `legibility` field the model uses to flag when it isn't
confident in its own read (e.g. images too small or too similar to judge
reliably).

Each image reference (if a `data:` URI) is capped at 8 MB.

## Local development

```sh
npm install
npm test               # unit tests (upstream mocked)
npx wrangler dev        # run the worker locally
```

Live test against the real API (uses real quota, skipped by default):

```sh
IMAGE_DIFF_MCP_LIVE_TEST=1 POLLINATIONS_API_KEY=sk_... node --test worker.test.js
```

See [DESIGN.md](./DESIGN.md) for the full design rationale, including the
verified prerequisite that `gen.pollinations.ai`'s chat completions endpoint
accepts two images in one message.

---
name: pollinations-sdk
description: Use the official @pollinations/sdk npm package when writing JavaScript apps or scripts that call Pollinations. Covers installation, API-key authentication, and a first text or image request.
---

# Pollinations SDK quickstart

These examples use the published stable SDK 5.0.0, not the repository's
in-progress alpha API. Check the installed version's types before using other
helpers; methods on `main` may not exist in the published package.

## Install and authenticate

```bash
npm install @pollinations/sdk@5.0.0
```

Get a key at https://enter.pollinations.ai/keys and set
`POLLINATIONS_API_KEY` in the process environment. Never print it or commit it.
Requests spend Pollen: confirm the intended model and budget before running.

Save this as `example.mjs` and run `node example.mjs`:

```js
import { configure, generateText, generateImage } from "@pollinations/sdk";

configure({ apiKey: process.env.POLLINATIONS_API_KEY });

const text = await generateText("Write a short haiku about a garden.");
console.log(text);

const image = await generateImage("A small garden in watercolor.");
await image.saveToFile("garden.png");
```

Check that text is nonempty and `garden.png` is readable. The helpers return a
single result by default; `n` requests multiple results. `saveToFile` is Node-only.

## Beyond the quickstart

- For current model IDs, query https://gen.pollinations.ai/models. Pass a chosen
  ID through the helper's `{ model }` option; do not invent model names.
- For browser apps, use a publishable app key and user-paid sign-in rather than
  embedding a secret key. See the [BYOP guide](https://gen.pollinations.ai/docs/llm.txt?section=byop).
- For device sign-in, React, streaming, editing, and other media, consult the
  [5.0.0 package docs](https://www.npmjs.com/package/@pollinations/sdk/v/5.0.0)
  and its installed type declarations. Verify signatures before copying examples
  from a newer release.
- If no npm package is needed, use the [REST API guide](https://gen.pollinations.ai/docs/llm.txt).

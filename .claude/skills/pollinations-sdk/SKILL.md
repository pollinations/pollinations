---
name: pollinations-sdk
description: Use the official @pollinations/sdk npm package to generate images, text, audio and video from code in one line, with API-key or OAuth device auth. Use when you must write or run an app, script, or test that calls Pollinations.
---

# pollinations-sdk — Pollinations from code

The official npm SDK for https://pollinations.ai. Use it when the agent must
**write and run real code** (an app, a script, a test, a build step). For a
single curl-style call with nothing installed, prefer the `pollinations-api`
skill; for the CLI, prefer the `polli` skill.

## Install

```bash
npm install @pollinations/sdk        # stable release line (5.x)
```

Works in Node ESM/CJS, in the browser via `esm.sh`, and as a browser IIFE
(`https://cdn.jsdelivr.net/npm/@pollinations/sdk`) that exposes the API
client under the global `Pollinations`.

## Authenticate

An API key is required. Get one at https://enter.pollinations.ai/keys

```js
import { configure } from "@pollinations/sdk";
configure({ apiKey: process.env.POLLINATIONS_API_KEY });
```

or just export the env var — the SDK reads it automatically:

```bash
export POLLINATIONS_API_KEY=your_api_key
```

Headless/CLI: use the OAuth device flow so the user approves in their own
browser and no key ever lands in a chat, log, or repo:

```js
import { authorizeDevice, configure, userInfo } from "@pollinations/sdk";
const auth = await authorizeDevice();
console.log(`Open ${auth.verificationUri} and enter code: ${auth.userCode}`);
const accessToken = await auth.poll();      // blocks until approved
configure({ apiKey: accessToken });
const me = await userInfo();
```

## Quick start

```js
import { generateText, generateImage } from "@pollinations/sdk";

const text = await generateText("explain quantum computing in simple terms");
console.log(text);

const image = await generateImage("a futuristic cityscape");
await image.saveToFile("cityscape.png");
```

## Media

- **Image:** `generateImage(prompt, opts)` returns an object with
  `saveToFile(path)`, `toDataURL()`, `writeTo` and `bytes` helpers.
  `editImage(image, instruction, opts)` edits an existing image;
  `imageUrl(prompt, opts)` returns a plain URL.
- **Audio:** `generateAudio(text, { voice })` for TTS;
  `transcribe(audio, { model: "whisper-large-v3" })` for speech-to-text.
- **Video:** `generateVideo(prompt, { duration })`; build the download URL with
  `videoUrl(...)`.
- **Text:** `generateText`, `generateTextStream`, `chat`, `chatStream`
  (OpenAI-compatible `/v1/responses`), `embeddings`, and `decision` for
  structured decisions.

## Accounts and keys

`getBalance()`, `getDailyUsage()`, `getUsage()`, `getKeyUsage()`, `getProfile()`,
`userInfo()`, `createKey()`, `listKeys()`, `revokeKey()`, `validateKey()`,
`getModels()`/`fetchModelCatalog()`, `upload()`.

## Browser and React

```html
<script type="module">
  import { configure, generateText, generateImage } from "https://esm.sh/@pollinations/sdk";
  configure({ apiKey: "..." });
  const text = await generateText("write a haiku");
  const image = await generateImage("a cute robot");
  const p = document.createElement("p");   // build nodes, do NOT interpolate
  p.textContent = text;                    // model output into innerHTML
  const img = document.createElement("img");
  img.src = image.toDataURL();
  document.body.replaceChildren(p, img);
</script>
```

React: `@pollinations/sdk/react` provides `PolliProvider`, `useAuth`,
`useAccountProfile`, `useAccountBalance`, `useAccountKey`, `useAccountKeyUsage`,
generation hooks (`useImageGeneration`, `useTextGeneration`,
`useAudioGeneration`, `useVideoGeneration`, `useTranscription` — each returns
`{ data, isLoading, error, run, rerun, cancel }`; call `run` from an event
handler, not during render), and `usePollinationsChatTransport` for the Vercel
AI SDK `useChat`. In Next.js wrap it in a `"use client"` component.
The React subpath ships ESM/CJS only — bundle it.

## Pitfalls

- `authorizeDevice()` does not need a key — it is how you obtain one.
- Build DOM nodes with `textContent`/`createElement` instead of interpolating
  model output into `innerHTML`; model output can carry markup.
- Revoke object URLs when regenerating: `URL.revokeObjectURL(src)`.
- Do not pin `@pollinations/sdk@alpha` unless you specifically need the
  in-progress rebuild; the stable line is the release `5.x`.

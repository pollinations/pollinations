# @pollinations/sdk

Official SDK for [pollinations.ai](https://pollinations.ai) - Generate images, text, audio, and video with one simple package.

[![npm version](https://img.shields.io/npm/v/@pollinations/sdk.svg)](https://www.npmjs.com/package/@pollinations/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!WARNING]
> **The `alpha` release line (`5.1.0-alpha.x`) is unstable and breakage-prone.**
> It ships the in-progress rebuild (model-catalog helper and provider changes) and its API may change between alpha versions without notice. The stable `latest` line is `5.0.0`. Opt into the alpha only deliberately, and pin an exact version.

## Installation

Stable (recommended):

```bash
npm install @pollinations/sdk
```

Alpha (in-progress rebuild — pin an exact version):

```bash
npm install @pollinations/sdk@alpha
# or pin exactly: npm install @pollinations/sdk@5.1.0-alpha.6
```

### CDN / `<script>` tag

The SDK also ships a browser IIFE bundle for direct `<script>` use:

```html
<script src="https://cdn.jsdelivr.net/npm/@pollinations/sdk"></script>
<script>
  const { generateImage, generateText } = Pollinations;
  // ...
</script>
```

The IIFE bundle exposes only the **API client** under the global
`Pollinations`. The React subpath (`PolliProvider`, `useAuthState`, etc.)
is shipped as ESM/CJS only — use a bundler (Vite, webpack, Next.js, etc.)
to consume it. There's no IIFE entry for `./react` because every React
app already has a build step.

## Quick Start

First, get your API key at **https://enter.pollinations.ai/keys** and set it:

```bash
export POLLINATIONS_API_KEY=your_api_key
```

Then:

```javascript
import { generateImage, generateText } from '@pollinations/sdk';

// Generate an image
const image = await generateImage('a futuristic cityscape');
await image.saveToFile('cityscape.png');

// Generate text
const text = await generateText('explain quantum computing in simple terms');
console.log(text);
```

### Complete Beginner Example

New to coding? Here's a complete file you can copy-paste and run:

```javascript
// save this as: my-first-ai.mjs
// First run: export POLLINATIONS_API_KEY=your_api_key

import { generateText, generateImage } from '@pollinations/sdk';

async function main() {
  // Generate text
  const poem = await generateText('write a short poem about robots');
  console.log('Generated poem:');
  console.log(poem);

  // Generate an image
  const image = await generateImage('a friendly robot waving hello');
  await image.saveToFile('robot.png');
  console.log('Image saved to robot.png!');
}

main();
```

Run it with:
```bash
export POLLINATIONS_API_KEY=your_api_key
node my-first-ai.mjs
```

### Browser Example

```html
<script type="module">
  import { configure, generateText, generateImage } from 'https://esm.sh/@pollinations/sdk';

  // Set your API key
  configure({ apiKey: 'your_api_key' });

  // Generate text
  const text = await generateText('write a haiku');

  // Generate image
  const image = await generateImage('a cute robot');

  // Display both — build nodes instead of interpolating into innerHTML
  // so model output cannot inject markup or script into the page.
  const p = document.createElement('p');
  p.textContent = text;
  const img = document.createElement('img');
  img.src = image.toDataURL();
  document.body.replaceChildren(p, img);
</script>
```

## API Key

An API key is required. Get one for free at **https://enter.pollinations.ai/keys**

```javascript
import { configure } from '@pollinations/sdk';

configure({ apiKey: 'your_api_key' });
```

Or set the environment variable:
```bash
export POLLINATIONS_API_KEY=your_api_key
```

### OAuth device flow (CLI / headless)

For CLI tools, scripts, or any environment without a browser redirect, use the OAuth device flow to let the user approve access without pasting a key:

```javascript
import { authorizeDevice, configure, userInfo } from '@pollinations/sdk';

const auth = await authorizeDevice();
console.log(`Open ${auth.verificationUri} and enter code: ${auth.userCode}`);

const accessToken = await auth.poll(); // blocks until user approves
configure({ apiKey: accessToken });

const me = await userInfo();
console.log(`Logged in as ${me.name} (${me.preferred_username})`);
```

`authorizeDevice()` does NOT require an API key — it's how you get one.

### React auth provider

`PolliProvider` handles login with OAuth + PKCE and saves the user's API key.
Use account hooks to fetch profile, balance or usage data.

```tsx
import {
  PolliProvider,
  useAccountProfile,
  useAuth,
} from '@pollinations/sdk/react';

function AccountStatus() {
  const { isLoggedIn, login, logout } = useAuth();
  const { data: profile } = useAccountProfile({ enabled: isLoggedIn });

  if (!isLoggedIn) {
    return <button onClick={() => login()}>Log in</button>;
  }

  return (
    <button onClick={logout}>
      Log out{profile?.name ? ` ${profile.name}` : ''}
    </button>
  );
}

export function App() {
  return (
    <PolliProvider appKey="pk_your_publishable_key" permissions={['profile']}>
      <AccountStatus />
    </PolliProvider>
  );
}
```

`useAccountProfile`, `useAccountBalance`, `useAccountKey`, and `useAccountKeyUsage`
return `{ data, isLoading, error, refresh }`.

#### Connection and errors

- Saved keys load without a network request. `isHydrated` means startup is done;
  `isLoggedIn` means a key is present, not that the server has validated it.
- Account hooks clear the connection on `401`. Other failures appear in the
  hook's `error`; call `refresh()` to try again.
- `useAuth().error` reports storage and login failures. You can call `login()`
  again after a failed attempt. A key that could not be saved works until reload.
- `logout()` clears the local connection without revoking the key. If deleting
  the saved key fails, `error` reports it and the key may return after a reload.

#### Server rendering and Next.js

The first render is signed out on both server and browser. After mounting,
the provider loads the saved key or completes the OAuth callback. Login restores
the original query string and hash. Storage defaults to `localStorage`; you can
pass `sessionStorage` or a custom synchronous `StorageAdapter`.

In Next.js, put the provider and components that use auth or account hooks
inside a `"use client"` component:

  ```tsx
  // app/providers.tsx
  "use client";
  import { PolliProvider } from "@pollinations/sdk/react";
  export function Providers({ children }: { children: React.ReactNode }) {
    return <PolliProvider appKey="pk_…">{children}</PolliProvider>;
  }

  // app/layout.tsx (server component)
  import { Providers } from "./providers";
  export default function RootLayout({ children }) {
    return <html><body><Providers>{children}</Providers></body></html>;
  }
  ```

### React generation hooks

`useImageGeneration`, `useTextGeneration`, `useAudioGeneration`,
`useVideoGeneration`, and `useTranscription` run one request with the signed-in
user's key and render nothing. Each returns `{ data, isLoading, error, run, rerun, cancel }`.
Nothing is sent until `run(...)`; calling `run` again cancels the request in
flight. A logout, a key change, or unmounting cancels it too, so a late response
never reaches the next user. `cancel()` keeps the last result.

Call `run` from an event handler, not during render.

```tsx
import { useMemo } from 'react';
import { useImageGeneration } from '@pollinations/sdk/react';

function ImageButton() {
  const { data, isLoading, error, run } = useImageGeneration();
  // Call URL.revokeObjectURL(src) when the result changes to free the blob.
  const src = useMemo(
    () => data && URL.createObjectURL(new Blob([data.buffer], { type: data.contentType })),
    [data],
  );
  return (
    <>
      <button disabled={isLoading} onClick={() => run('a red fox', { model: 'black-forest-labs/flux.1-schnell' })}>Generate</button>
      {error && <p>{error.message}</p>}
      {src && <img src={src} alt="" />}
    </>
  );
}
```

```tsx
import { useTextGeneration } from '@pollinations/sdk/react';

function Haiku() {
  const { data, isLoading, run } = useTextGeneration();
  return (
    <>
      <button disabled={isLoading} onClick={() => run('Write a haiku about rain', { model: 'openai/gpt-5.4-nano' })}>Write</button>
      <p>{data}</p>
    </>
  );
}
```

```tsx
import { useMemo } from 'react';
import { useAudioGeneration } from '@pollinations/sdk/react';

function Speak() {
  const { data, run } = useAudioGeneration();
  const src = useMemo(
    () => data && URL.createObjectURL(new Blob([data.buffer], { type: data.contentType })),
    [data],
  );
  return (
    <>
      <button onClick={() => run('Hello from Pollinations', { voice: 'nova' })}>Speak</button>
      {src && <audio src={src} controls />}
    </>
  );
}
```

```tsx
import { useMemo } from 'react';
import { useVideoGeneration } from '@pollinations/sdk/react';

function Clip() {
  const { data, run } = useVideoGeneration();
  const src = useMemo(
    () => data && URL.createObjectURL(new Blob([data.buffer], { type: data.contentType })),
    [data],
  );
  return (
    <>
      <button onClick={() => run('a paper boat drifting on a pond', { duration: 4 })}>Render</button>
      {src && <video src={src} controls />}
    </>
  );
}
```

```tsx
import { useTranscription } from '@pollinations/sdk/react';

function Transcribe() {
  const { data, isLoading, run } = useTranscription();
  return (
    <>
      <input type="file" accept="audio/*" disabled={isLoading} onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void run(file, { model: 'whisper-large-v3' });
      }} />
      <p>{data?.text}</p>
    </>
  );
}
```

### React chat transport (`useChat`)

`usePollinationsChatTransport` returns a transport for the Vercel AI SDK
`useChat`. It streams `/v1/responses` from the browser with the signed-in
user's key. Text arrives as text parts, server-run MCP tool calls arrive as tool
parts with their results, and `message.metadata.usage` holds the usage of the
reply. Assistant output is kept in `message.metadata.output` and sent back on
later turns, preserving server tool results. Stream failures become `error`
chunks. A rejected request makes the send
fail, which `useChat` reports as an error. Caller-run function tools are not
supported.

`ai` is an optional peer dependency; install it, and `@ai-sdk/react`, to use
`useChat`.

```tsx
import { useChat } from '@ai-sdk/react';
import { usePollinationsChatTransport } from '@pollinations/sdk/react';

function Chat() {
  const transport = usePollinationsChatTransport({ model: 'openai/gpt-5.4-nano' });
  const { messages, sendMessage, status } = useChat({ transport });
  return (
    <>
      {messages.map((m) => (
        <p key={m.id}>{m.role}: {m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}</p>
      ))}
      <button disabled={status !== 'ready'} onClick={() => sendMessage({ text: 'Hi' })}>Send</button>
    </>
  );
}
```

### Managing API keys

Programmatically create, list, and revoke keys for your account. Useful for BYOP ("bring your own pollen") flows, multi-tenant apps, and automation:

```javascript
import { listKeys, createKey, revokeKey } from '@pollinations/sdk';

// List all keys on the account
const keys = await listKeys();
keys.forEach(k => console.log(k.name, k.prefix, k.enabled));

// Create a scoped key (the raw value is only shown at creation)
const created = await createKey({
  name: 'my-bot',
  type: 'secret',
  pollenBudget: 1000,
  accountPermissions: ['usage'],
});
console.log('Save now — will not be shown again:', created.key);

// Revoke by id
await revokeKey(created.id);
```

Without `accountPermissions`, scoped keys can generate media but cannot read account state (balance, usage).

### Hosting static sites

Publish files at `https://<name>.pollinations.app`. Send every file inline, up to 5 MB per request; `index.html` is required. The key needs the `machines` account permission.

```javascript
import { deploySite, listSites, deleteSite } from '@pollinations/sdk';

const site = await deploySite('my-app', [
  { file: 'index.html', data: '<h1>Hello</h1><script src="app.js"></script>' },
  { file: 'app.js', data: 'console.log("hi")' },
  { file: 'logo.png', data: pngBase64, encoding: 'base64' },
]);
console.log(site.url); // https://my-app.pollinations.app

const { data } = await listSites();
await deleteSite('my-app');
```

For bigger sites, use `polli sites deploy ./dist --name my-app`.

## Image Generation

```javascript
import { generateImage, imageUrl } from '@pollinations/sdk';

// Generate and save
const image = await generateImage('a robot painting', {
  model: 'tongyi-mai/z-image-turbo',
  width: 1920,
  height: 1080,
});
await image.saveToFile('robot.png');

// Get as base64 or data URL
const base64 = image.toBase64();
const dataUrl = image.toDataURL();

// Just get the URL (no download)
const url = await imageUrl('a sunset');
```

### Options

Defaults are applied by the API; the SDK sends only options you provide.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'tongyi-mai/z-image-turbo'` | Model to use |
| `width` | number | `1024` | Width in pixels |
| `height` | number | `1024` | Height in pixels |
| `seed` | number | random | Reproducible results |
| `safe` | boolean | `false` | Safety filter |
| `quality` | string | `'medium'` | `'low'`, `'medium'`, `'high'`, `'hd'` |
| `referenceImage` | string | - | URL for image-to-image |
| `transparent` | boolean | `false` | Transparent background (PNG) |
| `guidanceScale` | number | - | Prompt strictness (1-20) |
| `reasoning` | boolean \| `'fast'` \| `'balanced'` \| `'pro'` | `'balanced'` | Reasoning mode for nanobanana models. Booleans are accepted for backward compatibility. |

## Image Editing

```javascript
import { editImage } from '@pollinations/sdk';

const result = await editImage('Make the sky purple', {
  image: 'https://example.com/photo.jpg',
  model: 'black-forest-labs/flux.1-schnell',
});
await result.saveToFile('edited.png');

// Multiple source images
const result2 = await editImage('Combine these two scenes', {
  image: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
});
```

## Image Generation (OpenAI-compatible)

The `imageGenerate` helper wraps `POST /v1/images/generations` — useful when you need OpenAI SDK parity (size string, `responseFormat`). It returns one image per call.

```javascript
import { imageGenerate } from '@pollinations/sdk';

// Single image with OpenAI-style size string
const img = await imageGenerate('A robot reading a book', {
  size: '1024x1024',
  model: 'black-forest-labs/flux.1-schnell',
});
await img.saveToFile('robot.png');
```

For the simpler GET-based endpoint, see `generateImage` above.

## Text Generation

```javascript
import { generateText, generateTextStream } from '@pollinations/sdk';

// Simple
const text = await generateText('write a poem about coding');

// With options
const story = await generateText('explain gravity', {
  model: 'openai/gpt-5.4-nano',
  systemPrompt: 'You are a physics teacher',
});

// Streaming
for await (const chunk of generateTextStream('tell me a story')) {
  process.stdout.write(chunk);
}

// Full response with metadata
const result = await generateText('hello', { raw: true });
console.log(result.text);
console.log(result.tokens);      // { input, output, total }
console.log(result.actualModel); // actual model used
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'openai/gpt-5.4-nano'` | Model to use |
| `systemPrompt` | string | - | System prompt |
| `temperature` | number | `1` | Creativity (0-2) |
| `maxTokens` | number | - | Max output tokens |
| `frequencyPenalty` | number | - | Reduce repetition (-2 to 2) |
| `presencePenalty` | number | - | Encourage new topics (-2 to 2) |
| `seed` | number | random | Reproducible results |
| `json` | boolean | `false` | JSON output mode |
| `private` | boolean | `false` | Keep generation private |
| `raw` | boolean | `false` | Return full response |

## Chat

```javascript
import { chat, chatStream } from '@pollinations/sdk';

// Single message
const response = await chat([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'What is 2+2?' }
]);
console.log(response.text);

// Streaming
for await (const chunk of chatStream([{ role: 'user', content: 'Write a poem' }])) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Video Generation

```javascript
import { generateVideo } from '@pollinations/sdk';

const video = await generateVideo('a timelapse of clouds', {
  model: 'google/veo-3.1-fast',
  duration: 6,
});
await video.saveToFile('clouds.mp4');

```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'google/veo-3.1-fast'` | `'google/veo-3.1-fast'`, `'bytedance/seedance-2.0'`, `'alibaba/wan-2.6'`, etc. |
| `duration` | number | - | Duration in seconds (supported range varies by model) |
| `aspectRatio` | string | - | e.g. `'16:9'`, `'9:16'`, `'1:1'` |
| `seed` | number | random | Reproducible results |
| `audio` | boolean | `false` | Include audio (`wan` always has audio) |
| `referenceImage` | string or string[] | - | Frame URL(s): first is the start frame, second is the optional end frame |
| `referenceImages` | string or string[] | - | Image URL(s) for visual guidance, separate from frame controls |
| `referenceVideos` | string or string[] | - | Video URL(s) for motion or style guidance |
| `referenceAudios` | string or string[] | - | Audio URL(s) for audio-driven generation |
| `safe` | boolean | `false` | Safety filter |

Reference media must use public HTTP(S) URLs. See `video_capabilities` in
[`/models`](https://gen.pollinations.ai/models) for model support. Whether frame
controls and guidance media can be combined depends on the selected model.

## 3D Generation

```javascript
import { Pollinations } from '@pollinations/sdk';
import { writeFile } from 'node:fs/promises';

const client = new Pollinations();
const model = await client.model3d('chair', {
  referenceImage: 'https://example.com/chair.png',
  resolution: 'low',
});
await writeFile('chair.glb', new Uint8Array(model.buffer));
```

The default model requires a public reference image and ignores the prompt.
Use `client.models('3d')` for available models and input requirements. Options
include `model`, `referenceImage` (one URL or an array), `resolution`, `seed`,
`safe`, and `signal`. The result contains `buffer`, `contentType` and a URL
without an API key. The server's MIME type is preserved for GLB and PLY files.
3D shares video's 20-minute timeout; override it with `videoTimeout` on the client.
Check each model's `paid_only` flag before using it with Quest Pollen.

## Async media jobs

Leave a slow generation running after disconnecting, then check and download it
with the same account. Supported by `imageAsync`, `videoAsync`, `audioAsync`,
and `model3dAsync` on the client.

```javascript
import { Pollinations } from '@pollinations/sdk';
import { writeFile } from 'node:fs/promises';

const client = new Pollinations(); // reads POLLINATIONS_API_KEY from the environment
const submitted = await client.videoAsync('a paper boat on a river', {
  model: 'google/veo-3.1-fast',
});
let file;
if ('result' in submitted) {
  file = submitted.result; // already cached; no job id needed
} else {
  let job;
  do {
    await new Promise(resolve => setTimeout(resolve, 5000));
    job = await client.job(submitted.id);
  } while (job.status === 'pending');
  if (job.status === 'failed') throw new Error(job.error?.message || 'Generation failed');
  file = await client.jobResult(submitted.id);
}
await writeFile('boat.mp4', new Uint8Array(file.buffer));
```

Submission returns a job id and 202 response immediately unless a cached file
is returned directly. Only accounts that submitted the job may poll or download
it; polling does not charge again. Status records last 24 hours after completion.
Pass an `AbortSignal` to cancel the HTTP request; this does not cancel a job
already running in the durable coordinator. The SDK authenticates with a
header and does not put the credential in a media URL.

## Audio (Text-to-Speech & Music)

```javascript
import { generateAudio } from '@pollinations/sdk';

// Text-to-speech
const speech = await generateAudio('Hello, welcome!', { voice: 'nova' });
await speech.saveToFile('welcome.mp3');

// Music generation
const music = await generateAudio('upbeat jazz piano', {
  model: 'elevenlabs/music-v2',
  duration: 30,
});
await music.saveToFile('jazz.mp3');

// Get as base64 or data URL
const base64 = speech.toBase64();
const dataUrl = speech.toDataURL();

// Play in browser
const audioEl = new Audio(speech.toDataURL());
audioEl.play();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `voice` | string | `'alloy'` | Voice to use (see voices below) |
| `model` | string | `'elevenlabs/eleven-v3'` | `'elevenlabs/eleven-v3'`, `'elevenlabs/music-v2'` |
| `duration` | number | - | Duration in seconds (for music models) |
| `seed` | number | random | Reproducible results |

### Available Voices

alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

### Speech with timestamps

```javascript
const client = new Pollinations();
const speech = await client.audioSpeechWithTimestamps('Hello world', {
  voice: 'nova',
  responseFormat: 'mp3',
});
console.log(speech.words);
const audio = new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);
```

`words` groups the normalized text on whitespace and reports each word's
`start` and `end` in seconds. Punctuation stays attached to the word.
`alignment` and `normalized_alignment` preserve the API's character timings.
When normalized timings are absent or null, `words` is empty; the audio is still returned.
Other options are `model`, `seed` and `signal`. Use models that advertise
`/v1/audio/speech/with-timestamps` in `client.models('audio')`.

## Vision (Image Input)

```javascript
import { chat } from '@pollinations/sdk';

const response = await chat([
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }
    ]
  }
]);
```

## Embeddings

Generate vector embeddings (OpenAI-compatible) for text or multimodal input:

```javascript
import { embeddings } from '@pollinations/sdk';

// Single text
const { data, usage } = await embeddings('Hello world');
console.log(data[0].embedding); // [0.012, -0.034, ...]

// Batch with options
const batch = await embeddings(['first document', 'second document'], {
  model: 'google/gemini-embedding-2',
  dimensions: 768,
});
console.log(batch.data.length, batch.usage.total_tokens);
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | string | Embedding model; uses the server default when omitted |
| `dimensions` | number | Output dimensions, 128-4096 (model-specific limits apply) |
| `encodingFormat` | string | `'float'` (default) or `'base64'` |
| `taskType` | string | Gemini task hint, e.g. `'RETRIEVAL_QUERY'` |
| `inputType` | string | Cohere retrieval role: `'query'` or `'document'` |

## Decisions

Send typed questions to `/alpha/decisions` using your Pollinations key:

```javascript
import { decision } from '@pollinations/sdk';

const response = await decision({
  state: "User ticket: I was charged twice for subscription this month.",
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this ticket?',
      criteria: { billing: 'Payment issues', technical: 'Product bugs' }
    }
  }
});

console.log(response.answers.department.choice);
```

See the [API reference](https://gen.pollinations.ai/docs) for `choice`, `score`, and `noul` question shapes. The API chooses its default decision model when `model` is omitted.

## List Available Models

```javascript
import { getModels } from '@pollinations/sdk';

const textModels = await getModels('text');
const imageModels = await getModels('image');
const videoModels = await getModels('video'); // also 'audio', 'embeddings'

console.log(textModels.map(m => m.name));
```

### Model status

```javascript
const client = new Pollinations();
const { data } = await client.modelStatus({ traffic: 'regular', minutes: 60 });
console.log(data.filter(row => row.is_rollup && row.errors_5xx > 0));
```

This returns the raw `/models/status` response with typed `data`, `meta`,
`rows` and optional `statistics`. Latency and throughput can be `null`.
`traffic` accepts `all` or `regular`; `minutes` is a rolling window from 1
to 10080. Both use server defaults when omitted. Pass `signal` to cancel.

## Media Upload

Uploads use multipart form data, accept up to 100MB of file bytes, and return a
public URL. Adding tags publishes the upload to those public tag galleries.

```javascript
import { upload } from '@pollinations/sdk';

const media = await upload(imageBuffer, {
  name: 'cat.png',
  contentType: 'image/png',
  tags: ['cats', 'gallery'],
});

console.log(media.url);
```

## Error Handling

```javascript
import { generateImage, PollinationsError } from '@pollinations/sdk';

try {
  const image = await generateImage('test');
} catch (err) {
  if (err instanceof PollinationsError) {
    console.error(err.message);    // Error message
    console.error(err.code);       // Error code (BAD_REQUEST, UNAUTHORIZED, INSUFFICIENT_BALANCE, etc.)
    console.error(err.status);     // HTTP status (400, 401, 402, 403, 500)
    console.error(err.requestId);  // Server request ID — include it in support reports
  }
}
```

Common error codes: `400` invalid params, `401` missing/invalid key, `402` insufficient balance, `403` permission denied, `500` server error.

## Advanced: Client Class

```javascript
import { Pollinations } from '@pollinations/sdk';

const client = new Pollinations({ apiKey: 'your_key' });

const imageResponse = await client.image('a sunset');
const text = await client.text('hello');
const chatResponse = await client.chat([{ role: 'user', content: 'hi' }]);
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  ImageGenerateOptions,
  TextGenerateOptions,
  ChatOptions,
  Message,
  ImageResponseExt,
  ChatResponseExt,
} from '@pollinations/sdk';
```

## API Reference

| Function | Description |
|----------|-------------|
| `generateImage(prompt, options?)` | Generate an image |
| `editImage(prompt, options?)` | Edit image with prompt |
| `imageUrl(prompt, options?)` | Get image URL |
| `generateText(prompt, options?)` | Generate text |
| `generateTextStream(prompt, options?)` | Stream text |
| `chat(messages, options?)` | Chat completion |
| `chatStream(messages, options?)` | Stream chat |
| `generateVideo(prompt, options?)` | Generate a video |
| `videoUrl(prompt, options?)` | Get video URL |
| `generateAudio(text, options?)` | Text-to-speech / music |
| `transcribe(audio, options?)` | Speech-to-text |
| `embeddings(input, options?)` | Vector embeddings |
| `upload(data, options?)` | Upload media, optionally publishing it with `tags` |
| `getModels(kind?)` | List all models, or one kind: `text`, `image`, `video`, `audio`, `embeddings` |
| `configure({ apiKey })` | Set global config |

## Troubleshooting

### "saveToFile is only available in Node.js"

If you're in a browser, use `toDataURL()` or `toBase64()` instead:

```javascript
const image = await generateImage('a cat');
const dataUrl = image.toDataURL();  // Use this for <img src="">
const base64 = image.toBase64();    // Raw base64 string
```

### Request Timeout

Default timeouts: text/chat 5min, images 10min, videos 20min. For custom timeouts:

```javascript
import { Pollinations } from '@pollinations/sdk';

const client = new Pollinations({
  timeout: 600000,       // 10 minutes for all requests
  textTimeout: 300000,   // 5 minutes for text
  imageTimeout: 600000,  // 10 minutes for images
  videoTimeout: 1200000, // 20 minutes for videos
});
```

### Rate Limiting

Publishable keys (`pk_`) have rate limits. Use a secret key (`sk_`) for unlimited requests.

### Network Errors

The SDK returns network and API errors directly and does not retry requests
automatically. A timed-out generation may still complete and incur usage.
Callers can inspect `PollinationsError.retryAfter` when deciding how to handle
rate limits.

## Links

- [Pollinations.AI](https://pollinations.ai)
- [API Documentation](https://gen.pollinations.ai/docs) - Full API reference
- [Get API Key](https://enter.pollinations.ai/keys)
- [Discord](https://discord.gg/k9F7SyTgqn)
- [GitHub](https://github.com/pollinations/pollinations)

## License

MIT

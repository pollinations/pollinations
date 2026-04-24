# @pollinations_ai/sdk

Official SDK for [pollinations.ai](https://pollinations.ai) - Generate images, text, audio, and video with one simple package.

[![npm version](https://img.shields.io/npm/v/@pollinations_ai/sdk.svg)](https://www.npmjs.com/package/@pollinations_ai/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @pollinations_ai/sdk
```

## Quick Start

First, get your API key at **https://enter.pollinations.ai** and set it:

```bash
export POLLINATIONS_API_KEY=your_api_key
```

Then:

```javascript
import { generateImage, generateText } from '@pollinations_ai/sdk';

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

import { generateText, generateImage } from '@pollinations_ai/sdk';

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
  import { configure, generateText, generateImage } from 'https://esm.sh/@pollinations_ai/sdk';

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

An API key is required. Get one for free at **https://enter.pollinations.ai**

```javascript
import { configure } from '@pollinations_ai/sdk';

configure({ apiKey: 'your_api_key' });
```

Or set the environment variable:
```bash
export POLLINATIONS_API_KEY=your_api_key
```

### OAuth device flow (CLI / headless)

For CLI tools, scripts, or any environment without a browser redirect, use the OAuth device flow to let the user approve access without pasting a key:

```javascript
import { authorizeDevice, configure, userInfo } from '@pollinations_ai/sdk';

const auth = await authorizeDevice();
console.log(`Open ${auth.verificationUri} and enter code: ${auth.userCode}`);

const accessToken = await auth.poll(); // blocks until user approves
configure({ apiKey: accessToken });

const me = await userInfo();
console.log(`Logged in as ${me.name} (${me.tier})`);
```

`authorizeDevice()` does NOT require an API key — it's how you get one.

### Managing API keys

Programmatically create, list, and revoke keys for your account. Useful for BYOP ("bring your own pollen") flows, multi-tenant apps, and automation:

```javascript
import { listKeys, createKey, revokeKey } from '@pollinations_ai/sdk';

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

## Image Generation

```javascript
import { generateImage, imageUrl } from '@pollinations_ai/sdk';

// Generate and save
const image = await generateImage('a robot painting', {
  model: 'zimage',
  width: 1920,
  height: 1080,
});
await image.saveToFile('robot.png');

// Get as base64 or data URL
const base64 = image.toBase64();
const dataUrl = image.toDataURL();

// Generate multiple images
const images = await generateImage('abstract art', { n: 4 });
images.forEach((img, i) => img.saveToFile(`art-${i}.png`));

// Just get the URL (no download)
const url = await imageUrl('a sunset');
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'zimage'` | Model to use |
| `width` | number | `1024` | Width in pixels |
| `height` | number | `1024` | Height in pixels |
| `seed` | number | random | Reproducible results |
| `enhance` | boolean | `false` | AI prompt enhancement |
| `negativePrompt` | string | - | What to avoid in the image |
| `nologo` | boolean | `false` | Remove watermark |
| `private` | boolean | `false` | Keep generation private |
| `safe` | boolean | `false` | Safety filter |
| `quality` | string | `'medium'` | `'low'`, `'medium'`, `'high'`, `'hd'` |
| `referenceImage` | string | - | URL for image-to-image |
| `transparent` | boolean | `false` | Transparent background (PNG) |
| `guidanceScale` | number | - | Prompt strictness (1-20) |
| `reasoning` | boolean \| `'fast'` \| `'balanced'` \| `'pro'` | `'balanced'` | Reasoning mode for nanobanana models. Booleans are accepted for backward compatibility. |
| `n` | number | `1` | Number of images |

## Image Editing

```javascript
import { editImage } from '@pollinations_ai/sdk';

const result = await editImage('Make the sky purple', {
  image: 'https://example.com/photo.jpg',
  model: 'flux',
});
await result.saveToFile('edited.png');

// Multiple source images
const result2 = await editImage('Combine these two scenes', {
  image: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
});
```

## Image Generation (OpenAI-compatible)

The `imageGenerate` helper wraps `POST /v1/images/generations` — useful when you need OpenAI SDK parity (size string, `n`, `response_format`) or want multiple images from a single call.

```javascript
import { imageGenerate } from '@pollinations_ai/sdk';

// Single image with OpenAI-style size string
const img = await imageGenerate('A robot reading a book', {
  size: '1024x1024',
  model: 'flux',
});
await img.saveToFile('robot.png');

// Multiple images in one request
const imgs = await imageGenerate('A robot reading a book', { n: 3 });
imgs.forEach((img, i) => img.saveToFile(`robot-${i}.png`));
```

For the simpler GET-based endpoint, see `generateImage` above.

## Text Generation

```javascript
import { generateText, generateTextStream } from '@pollinations_ai/sdk';

// Simple
const text = await generateText('write a poem about coding');

// With options
const story = await generateText('explain gravity', {
  model: 'openai',
  systemPrompt: 'You are a physics teacher',
});

// Multiple responses
const facts = await generateText('give me a random fact', { n: 3 });

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
| `model` | string | `'openai'` | Model to use |
| `systemPrompt` | string | - | System prompt |
| `temperature` | number | `1` | Creativity (0-2) |
| `maxTokens` | number | - | Max output tokens |
| `frequencyPenalty` | number | - | Reduce repetition (-2 to 2) |
| `presencePenalty` | number | - | Encourage new topics (-2 to 2) |
| `seed` | number | random | Reproducible results |
| `json` | boolean | `false` | JSON output mode |
| `private` | boolean | `false` | Keep generation private |
| `n` | number | `1` | Number of responses |
| `raw` | boolean | `false` | Return full response |

## Chat

```javascript
import { chat, chatStream, conversation } from '@pollinations_ai/sdk';

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

// Conversation (auto-manages history)
const convo = conversation({ model: 'openai' });
convo.system('You are a pirate');

const r1 = await convo.say('Hello!');        // "Ahoy, matey!"
const r2 = await convo.say('Where are we?'); // Remembers context

console.log(convo.getHistory()); // Full message history
convo.clear(); // Reset conversation
```

## Video Generation

```javascript
import { generateVideo } from '@pollinations_ai/sdk';

const video = await generateVideo('a timelapse of clouds', {
  model: 'veo',
  duration: 6,
});
await video.saveToFile('clouds.mp4');

// Multiple videos
const videos = await generateVideo('ocean waves', { n: 2, duration: 4 });
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'veo'` | `'veo'`, `'seedance'`, `'wan'`, `'ltx-2'`, etc. |
| `duration` | number | - | Duration in seconds (1-30, varies by model) |
| `aspectRatio` | string | - | e.g. `'16:9'`, `'9:16'`, `'1:1'` |
| `seed` | number | random | Reproducible results |
| `audio` | boolean | `false` | Include audio (`wan` always has audio) |
| `referenceImage` | string | - | URL for image-to-video |
| `private` | boolean | `false` | Keep generation private |
| `nologo` | boolean | `false` | Remove watermark |
| `safe` | boolean | `false` | Safety filter |
| `n` | number | `1` | Number of videos |

## Audio (Text-to-Speech & Music)

```javascript
import { generateAudio } from '@pollinations_ai/sdk';

// Text-to-speech
const speech = await generateAudio('Hello, welcome!', { voice: 'nova' });
await speech.saveToFile('welcome.mp3');

// Music generation
const music = await generateAudio('upbeat jazz piano', {
  model: 'elevenmusic',
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
| `model` | string | `'elevenlabs'` | `'elevenlabs'`, `'elevenmusic'`, `'acestep'` |
| `duration` | number | - | Duration in seconds (for music models) |
| `seed` | number | random | Reproducible results |
| `n` | number | `1` | Number of outputs |

### Available Voices

alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

## Vision (Image Input)

```javascript
import { chat } from '@pollinations_ai/sdk';

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

## List Available Models

```javascript
import { getTextModels, getImageModels } from '@pollinations_ai/sdk';

const textModels = await getTextModels();
const imageModels = await getImageModels();

console.log(textModels.map(m => m.name));
```

## Error Handling

```javascript
import { generateImage, PollinationsError } from '@pollinations_ai/sdk';

try {
  const image = await generateImage('test');
} catch (err) {
  if (err instanceof PollinationsError) {
    console.error(err.message);  // Error message
    console.error(err.code);     // Error code (BAD_REQUEST, UNAUTHORIZED, INSUFFICIENT_BALANCE, etc.)
    console.error(err.status);   // HTTP status (400, 401, 402, 403, 500)
  }
}
```

Common error codes: `400` invalid params, `401` missing/invalid key, `402` insufficient balance, `403` permission denied, `500` server error.

## Advanced: Client Class

```javascript
import { Pollinations } from '@pollinations_ai/sdk';

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
} from '@pollinations_ai/sdk';
```

## API Reference

| Function | Description |
|----------|-------------|
| `generateImage(prompt, options?)` | Generate image(s) |
| `editImage(prompt, options?)` | Edit image with prompt |
| `imageUrl(prompt, options?)` | Get image URL |
| `generateText(prompt, options?)` | Generate text |
| `generateTextStream(prompt, options?)` | Stream text |
| `chat(messages, options?)` | Chat completion |
| `chatStream(messages, options?)` | Stream chat |
| `conversation(options?)` | Create conversation |
| `generateVideo(prompt, options?)` | Generate video(s) |
| `videoUrl(prompt, options?)` | Get video URL |
| `generateAudio(text, options?)` | Text-to-speech / music |
| `transcribe(audio, options?)` | Speech-to-text |
| `upload(data, options?)` | Upload media |
| `getTextModels()` | List text models |
| `getImageModels()` | List image models |
| `getModels()` | List all models |
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

Default timeouts: text/chat 5min, images 10min, videos 10min. For custom timeouts:

```javascript
import { Pollinations } from '@pollinations_ai/sdk';

const client = new Pollinations({
  timeout: 600000,       // 10 minutes for all requests
  textTimeout: 300000,   // 5 minutes for text
  imageTimeout: 600000,  // 10 minutes for images
  videoTimeout: 900000,  // 15 minutes for videos
});
```

### Rate Limiting

Publishable keys (`pk_`) have rate limits. Use a secret key (`sk_`) for unlimited requests.

### Network Errors

The SDK automatically retries failed requests up to 3 times. To customize:

```javascript
import { Pollinations } from '@pollinations_ai/sdk';

const client = new Pollinations({
  maxRetries: 5,  // Retry up to 5 times
});
```

## Links

- [Pollinations.AI](https://pollinations.ai)
- [API Documentation](https://enter.pollinations.ai/api/docs) - Full API reference
- [Get API Key](https://enter.pollinations.ai)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)
- [GitHub](https://github.com/pollinations/pollinations)

## License

MIT

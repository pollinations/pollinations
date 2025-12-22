# @pollinations/sdk

Official SDK for [Pollinations.AI](https://pollinations.ai) - Generate images, text, audio, and video with one simple package.

[![npm version](https://img.shields.io/npm/v/@pollinations/sdk.svg)](https://www.npmjs.com/package/@pollinations/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @pollinations/sdk
```

## Quick Start

First, get your API key at **https://enter.pollinations.ai** and set it:

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

  // Display both
  document.body.innerHTML = `
    <p>${text}</p>
    <img src="${image.toDataURL()}">
  `;
</script>
```

## API Key

An API key is required. Get one for free at **https://enter.pollinations.ai**

```javascript
import { configure } from '@pollinations/sdk';

configure({ apiKey: 'your_api_key' });
```

Or set the environment variable:
```bash
export POLLINATIONS_API_KEY=your_api_key
```

## Image Generation

```javascript
import { generateImage, imageUrl } from '@pollinations/sdk';

// Generate and save
const image = await generateImage('a robot painting', {
  model: 'flux',
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
| `model` | string | `'flux'` | Model to use |
| `width` | number | `1024` | Width in pixels |
| `height` | number | `1024` | Height in pixels |
| `seed` | number | random | Reproducible results |
| `enhance` | boolean | `false` | AI prompt enhancement |
| `negativePrompt` | string | - | What to avoid in the image |
| `nologo` | boolean | `false` | Remove watermark |
| `nofeed` | boolean | `false` | Don't show in public feed |
| `private` | boolean | `false` | Keep generation private |
| `safe` | boolean | `false` | Safety filter |
| `quality` | string | `'medium'` | `'low'`, `'medium'`, `'high'`, `'hd'` |
| `referenceImage` | string | - | URL for image-to-image |
| `transparent` | boolean | `false` | Transparent background (PNG) |
| `guidanceScale` | number | - | Prompt strictness (1-20) |
| `n` | number | `1` | Number of images |

## Text Generation

```javascript
import { generateText, generateTextStream } from '@pollinations/sdk';

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
import { chat, chatStream, conversation } from '@pollinations/sdk';

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
import { generateVideo } from '@pollinations/sdk';

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
| `model` | string | `'veo'` | `'veo'` or `'seedance'` |
| `duration` | number | - | veo: 4, 6, or 8 sec / seedance: 2-10 sec |
| `aspectRatio` | string | - | e.g. `'16:9'`, `'9:16'`, `'1:1'` |
| `seed` | number | random | Reproducible results |
| `audio` | boolean | `false` | Include audio (veo only) |
| `referenceImage` | string | - | URL for image-to-video |
| `private` | boolean | `false` | Keep generation private |
| `nologo` | boolean | `false` | Remove watermark |
| `safe` | boolean | `false` | Safety filter |
| `n` | number | `1` | Number of videos |

## Audio (Text-to-Speech)

```javascript
import { generateAudio } from '@pollinations/sdk';
import { writeFileSync } from 'fs';

const audio = await generateAudio('Hello, welcome!', {
  voice: 'nova',
});

// Save to file (Node.js)
writeFileSync('welcome.mp3', Buffer.from(audio.data, 'base64'));

// Play in browser
const audioEl = new Audio(`data:audio/mp3;base64,${audio.data}`);
audioEl.play();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `voice` | string | `'alloy'` | Voice to use |
| `model` | string | `'openai-audio'` | Model to use |
| `format` | string | `'mp3'` | `'mp3'`, `'wav'`, `'flac'`, `'opus'`, `'pcm16'` |
| `seed` | number | random | Reproducible results |
| `n` | number | `1` | Number of outputs |

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

## List Available Models

```javascript
import { getTextModels, getImageModels } from '@pollinations/sdk';

const textModels = await getTextModels();
const imageModels = await getImageModels();

console.log(textModels.map(m => m.name));
```

## Error Handling

```javascript
import { generateImage, PollinationsError } from '@pollinations/sdk';

try {
  const image = await generateImage('test');
} catch (err) {
  if (err instanceof PollinationsError) {
    console.error(err.message);  // Error message
    console.error(err.code);     // Error code
    console.error(err.status);   // HTTP status
  }
}
```

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
| `generateImage(prompt, options?)` | Generate image(s) |
| `imageUrl(prompt, options?)` | Get image URL |
| `generateText(prompt, options?)` | Generate text |
| `generateTextStream(prompt, options?)` | Stream text |
| `chat(messages, options?)` | Chat completion |
| `chatStream(messages, options?)` | Stream chat |
| `conversation(options?)` | Create conversation |
| `generateVideo(prompt, options?)` | Generate video(s) |
| `videoUrl(prompt, options?)` | Get video URL |
| `generateAudio(text, options?)` | Text to speech |
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
import { Pollinations } from '@pollinations/sdk';

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
import { Pollinations } from '@pollinations/sdk';

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

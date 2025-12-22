# @pollinations/sdk

Official SDK for [Pollinations.AI](https://pollinations.ai) - Generate images, text, audio, and video with one simple package.

[![npm version](https://img.shields.io/npm/v/@pollinations/sdk.svg)](https://www.npmjs.com/package/@pollinations/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @pollinations/sdk
```

### Browser (CDN)

```html
<script src="https://cdn.pollinations.ai/sdk.js"></script>
```

## Quick Start

```javascript
import { generateImage, generateText } from '@pollinations/sdk';

// Generate an image
const image = await generateImage('a futuristic cityscape');
await image.saveToFile('cityscape.png');

// Generate text
const text = await generateText('explain quantum computing in simple terms');
console.log(text);
```

### Browser Example

```html
<script src="https://cdn.pollinations.ai/sdk.js"></script>
<script>
  // Generate text
  Pollinations.generateText('write a haiku').then(text => {
    document.body.innerText = text;
  });

  // Generate image
  Pollinations.generateImage('a cute robot').then(image => {
    document.body.innerHTML = `<img src="${image.toDataURL()}">`;
  });
</script>
```

## API Key (Optional)

Most features work without an API key. For higher rate limits, get a key at **https://enter.pollinations.ai**

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
| `nologo` | boolean | `false` | Remove watermark |
| `safe` | boolean | `false` | Safety filter |
| `n` | number | `1` | Number of images |

## Text Generation

```javascript
import { generateText, generateTextStream } from '@pollinations/sdk';

// Simple
const text = await generateText('write a poem about coding');

// With options
const response = await generateText('explain gravity', {
  model: 'openai',
  systemPrompt: 'You are a physics teacher',
});

// Multiple responses
const texts = await generateText('give me a random fact', { n: 3 });

// Streaming
for await (const chunk of generateTextStream('tell me a story')) {
  process.stdout.write(chunk);
}

// Full response with metadata
const response = await generateText('hello', { raw: true });
console.log(response.text);
console.log(response.tokens);      // { input, output, total }
console.log(response.actualModel); // actual model used
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'openai'` | Model to use |
| `systemPrompt` | string | - | System prompt |
| `temperature` | number | `1` | Creativity (0-2) |
| `maxTokens` | number | - | Max output tokens |
| `seed` | number | random | Reproducible results |
| `json` | boolean | `false` | JSON output mode |
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
| `model` | string | `'veo'` | Model to use |
| `duration` | number | - | Seconds (veo: 4,6,8) |
| `aspectRatio` | string | - | e.g. `'16:9'` |
| `audio` | boolean | `false` | Include audio |
| `n` | number | `1` | Number of videos |

## Audio (Text-to-Speech)

```javascript
import { generateAudio } from '@pollinations/sdk';

const audio = await generateAudio('Hello, welcome!', {
  voice: 'nova',
});

// Save to file (Node.js)
const fs = require('fs');
fs.writeFileSync('welcome.mp3', Buffer.from(audio.data, 'base64'));

// Play in browser
const audioEl = new Audio(`data:audio/mp3;base64,${audio.data}`);
audioEl.play();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `voice` | string | `'alloy'` | Voice to use |
| `format` | string | `'mp3'` | Output format |
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
| `configure({ apiKey })` | Set global config |

## Links

- [Pollinations.AI](https://pollinations.ai)
- [Get API Key](https://enter.pollinations.ai)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)
- [GitHub](https://github.com/pollinations/pollinations)

## License

MIT

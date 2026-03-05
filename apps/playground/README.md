# Pollinations Provider for Vercel AI SDK

[![npm version](https://img.shields.io/npm/v/ai-sdk-pollinations.svg?style=flat-square)](https://www.npmjs.com/package/ai-sdk-pollinations)
[![npm downloads](https://img.shields.io/npm/dm/ai-sdk-pollinations.svg?style=flat-square)](https://www.npmjs.com/package/ai-sdk-pollinations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Built with Pollinations](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=flat-square&logo=data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%20viewBox%3D%220%200%20124%20124%22%3E%3Ccircle%20cx%3D%2262%22%20cy%3D%2262%22%20r%3D%2262%22%20fill%3D%22%23ffffff%22/%3E%3C/svg%3E&logoColor=white&labelColor=6a0dad)](https://pollinations.ai)

<div align="center">

**[🚀 Try Live Example →](https://ai-sdk-pollinations-example.vercel.app/)**

</div>

<div align="center">
  <a href="https://github.com/artsiombarouski/ai-sdk-pollinations/issues/new">🐛 Report Bug</a>
  •
  <a href="https://github.com/artsiombarouski/ai-sdk-pollinations/issues/new">✨ Request Feature</a>
  •
  <a href="https://github.com/artsiombarouski/ai-sdk-pollinations/discussions">💬 Discussions</a>
  •
  <a href="https://github.com/artsiombarouski/ai-sdk-pollinations">⭐ Star on GitHub</a>
</div>

<div align="center">
  <a href="https://pollinations.ai">
    <img src="https://raw.githubusercontent.com/pollinations/pollinations/main/assets/logo-text.svg" alt="Pollinations" height="80" />
  </a>
  <br />
  <span style="font-size: 2em; margin: 0 20px;">×</span>
  <br />
  <a href="https://sdk.vercel.ai">
    <img src="https://raw.githubusercontent.com/artsiombarouski/ai-sdk-pollinations/main/assets/ai-sdk-logo.svg" alt="AI SDK" height="40" />
  </a>
</div>

<br />

The Pollinations provider for [Vercel AI SDK](https://sdk.vercel.ai/) enables you to use [Pollinations](https://pollinations.ai/) AI models (text, image, and speech generation) with the Vercel AI SDK's unified API. This provider supports Pollinations language models for text generation, image models for image generation, and speech models for audio/speech generation.

## Why

This provider brings Pollinations AI capabilities to your projects through the [Vercel AI SDK](https://sdk.vercel.ai/), enabling you to use Pollinations models with the same unified, type-safe API you're already familiar with. Whether you're generating text with `generateText()`, creating images with `generateImage()`, generating speech with `generateSpeech()`, streaming responses with `streamText()`, or leveraging advanced features like tool calling and structured outputs, this provider integrates seamlessly into the AI SDK ecosystem. This dedicated provider was developed for several important reasons:

- **Not 100% OpenAI Compatible**: Pollinations API features, parameters, and behaviors are model-dependent and don't perfectly align with OpenAI's API. This provider is specifically designed to handle Pollinations-specific functionality without trying to force it into an OpenAI-compatible mold.

- **Better Error Handling**: The provider includes comprehensive error handling tailored to Pollinations API responses, providing more meaningful error messages and proper error types that help with debugging and user experience.

- **Future-Proof**: As Pollinations evolves and adds new features, this provider can be updated to support them more easily. A dedicated provider allows for quicker integration of Pollinations-specific updates without waiting for OpenAI provider compatibility.

- **Better Corner Cases and Model Handling**: Different Pollinations models (image, video, text, speech) have model-dependent requirements and capabilities. This provider properly handles these differences, validates parameters per model type, and provides appropriate warnings for unsupported feature combinations.

- **Different SDK + API Architecture**: Pollinations image generation API uses GET requests (see [Pollinations API docs](https://enter.pollinations.ai/api/docs#tag/genpollinationsai/GET/image/{prompt})), while OpenAI and OpenAI-compatible providers use POST requests for image generation (see [OpenAI provider](https://github.com/vercel/ai/blob/main/packages/openai/src/image/openai-image-model.ts#L151) and [OpenAI-compatible provider](https://github.com/vercel/ai/blob/main/packages/openai-compatible/src/image/openai-compatible-image-model.ts#L118)). This fundamental difference in API design requires a dedicated SDK provider implementation that properly handles GET-based image generation requests, query parameters, and response processing differently than POST-based implementations.

## Setup

The Pollinations provider is available in the `ai-sdk-pollinations` module. You can install it with

```bash
pnpm add ai-sdk-pollinations
```

```bash
npm install ai-sdk-pollinations
```

```bash
yarn add ai-sdk-pollinations
```

```bash
bun add ai-sdk-pollinations
```

## Provider Instance

You can import and create a provider instance using `createPollinations`:

```ts
import { createPollinations } from 'ai-sdk-pollinations';

const pollinations = createPollinations({
  // optional settings
});
```

You can use the following optional settings to customize the Pollinations provider instance:

| Parameter | Type | Description |
|-----------|------|-------------|
| **baseURL** | `string` | Base URL for text generation API calls. Defaults to `https://text.pollinations.ai/openai` when no API key is provided, or `https://gen.pollinations.ai/v1` when an API key is provided. |
| **apiKey** | `string` | API key for authenticating requests. **Required for new unified API endpoints** (default), optional only when using legacy endpoints (`useLegacyUrls: true`). The API key will be automatically loaded from the `POLLINATIONS_API_KEY` environment variable if not provided. Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai). |
| **imageURL** | `string` | Base URL for image generation API calls. Defaults to `https://gen.pollinations.ai/image` when using new unified API (default), or `https://image.pollinations.ai/prompt` when using legacy URLs (`useLegacyUrls: true`). |
| **referrer** | `string` | Referrer identifier for analytics (optional). |
| **name** | `string` | Provider name. Defaults to `pollinations`. You can change this when using Pollinations-compatible providers. |
| **headers** | `Record<string,string>` | Custom headers to include in the requests. |
| **fetch** | `FetchFunction` | Custom fetch implementation. Useful for proxying requests, adding custom headers, or integrating with frameworks like Next.js that provide their own fetch implementation. |
| **useLegacyUrls** | `boolean` | Whether to use legacy Pollinations API URLs. When `false` (default), uses the new unified API endpoints which require an API key. When `true`, uses legacy endpoints where API key is optional. Default: `false`. |

> **Note:** The API key will be automatically loaded from the `POLLINATIONS_API_KEY` environment variable if not explicitly provided in the options. This makes it easy to use environment variables for configuration.

## Language Models

The Pollinations provider instance is a function that you can invoke to create a language model:

```ts
const model = pollinations('openai');
```

### Example

You can use Pollinations language models to generate text with the `generateText` function:

```ts
import { createPollinations } from 'ai-sdk-pollinations';
import { generateText } from 'ai';

const pollinations = createPollinations({
  apiKey: 'your-api-key', // required for new API, optional for legacy
  // API key will be automatically loaded from POLLINATIONS_API_KEY env var if not provided
});

const { text } = await generateText({
  model: pollinations('openai'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

Pollinations language models can also be used in the `streamText`, `generateObject`, and `streamObject` functions (see [AI SDK Core](/docs/ai-sdk-core)).

### Available Text Models

Pollinations supports multiple text generation models. The default model is `openai`. 

**To see all available text models, visit:**
- [https://gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models) - List of all available text models
- [Pollinations Documentation](https://pollinations.ai) - Official documentation

You can use any available model:

```ts
const model = pollinations('gemini'); // or 'claude', 'mistral', etc.
```

> **Note:** The available models may vary based on your API key permissions.

> **Note:** Parameters like `temperature`, `maxOutputTokens`, `topP`, and `seed` are available via call options (e.g., `generateText({ model, temperature: 0.7, seed: 42 })`), not when creating the model. See [Standard Call Options](#standard-call-options) for details.

### Standard Call Options

Pollinations language models support all standard [LanguageModelV3CallOptions](/docs/ai-sdk-core/settings):

| Option | Type | Description |
|--------|------|-------------|
| `temperature` | `number` | Temperature for text generation |
| `maxOutputTokens` | `number` | Maximum number of tokens to generate |
| `topP` | `number` | Nucleus sampling |
| `seed` | `number` | Seed for reproducible generation (uses `-1` for true randomness by default) |
| `stopSequences` | `string[]` | Stop sequences |
| `frequencyPenalty` | `number` | Frequency penalty (-2.0 to 2.0) |
| `presencePenalty` | `number` | Presence penalty (-2.0 to 2.0) |
| `responseFormat` | `object` | Response format (text or JSON with schema support) |
| `tools` | `object` | Tool calling support |
| `toolChoice` | `object` | Tool choice configuration |
| `abortSignal` | `AbortSignal` | Abort signal for cancelling requests |
| `headers` | `Record<string,string>` | Additional HTTP headers |

### Provider Options

Pollinations-specific parameters can be passed via `providerOptions.pollinations`:

```ts
import { generateText } from 'ai';
import type { PollinationsLanguageModelSettings } from 'ai-sdk-pollinations';

const result = await generateText({
  model: pollinations('openai'),
  prompt: 'Generate text with advanced options',
  providerOptions: {
    pollinations: {
      logprobs: true,
      top_logprobs: 5,
      parallel_tool_calls: true,
      user: 'user-123',
      modalities: ['text', 'audio'],
      audio: { voice: 'alloy', format: 'mp3' },
      repetition_penalty: 1.1,
      logit_bias: { 'token-id': 100 },
      stream_options: { include_usage: true },
      thinking: { type: 'enabled', budget_tokens: 1000 },
      reasoning_effort: 'high',
      thinking_budget: 5000,
    } satisfies PollinationsLanguageModelSettings,
  },
});
```

The following provider options are available:

| Parameter | Type | Description |
|-----------|------|-------------|
| **logprobs** | `boolean \| null` | Whether to return log probabilities of the output tokens. Default: false. |
| **top_logprobs** | `integer \| null` | Number of most likely tokens to return at each token position (0-20). |
| **parallel_tool_calls** | `boolean` | Whether to enable parallel tool calls. Default: true. |
| **user** | `string` | A unique identifier representing your end-user, which can help Pollinations to monitor and detect abuse. |
| **modalities** | `Array<'text' \| 'audio'>` | Specify output modalities (text and/or audio). |
| **audio** | `{ voice: string, format: string } \| null` | Audio output configuration when using audio modality. Voice options: `'alloy'`, `'echo'`, `'fable'`, `'onyx'`, `'shimmer'`, `'coral'`, `'verse'`, `'ballad'`, `'ash'`, `'sage'`, `'amuch'`, `'dan'`. Format options: `'wav'`, `'mp3'`, `'flac'`, `'opus'`, `'pcm16'`. |
| **repetition_penalty** | `number \| null` | Alternative to frequency_penalty for some models. Range: 0 to 2. |
| **logit_bias** | `Record<string, number> \| null` | Modify the likelihood of specified tokens appearing in the completion. |
| **stream_options** | `{ include_usage?: boolean } \| null` | Options for streaming responses. |
| **thinking** | `{ type?: 'enabled' \| 'disabled', budget_tokens?: number } \| null` | Enable thinking tokens for reasoning models. Default type: 'disabled'. |
| **reasoning_effort** | `'none' \| 'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` | Control reasoning effort for reasoning-capable models. |
| **thinking_budget** | `integer` | Budget for thinking tokens (alternative to thinking.budget_tokens). Range: 0 to 9007199254740991. |

### Structured Outputs

Pollinations supports structured outputs with JSON schema. You can use `generateObject` or pass a schema to `generateText`:

```ts
import { generateObject } from 'ai';
import { z } from 'zod';

const result = await generateObject({
  model: pollinations('openai'),
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.string(),
        }),
      ),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a lasagna recipe.',
});
```

Or with `generateText`:

```ts
import { Output } from 'ai';

const result = await generateText({
  model: pollinations('openai'),
  prompt: 'How do I make a pizza?',
  output: Output.object({
    schema: z.object({
      ingredients: z.array(z.string()),
      steps: z.array(z.string()),
    }),
  }),
});
```

### Tool Calling

Pollinations supports tool calling (function calling). Define tools and let the model decide when to call them:

```ts
import { tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Get the current weather for a location',
  parameters: z.object({
    location: z.string().describe('The city and state'),
  }),
  execute: async ({ location }) => {
    // Your implementation
    return { temperature: 72, condition: 'sunny' };
  },
});

const result = await generateText({
  model: pollinations('openai'),
  prompt: 'What is the weather in San Francisco?',
  tools: {
    getWeather: weatherTool,
  },
});
```

### Streaming

Pollinations supports streaming responses:

```ts
import { streamText } from 'ai';

const result = streamText({
  model: pollinations('openai'),
  prompt: 'Write a story about a robot.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Image Inputs (Vision)

Pollinations supports image inputs for vision models. You can pass images as part of the message content:

```ts
import { readFileSync } from 'fs';

const result = await generateText({
  model: pollinations('openai'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Please describe the image.',
        },
        {
          type: 'image',
          image: readFileSync('./data/image.png'),
        },
      ],
    },
  ],
});
```

You can also pass image URLs:

```ts
{
  type: 'image',
  image: 'https://example.com/image.png',
}
```

## Speech Models

You can create models that call the Pollinations speech/audio generation API using the `.speechModel()` factory method:

```ts
const model = pollinations.speechModel('openai-audio');
```

### Example

You can use Pollinations speech models to generate audio from text with the `generateSpeech` function:

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: pollinations.speechModel('openai-audio'),
  text: 'Hello! This is a test of text-to-speech generation.',
  voice: 'alloy',
  outputFormat: 'mp3',
  instructions: 'You are a professional narrator. Read the text clearly and naturally.',
});
```

### Available Speech Models

Pollinations currently supports the following speech model:

- `openai-audio` - OpenAI GPT-4o Mini Audio - Voice Input & Output

**To see all available speech models, visit:**
- [https://gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models) - List of all available models (filter for audio output)
- [Pollinations Documentation](https://pollinations.ai) - Official documentation

> **Note:** The available models may vary based on your API key permissions.

### Speech Generation Options

You can configure speech generation with the following options:

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: pollinations.speechModel('openai-audio'),
  text: 'The text to convert to speech',
  voice: 'alloy', // 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer' | 'coral' | 'verse' | 'ballad' | 'ash' | 'sage' | 'amuch' | 'dan'
  outputFormat: 'mp3', // 'mp3' | 'wav' | 'flac' | 'opus' | 'pcm16'
  instructions: 'Optional system message for voice instructions',
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| **text** | `string` | The text to convert to speech (required) |
| **voice** | `string` | Voice to use. Options: `'alloy'`, `'echo'`, `'fable'`, `'onyx'`, `'shimmer'`, `'coral'`, `'verse'`, `'ballad'`, `'ash'`, `'sage'`, `'amuch'`, `'dan'`. Default: `'alloy'` |
| **outputFormat** | `string` | Audio format. Options: `'mp3'`, `'wav'`, `'flac'`, `'opus'`, `'pcm16'`. Default: `'mp3'` |
| **instructions** | `string` | Optional system message to provide voice instructions or context |

> **Note:** The `instructions` parameter is sent as a system message to guide the voice generation, useful for setting the tone, style, or role of the narrator.

## Image Models

You can create models that call the Pollinations image generation API using the `.imageModel()` factory method:

```ts
const model = pollinations.imageModel('flux');
```

### Example

You can use Pollinations image models to generate images with the `generateImage` function:

```ts
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: pollinations.imageModel('flux'),
  prompt: 'A majestic lion in the savanna at sunset',
});
```

### Available Image and Video Models

Pollinations supports multiple image and video generation models. The default image model is `flux`. Both image and video models use the same API endpoint.

**To see all available image and video models, visit:**
- [https://gen.pollinations.ai/image/models](https://gen.pollinations.ai/image/models) - List of all available image and video models
- [Pollinations Documentation](https://pollinations.ai) - Official documentation

You can use any available model:

```ts
// Image models
const imageModel = pollinations.imageModel('turbo'); // or 'seedream', 'gptimage', etc.

// Video models (also use imageModel method)
const videoModel = pollinations.imageModel('seedance'); // or 'veo', 'seedance-pro', etc.
```

> **Note:** The available models may vary based on your API key permissions.

### Image Model Settings

You can configure image model-specific settings:

```ts
const model = pollinations.imageModel('flux', {
  nologo: true,     // Remove Pollinations logo (default: false)
  enhance: true,    // Enhance image quality (default: false)
  private: true,    // Make image private (default: false)
});
```

The following image model settings are available:

| Parameter | Type | Description |
|-----------|------|-------------|
| **nologo** | `boolean` | Remove Pollinations logo from generated images. Default: false. |
| **enhance** | `boolean` | Enhance image quality. Default: false. |
| **private** | `boolean` | Make image private (not shown in public feed). Default: false. |

> **Note:** The `seed` parameter is available via call options (e.g., `generateImage({ model, seed: 42 })`), not in image model settings. If not provided, it defaults to `-1` for true randomness.

### Image Generation Options

You can pass additional options when generating images:

```ts
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: pollinations.imageModel('flux'),
  prompt: 'A cat wearing a space helmet',
  size: '1024x1024', // or '256x256', '512x512', '1792x1024', '1024x1792', '2048x2048', '2048x1024', '1024x2048'
});
```

Standard options include:

| Parameter | Type | Description |
|-----------|------|-------------|
| **size** | `string` | Image size. Supported sizes: '256x256', '512x512', '1024x1024', '1792x1024' (16:9), '1024x1792' (9:16), '2048x2048' (2K), '2048x1024' (2K 16:9), '1024x2048' (2K 9:16) |

> **Note:** The `aspectRatio` parameter is supported for video models (veo, seedance, seedance-pro) only. For image models, use the `size` parameter instead (e.g., '1792x1024' for 16:9 aspect ratio).

### Model Capabilities

| Model              | Image Generation | Video Generation | Max Duration |
| ------------------ | ---------------- | ---------------- | ------------ |
| `flux`             | ✅               | ❌               | -            |
| `turbo`            | ✅               | ❌               | -            |
| `kontext`          | ✅               | ❌               | -            |
| `seedream`         | ✅               | ❌               | -            |
| `seedream-pro`     | ✅               | ❌               | -            |
| `nanobanana`       | ✅               | ❌               | -            |
| `nanobanana-pro`   | ✅               | ❌               | -            |
| `gptimage`         | ✅               | ❌               | -            |
| `gptimage-large`   | ✅               | ❌               | -            |
| `zimage`           | ✅               | ❌               | -            |
| `veo`              | ❌               | ✅               | 4-8 seconds  |
| `seedance`         | ❌               | ✅               | 2-10 seconds |
| `seedance-pro`     | ❌               | ✅               | 2-10 seconds |

## Authentication

Pollinations supports both authenticated and unauthenticated usage:

- **Without API key**: You can use Pollinations without an API key, but with rate limits
- **With API key**: API keys provide higher rate limits and access to additional features. Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai)

API keys can be passed when creating the provider:

```ts
const pollinations = createPollinations({
  apiKey: 'your-api-key-here',
});
```

Or set via environment variable and accessed in your code:

```ts
const pollinations = createPollinations({
  apiKey: process.env.POLLINATIONS_API_KEY,
});
```

## Error Handling

The provider includes comprehensive error handling with proper error types:

- `PollinationsAPIError` - API-specific errors
- `InvalidResponseDataError` - Invalid response data errors
- Standard AI SDK error types

Errors include helpful messages and status codes for debugging.

### Additional Image Options via Provider Options

Additional Pollinations-specific image options can be passed via `providerOptions.pollinations`:

```ts
import { generateImage } from 'ai';

// Example: Image generation with common options
const { images, providerMetadata } = await generateImage({
  model: pollinations.imageModel('flux'),
  prompt: 'A cat wearing a space helmet',
  providerOptions: {
    pollinations: {
      negative_prompt: 'blurry, low quality',
      safe: true,
    },
  },
});
// images[0] contains the base64-encoded image string
// providerMetadata.pollinations.images[0].url contains the API URL for reference

// Example: GPT image model with quality and transparent options
const { images: gptImages } = await generateImage({
  model: pollinations.imageModel('gptimage'),
  prompt: 'A transparent logo design',
  providerOptions: {
    pollinations: {
      quality: 'high', // 'low' | 'medium' | 'high' | 'hd'
      transparent: true,
    },
  },
});

// Example: Video generation with video-specific options
const { images: video } = await generateImage({
  model: pollinations.imageModel('veo'),
  prompt: 'A cat playing in a garden',
  aspectRatio: '16:9', // Can also use ImageModelV3CallOptions.aspectRatio
  providerOptions: {
    pollinations: {
      duration: 6, // veo: 4/6/8, seedance: 2-10
      audio: true, // veo only
    },
  },
});

// Example: Reference image support
const { images: withRef } = await generateImage({
  model: pollinations.imageModel('seedance'),
  prompt: 'Generate a video based on this image',
  providerOptions: {
    pollinations: {
      image: 'https://example.com/reference.jpg', // Reference image URL
    },
  },
});
```

Available provider options include:

| Parameter | Type | Description |
|-----------|------|-------------|
| **negative_prompt** | `string` | What to avoid in the generated image (all models) |
| **safe** | `boolean` | Enable safety content filters (all models) |
| **quality** | `string` | Image quality level ('low', 'medium', 'high', 'hd'). Only for `gptimage` and `gptimage-large` models. Emits warning if used with other models. |
| **transparent** | `boolean` | Generate with transparent background. Only for `gptimage` and `gptimage-large` models. Emits warning if used with other models. |
| **duration** | `number` | Video duration in seconds. For video models only: veo (4, 6, or 8), seedance/seedance-pro (2-10). Emits warning if used with image models or invalid duration. |
| **aspectRatio** | `string` | Video aspect ratio ('16:9' or '9:16'). For video models only. Can also be set via `ImageModelV3CallOptions.aspectRatio`. Emits warning if used with image models. |
| **audio** | `boolean` | Enable audio generation for video. Only for `veo` model. Emits warning if used with other models. |
| **image** | `string` | Reference image URL(s). Comma-separated for multiple images. For veo: supports interpolation with multiple images. Alternatively, use the `files` parameter from `ImageModelV3CallOptions` with URL-based files. |

> **Note:** Parameters are validated based on model type. Invalid parameter usage (e.g., `quality` with non-gptimage models, `audio` with non-veo models) will emit warnings but the generation will proceed. The API may reject invalid combinations.

## Examples

### Basic Text Generation

```ts
import { createPollinations } from 'ai-sdk-pollinations';
import { generateText } from 'ai';

const pollinations = createPollinations();

const { text } = await generateText({
  model: pollinations('openai'),
  prompt: 'Write a haiku about programming',
});
```

### Streaming Text

```ts
import { streamText } from 'ai';

const result = streamText({
  model: pollinations('openai'),
  prompt: 'Tell me a story',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Image Generation

```ts
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: pollinations.imageModel('flux'),
  prompt: 'A futuristic cityscape at night',
});

// images[0] contains the generated image as a base64-encoded string
// The API URL is available in providerMetadata.pollinations.images[0].url
```

### Speech Generation

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: pollinations.speechModel('openai-audio'),
  text: 'The quick brown fox jumps over the lazy dog.',
  voice: 'alloy',
  outputFormat: 'mp3',
  instructions: 'You are a professional narrator.',
});

// audio.base64 contains the generated audio as a base64-encoded string
```

### Tool Calling

```ts
import { tool } from 'ai';
import { z } from 'zod';

const calculatorTool = tool({
  description: 'Perform basic calculations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  execute: async ({ expression }) => {
    return { result: eval(expression) };
  },
});

const result = await generateText({
  model: pollinations('openai'),
  prompt: 'Calculate 15 * 23 + 42',
  tools: {
    calculator: calculatorTool,
  },
});
```

### Structured Outputs

```ts
import { generateObject } from 'ai';
import { z } from 'zod';

const result = await generateObject({
  model: pollinations('openai'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string()),
  }),
  prompt: 'Generate a person profile',
});
```

## License

MIT

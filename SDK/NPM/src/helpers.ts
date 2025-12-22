/**
 * Simple helper functions for quick usage without instantiating a client.
 * Perfect for beginners and simple use cases!
 *
 * @example
 * ```ts
 * import { generateImage, generateText } from '@pollinations/sdk';
 *
 * // Generate an image and save it
 * const image = await generateImage('A cute cat');
 * await image.saveToFile('cat.png');
 *
 * // Generate multiple images
 * const images = await generateImage('A cute cat', { n: 5 });
 *
 * // Generate text
 * const text = await generateText('Write a haiku');
 * ```
 */

import { Pollinations } from './client.js';
import type {
  ImageGenerateOptions,
  VideoGenerateOptions,
  TextGenerateOptions,
  ChatOptions,
  AudioGenerateOptions,
  Message,
  ModelInfo,
} from './types.js';
import {
  wrapImageResponse,
  wrapVideoResponse,
  wrapChatResponse,
  Conversation,
  type ImageResponseExt,
  type VideoResponseExt,
  type ChatResponseExt,
} from './extras.js';

// Default client instance (no API key - works for basic usage)
let defaultClient: Pollinations | null = null;

function getClient(apiKey?: string): Pollinations {
  if (apiKey) {
    return new Pollinations({ apiKey });
  }
  if (!defaultClient) {
    defaultClient = new Pollinations();
  }
  return defaultClient;
}

/**
 * Configure the default client with an API key
 *
 * @example
 * ```ts
 * import { configure } from '@pollinations/sdk';
 * configure({ apiKey: 'your-api-key' });
 * ```
 */
export function configure(options: { apiKey?: string; baseUrl?: string }): void {
  defaultClient = new Pollinations(options);
}

// ============================================================================
// Options with n parameter
// ============================================================================

interface WithN {
  /** Number of outputs to generate (default: 1). Each gets a random seed. */
  n?: number;
}

interface WithRaw {
  /** Return full API response instead of just the text (default: false) */
  raw?: boolean;
}

type ImageOptionsWithN = ImageGenerateOptions & WithN;
type VideoOptionsWithN = VideoGenerateOptions & WithN;
type TextOptionsWithN = TextGenerateOptions & WithN & WithRaw;
type AudioOptionsWithN = AudioGenerateOptions & WithN;

// ============================================================================
// Image Functions
// ============================================================================

/**
 * Get a URL for an image (generates it first, returns keyless URL)
 *
 * @example
 * ```ts
 * const url = await imageUrl('A sunset over mountains');
 * // <img src={url} /> - no API key exposed!
 * ```
 */
export async function imageUrl(prompt: string, options?: ImageGenerateOptions): Promise<string> {
  return getClient().imageUrl(prompt, options);
}

/**
 * Generate image(s) from a prompt
 *
 * @example
 * ```ts
 * // Single image
 * const image = await generateImage('A robot');
 * await image.saveToFile('robot.jpg');
 *
 * // Multiple images with n parameter
 * const images = await generateImage('A robot', { n: 5 });
 * images.forEach((img, i) => img.saveToFile(`robot-${i}.jpg`));
 * ```
 */
export async function generateImage(
  prompt: string,
  options?: ImageOptionsWithN
): Promise<ImageResponseExt | ImageResponseExt[]> {
  const { n = 1, ...imageOptions } = options || {};
  const client = getClient();

  if (n === 1) {
    const response = await client.image(prompt, imageOptions);
    return wrapImageResponse(response);
  }

  // Multiple: run in parallel with random seeds
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      client.image(prompt, { ...imageOptions, seed: -1 })
    )
  );
  return results.map(wrapImageResponse);
}

// ============================================================================
// Video Functions
// ============================================================================

/**
 * Get a URL for a video (generates it first, returns keyless URL)
 *
 * @example
 * ```ts
 * const url = await videoUrl('A bird flying', { model: 'veo', duration: 4 });
 * ```
 */
export async function videoUrl(prompt: string, options?: VideoGenerateOptions): Promise<string> {
  return getClient().videoUrl(prompt, options);
}

/**
 * Generate video(s) from a prompt
 *
 * @example
 * ```ts
 * // Single video
 * const video = await generateVideo('A cat stretching', { duration: 4 });
 * await video.saveToFile('cat.mp4');
 *
 * // Multiple videos
 * const videos = await generateVideo('A cat stretching', { n: 3, duration: 4 });
 * ```
 */
export async function generateVideo(
  prompt: string,
  options?: VideoOptionsWithN
): Promise<VideoResponseExt | VideoResponseExt[]> {
  const { n = 1, ...videoOptions } = options || {};
  const client = getClient();

  if (n === 1) {
    const response = await client.video(prompt, videoOptions);
    return wrapVideoResponse(response);
  }

  const results = await Promise.all(
    Array.from({ length: n }, () =>
      client.video(prompt, { ...videoOptions, seed: -1 })
    )
  );
  return results.map(wrapVideoResponse);
}

// ============================================================================
// Text Functions
// ============================================================================

/**
 * Generate text from a prompt
 *
 * @example
 * ```ts
 * // Single response (just text)
 * const text = await generateText('Write a haiku');
 *
 * // Multiple responses
 * const texts = await generateText('Write a haiku', { n: 3 });
 *
 * // Full API response with raw: true
 * const response = await generateText('Write a haiku', { raw: true });
 * console.log(response.tokens, response.actualModel);
 * ```
 */
export async function generateText(
  prompt: string,
  options?: TextOptionsWithN
): Promise<string | string[] | ChatResponseExt | ChatResponseExt[]> {
  const { n = 1, raw = false, ...textOptions } = options || {};
  const client = getClient();

  if (n === 1) {
    if (raw) {
      const response = await client.chat(
        [{ role: 'user', content: prompt }],
        { ...textOptions }
      );
      return wrapChatResponse(response);
    }
    return client.text(prompt, textOptions);
  }

  // Multiple: run in parallel with random seeds
  if (raw) {
    const results = await Promise.all(
      Array.from({ length: n }, () =>
        client.chat(
          [{ role: 'user', content: prompt }],
          { ...textOptions, seed: -1 }
        )
      )
    );
    return results.map(wrapChatResponse);
  }

  const results = await Promise.all(
    Array.from({ length: n }, () =>
      client.text(prompt, { ...textOptions, seed: -1 })
    )
  );
  return results;
}

/**
 * Generate text with streaming
 *
 * @example
 * ```ts
 * for await (const chunk of generateTextStream('Tell me a story')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export async function* generateTextStream(
  prompt: string,
  options?: Omit<TextGenerateOptions, 'stream'>
): AsyncGenerator<string> {
  yield* getClient().textStream(prompt, options);
}

// ============================================================================
// Chat Functions
// ============================================================================

/**
 * Create chat completion(s) with extended response
 *
 * @example
 * ```ts
 * // Single completion
 * const response = await chat([{ role: 'user', content: 'Hello!' }]);
 * console.log(response.text);
 *
 * // Multiple completions
 * const responses = await chat([{ role: 'user', content: 'Hello!' }], { n: 3 });
 * ```
 */
export async function chat(
  messages: Message[],
  options?: ChatOptions & WithN
): Promise<ChatResponseExt | ChatResponseExt[]> {
  const { n = 1, ...chatOptions } = options || {};
  const client = getClient();

  if (n === 1) {
    const response = await client.chat(messages, chatOptions);
    return wrapChatResponse(response);
  }

  const results = await Promise.all(
    Array.from({ length: n }, () =>
      client.chat(messages, { ...chatOptions, seed: -1 })
    )
  );
  return results.map(wrapChatResponse);
}

/**
 * Create a streaming chat completion
 *
 * @example
 * ```ts
 * for await (const chunk of chatStream([{ role: 'user', content: 'Write a poem' }])) {
 *   const text = chunk.choices[0]?.delta?.content;
 *   if (text) process.stdout.write(text);
 * }
 * ```
 */
export async function* chatStream(
  messages: Message[],
  options?: Omit<ChatOptions, 'stream'>
): AsyncGenerator<import('./types.js').ChatStreamChunk> {
  yield* getClient().chatStream(messages, options);
}

/**
 * Create a new conversation with the configured client
 *
 * @example
 * ```ts
 * const convo = conversation({ model: 'openai' });
 * convo.system('You are a helpful assistant');
 * const response = await convo.say('Hello!');
 * ```
 */
export function conversation(options?: ChatOptions): Conversation {
  return new Conversation(options, getClient());
}

// ============================================================================
// Audio Functions
// ============================================================================

/** Audio response type */
export interface AudioResponseExt {
  transcript: string;
  data: string;
  id: string;
  expiresAt: number;
}

/**
 * Generate speech audio from text
 *
 * @example
 * ```ts
 * // Single audio
 * const audio = await generateAudio('Hello world!', { voice: 'nova' });
 *
 * // Multiple variations
 * const audios = await generateAudio('Hello world!', { n: 3, voice: 'nova' });
 * ```
 */
export async function generateAudio(
  text: string,
  options?: AudioOptionsWithN
): Promise<AudioResponseExt | AudioResponseExt[]> {
  const { n = 1, ...audioOptions } = options || {};
  const client = getClient();

  if (n === 1) {
    return client.audio(text, audioOptions);
  }

  const results = await Promise.all(
    Array.from({ length: n }, () =>
      client.audio(text, { ...audioOptions, seed: -1 })
    )
  );
  return results;
}

// ============================================================================
// Model Discovery Functions
// ============================================================================

/**
 * Get available text models
 */
export async function getTextModels(): Promise<ModelInfo[]> {
  return getClient().textModels();
}

/**
 * Get available image models
 */
export async function getImageModels(): Promise<ModelInfo[]> {
  return getClient().imageModels();
}

/**
 * Get all available models
 */
export async function getModels(): Promise<ModelInfo[]> {
  return getClient().models();
}

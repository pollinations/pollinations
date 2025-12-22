/**
 * Extra utilities to make life easier
 */

import type {
  ImageGenerateOptions,
  ImageResponse,
  VideoGenerateOptions,
  VideoResponse,
  ChatOptions,
  ChatResponse,
  Message,
} from './types.js';
import { Pollinations } from './client.js';

// ============================================================================
// Extended Response Types (with extra goodies)
// ============================================================================

/** Extended image response with helper methods */
export interface ImageResponseExt extends ImageResponse {
  /** Save image to file (Node.js only) */
  saveToFile: (path: string) => Promise<void>;
  /** Get as base64 string */
  toBase64: () => string;
  /** Get as data URL (ready for img src) */
  toDataURL: () => string;
}

/** Extended video response with helper methods */
export interface VideoResponseExt extends VideoResponse {
  /** Save video to file (Node.js only) */
  saveToFile: (path: string) => Promise<void>;
  /** Get as base64 string */
  toBase64: () => string;
  /** Get as data URL */
  toDataURL: () => string;
}

/** Extended chat response with extra metadata */
export interface ChatResponseExt extends ChatResponse {
  /** The actual text content (shortcut) */
  text: string;
  /** Token usage stats */
  tokens: {
    input: number;
    output: number;
    total: number;
    cached?: number;
    reasoning?: number;
  };
  /** The actual model that was used */
  actualModel: string;
  /** Request ID for tracking */
  requestId: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert ArrayBuffer to base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    // Node.js
    return Buffer.from(buffer).toString('base64');
  } else {
    // Browser
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/** Save buffer to file (Node.js only) */
async function saveBufferToFile(buffer: ArrayBuffer, path: string): Promise<void> {
  // Check if we're in Node.js
  if (typeof globalThis.process === 'undefined' || !globalThis.process.versions?.node) {
    throw new Error('saveToFile() is only available in Node.js. In browsers, use toDataURL() or toBase64() instead.');
  }
  // Dynamic import for Node.js fs - wrapped to avoid bundler issues
  const fsModule = 'fs';
  const fs = await import(/* @vite-ignore */ fsModule).then(m => m.promises);
  await fs.writeFile(path, Buffer.from(buffer));
}

/** Wrap image response with helper methods */
export function wrapImageResponse(response: ImageResponse): ImageResponseExt {
  return {
    ...response,
    saveToFile: (path: string) => saveBufferToFile(response.buffer, path),
    toBase64: () => arrayBufferToBase64(response.buffer),
    toDataURL: () => `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`,
  };
}

/** Wrap video response with helper methods */
export function wrapVideoResponse(response: VideoResponse): VideoResponseExt {
  return {
    ...response,
    saveToFile: (path: string) => saveBufferToFile(response.buffer, path),
    toBase64: () => arrayBufferToBase64(response.buffer),
    toDataURL: () => `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`,
  };
}

/** Wrap chat response with extra metadata */
export function wrapChatResponse(response: ChatResponse): ChatResponseExt {
  const usage = response.usage;
  return {
    ...response,
    text: response.choices[0]?.message?.content || '',
    tokens: {
      input: usage?.prompt_tokens || 0,
      output: usage?.completion_tokens || 0,
      total: usage?.total_tokens || 0,
      cached: usage?.prompt_tokens_details?.cached_tokens,
      reasoning: usage?.completion_tokens_details?.reasoning_tokens,
    },
    actualModel: response.model,
    requestId: response.id,
  };
}

// ============================================================================
// Batch Generation (for different prompts)
// ============================================================================

/** Generate multiple images from different prompts in parallel */
export async function generateImages(
  prompts: string[],
  options?: ImageGenerateOptions,
  client?: Pollinations
): Promise<ImageResponseExt[]> {
  const c = client || new Pollinations();
  const results = await Promise.all(
    prompts.map(prompt => c.image(prompt, options))
  );
  return results.map(wrapImageResponse);
}

/** Generate multiple videos from different prompts in parallel */
export async function generateVideos(
  prompts: string[],
  options?: VideoGenerateOptions,
  client?: Pollinations
): Promise<VideoResponseExt[]> {
  const c = client || new Pollinations();
  const results = await Promise.all(
    prompts.map(prompt => c.video(prompt, options))
  );
  return results.map(wrapVideoResponse);
}

// ============================================================================
// Conversation Helper
// ============================================================================

/** Conversation state manager */
export class Conversation {
  private messages: Message[] = [];
  private client: Pollinations;
  private options: ChatOptions;

  constructor(options: ChatOptions = {}, client?: Pollinations) {
    this.client = client || new Pollinations();
    this.options = options;
  }

  /** Add a system message */
  system(content: string): this {
    this.messages.push({ role: 'system', content });
    return this;
  }

  /** Add a user message without sending */
  user(content: string): this {
    this.messages.push({ role: 'user', content });
    return this;
  }

  /** Add an assistant message manually */
  assistant(content: string): this {
    this.messages.push({ role: 'assistant', content });
    return this;
  }

  /** Add a tool result message */
  tool(toolCallId: string, content: string): this {
    this.messages.push({ role: 'tool', content, tool_call_id: toolCallId });
    return this;
  }

  /** Add any message directly */
  addMessage(message: Message): this {
    this.messages.push(message);
    return this;
  }

  /** Send a message and get a response */
  async say(content: string): Promise<ChatResponseExt> {
    this.messages.push({ role: 'user', content });

    const response = await this.client.chat(this.messages, this.options);
    const wrapped = wrapChatResponse(response);

    // Add full assistant message to history (including tool_calls if present)
    const assistantMessage: Message & { tool_calls?: unknown } = { role: 'assistant', content: wrapped.text };
    if (response.choices[0]?.message?.tool_calls) {
      assistantMessage.tool_calls = response.choices[0].message.tool_calls;
    }
    this.messages.push(assistantMessage as Message);

    return wrapped;
  }

  /** Send current messages without adding a new user message (useful after adding tool results) */
  async send(): Promise<ChatResponseExt> {
    const response = await this.client.chat(this.messages, this.options);
    const wrapped = wrapChatResponse(response);

    // Add full assistant message to history
    const assistantMessage: Message & { tool_calls?: unknown } = { role: 'assistant', content: wrapped.text };
    if (response.choices[0]?.message?.tool_calls) {
      assistantMessage.tool_calls = response.choices[0].message.tool_calls;
    }
    this.messages.push(assistantMessage as Message);

    return wrapped;
  }

  /** Get the conversation history */
  getHistory(): Message[] {
    return [...this.messages];
  }

  /** Clear the conversation history */
  clear(): this {
    this.messages = [];
    return this;
  }

  /** Fork the conversation (create a copy) */
  fork(): Conversation {
    const forked = new Conversation(this.options, this.client);
    forked.messages = [...this.messages];
    return forked;
  }
}

// ============================================================================
// Browser Helpers
// ============================================================================

/** Display an image in the DOM (browser only) */
export async function showImage(
  prompt: string,
  container: string | HTMLElement,
  options?: ImageGenerateOptions,
  client?: Pollinations
): Promise<HTMLImageElement> {
  if (typeof document === 'undefined') {
    throw new Error('showImage is only available in browsers');
  }

  const c = client || new Pollinations();
  const img = document.createElement('img');
  img.alt = prompt;
  img.src = await c.imageUrl(prompt, options);

  const target = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!target) {
    throw new Error(`Container not found: ${container}`);
  }

  target.appendChild(img);
  return img;
}

/** Display an image from a generated response */
export function displayImage(
  response: ImageResponse | ImageResponseExt,
  container: string | HTMLElement
): HTMLImageElement {
  if (typeof document === 'undefined') {
    throw new Error('displayImage is only available in browsers');
  }

  const img = document.createElement('img');

  // Check if it has toDataURL (extended response)
  if ('toDataURL' in response) {
    img.src = response.toDataURL();
  } else {
    img.src = `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`;
  }

  const target = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!target) {
    throw new Error(`Container not found: ${container}`);
  }

  target.appendChild(img);
  return img;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Rough token estimation (GPT-style tokenization)
 * ~4 chars per token for English, ~1.5 for code
 */
export function estimateTokens(text: string): number {
  // Simple estimation: ~4 characters per token for English
  // This is a rough approximation - actual tokenization varies by model
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a message array */
export function estimateMessageTokens(messages: Message[]): {
  estimated: number;
  breakdown: { role: string; tokens: number }[];
} {
  const breakdown = messages.map(msg => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    return {
      role: msg.role,
      tokens: estimateTokens(content) + 4, // +4 for role/formatting overhead
    };
  });

  return {
    estimated: breakdown.reduce((sum, b) => sum + b.tokens, 0) + 3, // +3 for message framing
    breakdown,
  };
}

// ============================================================================
// Utility: Wait for generation with progress
// ============================================================================

/** Options for awaited generation */
export interface AwaitOptions {
  /** Polling interval in ms (default: 1000) */
  pollInterval?: number;
  /** Timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
  /** Progress callback */
  onProgress?: (status: { elapsed: number; status: string }) => void;
}

/** Generate image with progress tracking */
export async function generateImageWithProgress(
  prompt: string,
  options?: ImageGenerateOptions & AwaitOptions,
  client?: Pollinations
): Promise<ImageResponseExt> {
  const { onProgress, pollInterval = 1000, timeout = 300000, ...imageOptions } = options || {};
  const c = client || new Pollinations();
  const startTime = Date.now();

  if (onProgress) {
    onProgress({ elapsed: 0, status: 'starting' });
  }

  const progressInterval = onProgress
    ? setInterval(() => {
        const elapsed = Date.now() - startTime;
        onProgress({ elapsed, status: 'generating' });
      }, pollInterval)
    : null;

  try {
    const result = await Promise.race([
      c.image(prompt, imageOptions),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Generation timeout')), timeout)
      ),
    ]);

    if (onProgress) {
      onProgress({ elapsed: Date.now() - startTime, status: 'complete' });
    }

    return wrapImageResponse(result);
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

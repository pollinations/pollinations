import type {
  PollinationsConfig,
  ImageGenerateOptions,
  ImageResponse,
  VideoGenerateOptions,
  VideoResponse,
  TextGenerateOptions,
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  AudioGenerateOptions,
  Message,
  ModelInfo,
  PollinationsErrorDetails,
} from './types.js';
import { PollinationsError } from './types.js';

const DEFAULT_BASE_URL = 'https://gen.pollinations.ai';
const DEFAULT_MAX_RETRIES = 3;
const MAX_INT32 = 2147483647;
declare const process: {
  env?: Record<string, string | undefined>;
  versions?: { node?: string };
};

// Default timeouts in milliseconds
const DEFAULT_TIMEOUT = 300_000; // 5min for text/chat
const DEFAULT_IMAGE_TIMEOUT = 600_000; // 10min for images
const DEFAULT_VIDEO_TIMEOUT = 600_000; // 10min for videos

// HTTP status codes that should NOT be retried
const NON_RETRIABLE_CODES = [400, 401, 403, 404, 422];

// Helper to get env var (works in Node.js, Deno, Bun, and edge runtimes)
function getEnvVar(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  // @ts-expect-error - Deno global
  if (typeof Deno !== 'undefined') {
    // @ts-expect-error - Deno global
    return Deno.env.get(name);
  }
  return undefined;
}

// Generate a random seed (0 to MAX_INT32)
function randomSeed(): number {
  return Math.floor(Math.random() * MAX_INT32);
}

// Resolve seed: if -1, generate random; otherwise use as-is
function resolveSeed(seed: number | undefined): number | undefined {
  if (seed === -1) {
    return randomSeed();
  }
  return seed;
}

// Sleep helper for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exponential backoff delay: 1s, 2s, 4s
function getRetryDelay(attempt: number): number {
  return Math.pow(2, attempt) * 1000;
}

// Check if an error should be retried
function isRetriableError(error: unknown): boolean {
  if (error instanceof PollinationsError) {
    // Don't retry client errors (4xx except rate limits)
    return !NON_RETRIABLE_CODES.includes(error.status);
  }
  // Network errors, timeouts, etc. are retriable
  return true;
}

// Fetch with timeout using AbortController
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new PollinationsError(
        `Request timed out after ${timeoutMs}ms`,
        'TIMEOUT',
        408
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Strip API key from URL for safe sharing
function stripKeyFromUrl(url: string): string {
  const urlObj = new URL(url);
  urlObj.searchParams.delete('key');
  return urlObj.toString();
}

/**
 * Pollinations AI Client
 *
 * A comprehensive client for interacting with the Pollinations AI API.
 * Supports image, video, text, and audio generation.
 *
 * @example Basic usage
 * ```ts
 * const client = new Pollinations({ apiKey: 'your_api_key' });
 * const { buffer } = await client.image('A cute robot');
 * ```
 *
 * @example With environment variable (auto-detected)
 * ```ts
 * // Set POLLINATIONS_API_KEY in your environment
 * const client = new Pollinations();
 * ```
 */
export class Pollinations {
  private apiKey: string;
  private baseUrl: string;
  private maxRetries: number;
  private textTimeout: number;
  private imageTimeout: number;
  private videoTimeout: number;

  constructor(config: PollinationsConfig = {}) {
    // Auto-detect API key from environment if not provided
    const apiKey = config.apiKey || getEnvVar('POLLINATIONS_API_KEY');

    if (!apiKey) {
      throw new PollinationsError(
        'API key is required. Get one for free at https://enter.pollinations.ai',
        'API_KEY',
        401
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || DEFAULT_BASE_URL;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    // Allow timeout to be a default fallback for all types
    const defaultTimeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.textTimeout = config.textTimeout ?? defaultTimeout;
    this.imageTimeout = config.imageTimeout ?? (config.timeout ? config.timeout : DEFAULT_IMAGE_TIMEOUT);
    this.videoTimeout = config.videoTimeout ?? (config.timeout ? config.timeout : DEFAULT_VIDEO_TIMEOUT);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: PollinationsErrorDetails | null = null;
    try {
      const json = await response.json() as { error?: PollinationsErrorDetails };
      if (json.error) {
        errorData = json.error;
      }
    } catch {
      // Response wasn't JSON
    }

    throw new PollinationsError(
      errorData?.message || `Request failed with status ${response.status}`,
      errorData?.code || 'UNKNOWN_ERROR',
      response.status,
      errorData?.details,
      errorData?.requestId
    );
  }

  private buildQueryParams(params: Record<string, unknown>, includeKey: boolean = true): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        searchParams.set(key, value.join(','));
      } else if (typeof value === 'boolean') {
        searchParams.set(key, value ? 'true' : 'false');
      } else {
        searchParams.set(key, String(value));
      }
    }

    // Add API key to query params if set and requested
    if (includeKey && this.apiKey) {
      searchParams.set('key', this.apiKey);
    }

    return searchParams.toString();
  }

  // ============================================================================
  // Image Generation
  // ============================================================================

  /** Build image URL with all params (internal use) */
  private buildImageUrl(prompt: string, options: ImageGenerateOptions = {}, seed?: number): string {
    const params: Record<string, unknown> = {
      model: options.model || 'flux',
      width: options.width,
      height: options.height,
      seed: seed !== undefined ? seed : resolveSeed(options.seed),
      enhance: options.enhance,
      negative_prompt: options.negativePrompt,
      private: options.private,
      nologo: options.nologo,
      nofeed: options.nofeed,
      safe: options.safe,
      quality: options.quality,
      image: options.referenceImage,
      transparent: options.transparent,
      guidance_scale: options.guidanceScale,
    };

    const queryString = this.buildQueryParams(params);
    const encodedPrompt = encodeURIComponent(prompt);

    return `${this.baseUrl}/image/${encodedPrompt}${queryString ? `?${queryString}` : ''}`;
  }

  /**
   * Generate an image URL from a text prompt.
   * Hits the API first to authenticate, then returns a keyless URL that can be shared.
   *
   * @example
   * ```ts
   * const url = await pollinations.imageUrl('A beautiful sunset over mountains');
   * // Use directly in <img src={url}> - no key exposed!
   * ```
   */
  async imageUrl(prompt: string, options: ImageGenerateOptions = {}): Promise<string> {
    const response = await this.image(prompt, options);
    return response.url; // Already has key stripped
  }

  /**
   * Generate an image and return it as binary data.
   * Automatically retries up to 3 times with exponential backoff on retriable failures.
   *
   * @example
   * ```ts
   * const { buffer, contentType } = await pollinations.image('A cute robot');
   * // Save to file or process the buffer
   * ```
   */
  async image(prompt: string, options: ImageGenerateOptions = {}): Promise<ImageResponse> {
    if (!prompt || typeof prompt !== 'string') {
      throw new PollinationsError('Prompt is required and must be a string', 'INVALID_INPUT', 400);
    }

    let lastError: Error = new Error('Unknown error during image generation');

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      // Generate new seed for each retry (or use resolved seed on first attempt)
      const seed = attempt === 0 ? resolveSeed(options.seed) : randomSeed();
      const url = this.buildImageUrl(prompt, options, seed);

      try {
        const response = await fetchWithTimeout(
          url,
          { headers: this.getHeaders() },
          this.imageTimeout
        );

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        return { buffer, contentType, url: stripKeyFromUrl(url) };
      } catch (err) {
        lastError = err as Error;

        // Don't retry non-retriable errors (400, 401, 403, 404, 422)
        if (!isRetriableError(err)) {
          throw lastError;
        }

        if (attempt < this.maxRetries - 1) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    throw lastError;
  }

  // ============================================================================
  // Video Generation
  // ============================================================================

  private validateVideoDuration(model: string, duration?: number): void {
    if (duration === undefined) return;

    const isVeo = model === 'veo';
    const isSeedance = model.startsWith('seedance');

    if (isVeo && ![4, 6, 8].includes(duration)) {
      throw new PollinationsError(
        `Invalid duration for veo: ${duration}. Must be 4, 6, or 8 seconds.`,
        'INVALID_DURATION',
        400
      );
    }

    if (isSeedance && (duration < 2 || duration > 10)) {
      throw new PollinationsError(
        `Invalid duration for ${model}: ${duration}. Must be between 2-10 seconds.`,
        'INVALID_DURATION',
        400
      );
    }
  }

  /** Build video URL with all params (internal use) */
  private buildVideoUrl(prompt: string, options: VideoGenerateOptions = {}, seed?: number): string {
    const model = options.model || 'veo';
    this.validateVideoDuration(model, options.duration);

    const params: Record<string, unknown> = {
      model,
      duration: options.duration,
      aspectRatio: options.aspectRatio,
      seed: seed !== undefined ? seed : resolveSeed(options.seed),
      audio: options.audio,
      image: options.referenceImage,
      private: options.private,
      nologo: options.nologo,
      safe: options.safe,
    };

    const queryString = this.buildQueryParams(params);
    const encodedPrompt = encodeURIComponent(prompt);

    return `${this.baseUrl}/image/${encodedPrompt}${queryString ? `?${queryString}` : ''}`;
  }

  /**
   * Generate a video URL from a text prompt.
   * Hits the API first to authenticate, then returns a keyless URL that can be shared.
   *
   * @example
   * ```ts
   * const url = await pollinations.videoUrl('A cat playing piano', { model: 'veo', duration: 4 });
   * ```
   */
  async videoUrl(prompt: string, options: VideoGenerateOptions = {}): Promise<string> {
    const response = await this.video(prompt, options);
    return response.url; // Already has key stripped
  }

  /**
   * Generate a video and return it as binary data.
   * Automatically retries up to 3 times with exponential backoff on retriable failures.
   * Note: Video generation can take several minutes - timeout is set to 10 minutes.
   *
   * @example
   * ```ts
   * const { buffer } = await pollinations.video('A dog running in a field', { duration: 6 });
   * ```
   */
  async video(prompt: string, options: VideoGenerateOptions = {}): Promise<VideoResponse> {
    if (!prompt || typeof prompt !== 'string') {
      throw new PollinationsError('Prompt is required and must be a string', 'INVALID_INPUT', 400);
    }

    let lastError: Error = new Error('Unknown error during video generation');

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const seed = attempt === 0 ? resolveSeed(options.seed) : randomSeed();
      const url = this.buildVideoUrl(prompt, options, seed);

      try {
        const response = await fetchWithTimeout(
          url,
          { headers: this.getHeaders() },
          this.videoTimeout
        );

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'video/mp4';

        return { buffer, contentType, url: stripKeyFromUrl(url) };
      } catch (err) {
        lastError = err as Error;

        // Don't retry non-retriable errors (400, 401, 403, 404, 422)
        if (!isRetriableError(err)) {
          throw lastError;
        }

        if (attempt < this.maxRetries - 1) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    throw lastError;
  }

  // ============================================================================
  // Text Generation
  // ============================================================================

  /**
   * Generate text from a prompt.
   * Automatically retries up to 3 times with exponential backoff on retriable failures.
   *
   * @example
   * ```ts
   * const text = await pollinations.text('Write a haiku about coding');
   * console.log(text);
   * ```
   */
  async text(prompt: string, options: TextGenerateOptions = {}): Promise<string> {
    if (!prompt || typeof prompt !== 'string') {
      throw new PollinationsError('Prompt is required and must be a string', 'INVALID_INPUT', 400);
    }

    let lastError: Error = new Error('Unknown error during text generation');

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const seed = attempt === 0 ? resolveSeed(options.seed) : randomSeed();

      const messages: Message[] = [];

      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const body: Record<string, unknown> = {
        messages,
        model: options.model || 'openai',
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        seed,
        stream: false,
      };

      if (options.json) {
        body.response_format = { type: 'json_object' };
      }

      // Remove undefined values
      Object.keys(body).forEach(key => {
        if (body[key] === undefined) delete body[key];
      });

      try {
        const response = await fetchWithTimeout(
          `${this.baseUrl}/v1/chat/completions`,
          {
            method: 'POST',
            headers: this.getHeaders('application/json'),
            body: JSON.stringify(body),
          },
          this.textTimeout
        );

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const data = await response.json() as ChatResponse;
        return data.choices[0]?.message?.content || '';
      } catch (err) {
        lastError = err as Error;

        // Don't retry non-retriable errors (400, 401, 403, 404, 422)
        if (!isRetriableError(err)) {
          throw lastError;
        }

        if (attempt < this.maxRetries - 1) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate text with streaming response
   *
   * @example
   * ```ts
   * for await (const chunk of pollinations.textStream('Tell me a story')) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async *textStream(prompt: string, options: Omit<TextGenerateOptions, 'stream'> = {}): AsyncGenerator<string> {
    if (!prompt || typeof prompt !== 'string') {
      throw new PollinationsError('Prompt is required and must be a string', 'INVALID_INPUT', 400);
    }

    const messages: Message[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      messages,
      model: options.model || 'openai',
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      seed: options.seed,
      stream: true,
    };

    if (options.json) {
      body.response_format = { type: 'json_object' };
    }

    // Remove undefined values
    Object.keys(body).forEach(key => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders('application/json'),
        body: JSON.stringify(body),
      },
      this.textTimeout
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new PollinationsError('No response body', 'NO_BODY', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6)) as ChatStreamChunk;
            const content = json.choices[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // ============================================================================
  // Chat Completions (OpenAI-compatible)
  // ============================================================================

  /**
   * Create a chat completion (OpenAI-compatible).
   * Automatically retries up to 3 times with exponential backoff on retriable failures.
   *
   * @example
   * ```ts
   * const response = await pollinations.chat([
   *   { role: 'user', content: 'What is the capital of France?' }
   * ]);
   * console.log(response.choices[0].message.content);
   * ```
   */
  async chat(messages: Message[], options: ChatOptions = {}): Promise<ChatResponse> {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new PollinationsError('Messages array is required and cannot be empty', 'INVALID_INPUT', 400);
    }

    let lastError: Error = new Error('Unknown error during chat completion');

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const seed = attempt === 0 ? resolveSeed(options.seed) : randomSeed();

      const body: Record<string, unknown> = {
        messages,
        model: options.model || 'openai',
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        repetition_penalty: options.repetitionPenalty,
        stop: options.stop,
        seed,
        stream: false,
        stream_options: options.streamOptions,
        response_format: options.responseFormat,
        tools: options.tools,
        tool_choice: options.toolChoice,
        parallel_tool_calls: options.parallelToolCalls,
        thinking: options.thinking,
        reasoning_effort: options.reasoningEffort,
        thinking_budget: options.thinkingBudget,
        modalities: options.modalities,
        audio: options.audio,
        user: options.user,
        logit_bias: options.logitBias,
        logprobs: options.logprobs,
        top_logprobs: options.topLogprobs,
        functions: options.functions,
        function_call: options.functionCall,
      };

      // Remove undefined values
      Object.keys(body).forEach(key => {
        if (body[key] === undefined) {
          delete body[key];
        }
      });

      try {
        const response = await fetchWithTimeout(
          `${this.baseUrl}/v1/chat/completions`,
          {
            method: 'POST',
            headers: this.getHeaders('application/json'),
            body: JSON.stringify(body),
          },
          this.textTimeout
        );

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        return response.json() as Promise<ChatResponse>;
      } catch (err) {
        lastError = err as Error;

        // Don't retry non-retriable errors (400, 401, 403, 404, 422)
        if (!isRetriableError(err)) {
          throw lastError;
        }

        if (attempt < this.maxRetries - 1) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Create a streaming chat completion
   *
   * @example
   * ```ts
   * for await (const chunk of pollinations.chatStream([
   *   { role: 'user', content: 'Write a poem' }
   * ])) {
   *   const content = chunk.choices[0]?.delta?.content;
   *   if (content) process.stdout.write(content);
   * }
   * ```
   */
  async *chatStream(
    messages: Message[],
    options: Omit<ChatOptions, 'stream'> = {}
  ): AsyncGenerator<ChatStreamChunk> {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new PollinationsError('Messages array is required and cannot be empty', 'INVALID_INPUT', 400);
    }

    const body: Record<string, unknown> = {
      messages,
      model: options.model || 'openai',
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      repetition_penalty: options.repetitionPenalty,
      stop: options.stop,
      seed: options.seed,
      stream: true,
      stream_options: options.streamOptions,
      response_format: options.responseFormat,
      tools: options.tools,
      tool_choice: options.toolChoice,
      parallel_tool_calls: options.parallelToolCalls,
      thinking: options.thinking,
      reasoning_effort: options.reasoningEffort,
      thinking_budget: options.thinkingBudget,
      modalities: options.modalities,
      audio: options.audio,
      user: options.user,
      logit_bias: options.logitBias,
      logprobs: options.logprobs,
      top_logprobs: options.topLogprobs,
      functions: options.functions,
      function_call: options.functionCall,
    };

    // Remove undefined values
    Object.keys(body).forEach(key => {
      if (body[key] === undefined) {
        delete body[key];
      }
    });

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders('application/json'),
        body: JSON.stringify(body),
      },
      this.textTimeout
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new PollinationsError('No response body', 'NO_BODY', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json as ChatStreamChunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // ============================================================================
  // Audio Generation
  // ============================================================================

  /**
   * Generate speech audio from text
   *
   * @example
   * ```ts
   * const response = await pollinations.audio('Hello, how are you today?', { voice: 'nova' });
   * // response.data contains base64 audio, response.transcript contains the text
   * ```
   */
  async audio(text: string, options: AudioGenerateOptions = {}): Promise<{
    transcript: string;
    data: string;
    id: string;
    expiresAt: number;
  }> {
    const response = await this.chat(
      [{ role: 'user', content: text }],
      {
        model: options.model || 'openai-audio',
        modalities: ['text', 'audio'],
        audio: {
          voice: options.voice || 'alloy',
          format: options.format || 'mp3',
        },
        seed: options.seed,
      }
    );

    const audioData = response.choices[0]?.message?.audio;
    if (!audioData) {
      throw new PollinationsError('No audio in response', 'NO_AUDIO', 500);
    }

    return {
      transcript: audioData.transcript,
      data: audioData.data,
      id: audioData.id,
      expiresAt: audioData.expires_at,
    };
  }

  // ============================================================================
  // Model Discovery
  // ============================================================================

  /**
   * Get available text models
   *
   * @example
   * ```ts
   * const models = await pollinations.textModels();
   * console.log(models.map(m => m.name));
   * ```
   */
  async textModels(): Promise<ModelInfo[]> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/text/models`,
      { headers: this.getHeaders() },
      this.textTimeout
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<ModelInfo[]>;
  }

  /**
   * Get available image models
   *
   * @example
   * ```ts
   * const models = await pollinations.imageModels();
   * console.log(models.map(m => m.name));
   * ```
   */
  async imageModels(): Promise<ModelInfo[]> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/image/models`,
      { headers: this.getHeaders() },
      this.textTimeout
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<ModelInfo[]>;
  }

  /**
   * Get available models (OpenAI-compatible endpoint)
   *
   * @example
   * ```ts
   * const models = await pollinations.models();
   * ```
   */
  async models(): Promise<ModelInfo[]> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/models`,
      { headers: this.getHeaders() },
      this.textTimeout
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<ModelInfo[]>;
  }
}

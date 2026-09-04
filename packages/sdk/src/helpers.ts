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
 * // Generate text
 * const text = await generateText('Write a haiku');
 * ```
 */

import { Pollinations } from "./client.js";
import {
    type AudioResponseExt,
    type ChatResponseExt,
    Conversation,
    type ImageResponseExt,
    type VideoResponseExt,
    wrapAudioResponse,
    wrapChatResponse,
    wrapImageResponse,
    wrapVideoResponse,
} from "./extras.js";
import type {
    AccountBalance,
    AccountKey,
    AccountProfile,
    AudioGenerateOptions,
    AuthorizeDeviceOptions,
    AuthorizeOptions,
    ChatOptions,
    CreatedKey,
    CreateKeyOptions,
    DailyUsageOptions,
    DailyUsageResponse,
    DeviceAuthorization,
    EmbeddingInput,
    EmbeddingOptions,
    EmbeddingResponse,
    ImageEditOptions,
    ImageGenerateOptions,
    ImageGenerateV1Options,
    KeyInfo,
    KeyUsageOptions,
    Message,
    ModelInfo,
    TextGenerateOptions,
    TranscribeOptions,
    TranscriptionResponse,
    TranscriptionVerboseResponse,
    UploadOptions,
    UploadResponse,
    UsageOptions,
    UsageResponse,
    UserInfo,
    VideoGenerateOptions,
} from "./types.js";

// Default client instance
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
 * Reset the default client (useful for testing)
 */
export function resetClient(): void {
    defaultClient = null;
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
export function configure(options: {
    apiKey?: string;
    baseUrl?: string;
}): void {
    defaultClient = new Pollinations(options);
}

interface WithRaw {
    /** Return full API response instead of just the text (default: false) */
    raw?: boolean;
}

type TextOptionsWithRaw = TextGenerateOptions & WithRaw;

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
export async function imageUrl(
    prompt: string,
    options?: ImageGenerateOptions,
): Promise<string> {
    return getClient().imageUrl(prompt, options);
}

/**
 * Generate an image from a prompt
 *
 * @example
 * ```ts
 * const image = await generateImage('A robot');
 * await image.saveToFile('robot.png');
 * ```
 */
export async function generateImage(
    prompt: string,
    options?: ImageGenerateOptions,
): Promise<ImageResponseExt> {
    return wrapImageResponse(await getClient().image(prompt, options));
}

/**
 * Edit an image using a text prompt
 *
 * @example
 * ```ts
 * const edited = await editImage('make it cyberpunk', {
 *   sourceImages: ['https://example.com/photo.jpg']
 * });
 * ```
 */
export async function editImage(
    prompt: string,
    options?: ImageEditOptions,
): Promise<ImageResponseExt> {
    return wrapImageResponse(await getClient().editImage(prompt, options));
}

/**
 * Generate an image (OpenAI-compatible endpoint)
 */
export async function imageGenerate(
    prompt: string,
    options?: ImageGenerateV1Options,
): Promise<ImageResponseExt> {
    return wrapImageResponse(await getClient().imageGenerate(prompt, options));
}

// ============================================================================
// Text Functions
// ============================================================================

/**
 * Generate text from a prompt
 *
 * @example
 * ```ts
 * const text = await generateText('Explain quantum computing simply');
 * console.log(text);
 * ```
 */
export async function generateText(
    prompt: string,
    options?: TextOptionsWithRaw,
): Promise<string> {
    const result = await getClient().text(prompt, options);
    return typeof result === "string" ? result : result.text;
}

/**
 * Generate text with streaming
 *
 * @example
 * ```ts
 * for await (const chunk of generateTextStream('Write a story')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export async function* generateTextStream(
    prompt: string,
    options?: TextGenerateOptions,
): AsyncGenerator<string> {
    yield* getClient().textStream(prompt, options);
}

/**
 * Chat with messages (OpenAI-compatible)
 *
 * @example
 * ```ts
 * const response = await chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * console.log(response.choices[0].message.content);
 * ```
 */
export async function chat(
    messages: Message[],
    options?: ChatOptions & WithRaw,
): Promise<ChatResponseExt> {
    return wrapChatResponse(await getClient().chat(messages, options));
}

/**
 * Chat with streaming
 */
export async function* chatStream(
    messages: Message[],
    options?: ChatOptions,
): AsyncGenerator<string> {
    const stream = getClient().chatStream(messages, options);
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (typeof content === "string") yield content;
    }
}

/**
 * Create a multi-turn conversation
 *
 * @example
 * ```ts
 * const conv = conversation({ system: 'You are a helpful assistant' });
 * const reply = await conv.say('Hello!');
 * const followUp = await conv.say('Tell me more');
 * ```
 */
export function conversation(options?: {
    system?: string;
    model?: string;
    apiKey?: string;
}): Conversation {
    return new Conversation(getClient(options?.apiKey), options);
}

// ============================================================================
// Video Functions
// ============================================================================

/**
 * Get a URL for a video
 *
 * @example
 * ```ts
 * const url = await videoUrl('A timelapse of clouds');
 * ```
 */
export async function videoUrl(
    prompt: string,
    options?: VideoGenerateOptions,
): Promise<string> {
    return getClient().videoUrl(prompt, options);
}

/**
 * Generate a video from a prompt
 *
 * @example
 * ```ts
 * const video = await generateVideo('A rocket launch');
 * await video.saveToFile('rocket.mp4');
 * ```
 */
export async function generateVideo(
    prompt: string,
    options?: VideoGenerateOptions,
): Promise<VideoResponseExt> {
    return wrapVideoResponse(await getClient().video(prompt, options));
}

// ============================================================================
// Audio Functions
// ============================================================================

/**
 * Generate audio (text-to-speech or music)
 *
 * @example
 * ```ts
 * const audio = await generateAudio('Hello world', { voice: 'alloy' });
 * await audio.saveToFile('hello.mp3');
 * ```
 */
export async function generateAudio(
    text: string,
    options?: AudioGenerateOptions,
): Promise<AudioResponseExt> {
    return wrapAudioResponse(await getClient().audio(text, options));
}

// ============================================================================
// Model Functions
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

// ============================================================================
// Transcription (STT) Functions
// ============================================================================

/**
 * Transcribe audio to text
 *
 * @example
 * ```ts
 * import fs from 'fs';
 * const audio = fs.readFileSync('speech.mp3');
 * const { text } = await transcribe(audio);
 * ```
 */
export async function transcribe(
    audio: ArrayBuffer | Blob,
    options: TranscribeOptions & { responseFormat: "verbose_json" },
): Promise<TranscriptionVerboseResponse>;
export async function transcribe(
    audio: ArrayBuffer | Blob,
    options?: TranscribeOptions,
): Promise<TranscriptionResponse>;
export async function transcribe(
    audio: ArrayBuffer | Blob,
    options?: TranscribeOptions,
): Promise<TranscriptionResponse | TranscriptionVerboseResponse> {
    return getClient().transcribe(audio, options as TranscribeOptions);
}

// ============================================================================
// Embedding Functions
// ============================================================================

/**
 * Create embeddings for text or multimodal input
 *
 * @example
 * ```ts
 * const { data } = await embed('Hello world');
 * console.log(data[0].embedding); // [0.012, -0.034, ...]
 * ```
 */
export async function embed(
    input: EmbeddingInput,
    options?: EmbeddingOptions,
): Promise<EmbeddingResponse> {
    return getClient().embeddings(input, options);
}

// ============================================================================
// Media Upload Functions
// ============================================================================

/**
 * Upload media and get a public URL
 *
 * @example
 * ```ts
 * const result = await upload(imageBuffer, {
 *   contentType: 'image/png'
 * });
 * console.log(result.url);
 * ```
 */
export async function upload(
    data: ArrayBuffer | Blob,
    options?: UploadOptions,
): Promise<UploadResponse> {
    return getClient().upload(data, options);
}

// ============================================================================
// Account Functions
// ============================================================================

/**
 * Get the authorization URL for the OAuth flow
 */
export function authorizeUrl(options?: AuthorizeOptions): string {
    return Pollinations.authorizeUrl(options);
}

/**
 * Start the device authorization flow (for CLI/headless apps)
 *
 * @example
 * ```ts
 * const auth = await authorizeDevice();
 * console.log(`Visit ${auth.verificationUri} and enter ${auth.userCode}`);
 * const token = await auth.waitForAuthorization();
 * ```
 */
export async function authorizeDevice(
    options?: AuthorizeDeviceOptions,
): Promise<DeviceAuthorization> {
    return getClient().authorizeDevice(options);
}

/**
 * Validate an API key
 */
export async function validateKey(apiKey: string): Promise<KeyInfo> {
    return Pollinations.validateKey(apiKey);
}

/**
 * Create a new API key
 */
export async function createKey(
    options?: CreateKeyOptions,
): Promise<CreatedKey> {
    return getClient().createKey(options);
}

/**
 * List all API keys
 */
export async function listKeys(): Promise<AccountKey[]> {
    return getClient().listKeys();
}

/**
 * Revoke an API key
 */
export async function revokeKey(keyId: string): Promise<void> {
    return getClient().revokeKey(keyId);
}

/**
 * Get account profile
 */
export async function getProfile(): Promise<AccountProfile> {
    return getClient().profile();
}

/**
 * Get account balance
 */
export async function getBalance(): Promise<AccountBalance> {
    return getClient().balance();
}

/**
 * Get usage records
 */
export async function getUsage(options?: UsageOptions): Promise<UsageResponse> {
    return getClient().usage(options);
}

/**
 * Get daily usage
 */
export async function getDailyUsage(
    options?: DailyUsageOptions,
): Promise<DailyUsageResponse> {
    return getClient().dailyUsage(options);
}

/**
 * Get key usage
 */
export async function getKeyUsage(
    keyId: string,
    options?: KeyUsageOptions,
): Promise<UsageResponse> {
    return getClient().keyUsage(keyId, options);
}

/**
 * Get user info
 */
export async function userInfo(): Promise<UserInfo> {
    return getClient().userInfo();
}

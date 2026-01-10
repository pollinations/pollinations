import type {
    ImageGenerateOptions,
    ImageResponse,
    VideoGenerateOptions,
    VideoResponse,
    ChatOptions,
    ChatResponse,
    Message,
} from "./types.js";
import { Pollinations } from "./client.js";

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
// Progress Status Type
// ============================================================================

/** Typed progress status */
export type ProgressStatus = "starting" | "generating" | "complete";

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert ArrayBuffer to base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    try {
        const g = globalThis as Record<string, unknown>;
        if (typeof g.Buffer === "function") {
            const NodeBuffer = g.Buffer as typeof Buffer;
            return NodeBuffer.from(buffer).toString("base64");
        }
    } catch {
        // Fall through to browser implementation
    }
    // Browser
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Check if running in Node.js environment */
function isNodeEnvironment(): boolean {
    try {
        const g = globalThis as Record<string, unknown>;
        if (g.process && typeof g.process === "object") {
            const proc = g.process as { versions?: { node?: string } };
            return typeof proc.versions?.node === "string";
        }
    } catch {
        return false;
    }
    return false;
}

/** Save buffer to file (Node.js only) */
async function saveBufferToFile(
    buffer: ArrayBuffer,
    path: string,
): Promise<void> {
    if (!isNodeEnvironment()) {
        throw new Error(
            "saveToFile() is only available in Node.js. In browsers, use toDataURL() or toBase64() instead.",
        );
    }

    // Dynamic import for Node.js fs - wrapped to avoid bundler issues
    const fsModule = "fs";
    const fs = await import(/* @vite-ignore */ fsModule).then(
        (m) => m.promises,
    );
    const g = globalThis as Record<string, unknown>;
    const NodeBuffer = g.Buffer as typeof Buffer;
    await fs.writeFile(path, NodeBuffer.from(buffer));
}

/** Wrap image response with helper methods */
export function wrapImageResponse(response: ImageResponse): ImageResponseExt {
    return {
        ...response,
        saveToFile: (path: string) => saveBufferToFile(response.buffer, path),
        toBase64: () => arrayBufferToBase64(response.buffer),
        toDataURL: () =>
            `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`,
    };
}

/** Wrap video response with helper methods */
export function wrapVideoResponse(response: VideoResponse): VideoResponseExt {
    return {
        ...response,
        saveToFile: (path: string) => saveBufferToFile(response.buffer, path),
        toBase64: () => arrayBufferToBase64(response.buffer),
        toDataURL: () =>
            `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`,
    };
}

/** Wrap chat response with extra metadata */
export function wrapChatResponse(response: ChatResponse): ChatResponseExt {
    const usage = response.usage;
    return {
        ...response,
        text: response.choices[0]?.message?.content || "",
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
// Batch Generation (for different prompts) - WITH ERROR HANDLING
// ============================================================================

/** Result of a batch generation attempt */
export interface BatchResult<T> {
    success: boolean;
    prompt?: string;
    result?: T;
    error?: Error;
}

/**
 * Generate multiple images from different prompts in parallel
 * Handles partial failures gracefully with detailed error info
 *
 * @example
 * ```ts
 * const results = await generateImages(['cat in space', 'dog underwater']);
 * results.forEach(r => {
 *   if (r.success) {
 *     console.log(`Generated: ${r.prompt}`);
 *   } else {
 *     console.error(`Failed: ${r.prompt}`, r.error);
 *   }
 * });
 * ```
 */
export async function generateImages(
    prompts: string[],
    options?: ImageGenerateOptions,
    client?: Pollinations,
): Promise<BatchResult<ImageResponseExt>[]> {
    const c = client || new Pollinations();

    const results = await Promise.allSettled(
        prompts.map(async (prompt) => ({
            prompt,
            result: wrapImageResponse(await c.image(prompt, options)),
        })),
    );

    return results.map((settlement, index) => {
        if (settlement.status === "fulfilled") {
            return {
                success: true,
                prompt: settlement.value.prompt,
                result: settlement.value.result,
            };
        } else {
            return {
                success: false,
                prompt: prompts[index],
                error:
                    settlement.reason instanceof Error
                        ? settlement.reason
                        : new Error(String(settlement.reason)),
            };
        }
    });
}

/**
 * Generate multiple videos from different prompts in parallel
 * Handles partial failures gracefully with detailed error info
 */
export async function generateVideos(
    prompts: string[],
    options?: VideoGenerateOptions,
    client?: Pollinations,
): Promise<BatchResult<VideoResponseExt>[]> {
    const c = client || new Pollinations();

    const results = await Promise.allSettled(
        prompts.map(async (prompt) => ({
            prompt,
            result: wrapVideoResponse(await c.video(prompt, options)),
        })),
    );

    return results.map((settlement, index) => {
        if (settlement.status === "fulfilled") {
            return {
                success: true,
                prompt: settlement.value.prompt,
                result: settlement.value.result,
            };
        } else {
            return {
                success: false,
                prompt: prompts[index],
                error:
                    settlement.reason instanceof Error
                        ? settlement.reason
                        : new Error(String(settlement.reason)),
            };
        }
    });
}

// ============================================================================
// Conversation Helper - SIMPLIFIED & IMPROVED
// ============================================================================

/** Conversation state manager */
export class Conversation {
    private messages: Message[] = [];
    private client: Pollinations;
    private options: ChatOptions;

    constructor(options: ChatOptions = {}, client?: Pollinations) {
        this.client = client || new Pollinations();
        this.options = { ...options }; // Deep copy options
    }

    /** Add a system message */
    system(content: string): this {
        this.messages.push({ role: "system", content });
        return this;
    }

    /** Add a user message without sending */
    user(content: string): this {
        this.messages.push({ role: "user", content });
        return this;
    }

    /** Add an assistant message manually */
    assistant(content: string): this {
        this.messages.push({ role: "assistant", content });
        return this;
    }

    /** Add a tool result message */
    tool(toolCallId: string, content: string): this {
        this.messages.push({ role: "tool", content, tool_call_id: toolCallId });
        return this;
    }

    /** Add any message directly */
    addMessage(message: Message): this {
        this.messages.push(message);
        return this;
    }

    /**
     * Send a message (user or tool messages) and get an assistant response
     * Automatically adds user message to history if content is provided
     *
     * @example
     * ```ts
     * const conv = new Conversation();
     * const response = await conv.say('Hello');
     * const followup = await conv.say('Explain that more');
     * ```
     */
    async say(content: string): Promise<ChatResponseExt> {
        this.messages.push({ role: "user", content });
        return this._sendAndAddResponse();
    }

    /**
     * Send current messages without adding a new user message
     * Useful after calling tool() or addMessage() with pre-composed messages
     *
     * @example
     * ```ts
     * const conv = new Conversation();
     * conv.user('Calculate 2+2');
     * const response = await conv.send();
     * ```
     */
    async send(): Promise<ChatResponseExt> {
        return this._sendAndAddResponse();
    }

    /** Internal: send and add response to history */
    private async _sendAndAddResponse(): Promise<ChatResponseExt> {
        const response = await this.client.chat(this.messages, this.options);
        const wrapped = wrapChatResponse(response);

        // Add full assistant message to history (including tool_calls if present)
        const assistantMessage: Message & { tool_calls?: unknown } = {
            role: "assistant",
            content: wrapped.text,
        };
        if (response.choices[0]?.message?.tool_calls) {
            assistantMessage.tool_calls =
                response.choices[0].message.tool_calls;
        }
        this.messages.push(assistantMessage as Message);

        return wrapped;
    }

    /** Get the conversation history */
    getHistory(): Message[] {
        return structuredClone(this.messages); // Deep copy for immutability
    }

    /** Clear the conversation history */
    clear(): this {
        this.messages = [];
        return this;
    }

    /**
     * Fork the conversation (create an independent copy).
     *
     * Creates a new Conversation with a deep copy of the message history.
     * Note: The forked conversation shares the same Pollinations client instance,
     * which is intentional for efficiency. The client is stateless and thread-safe.
     *
     * @example
     * ```ts
     * const main = new Conversation();
     * await main.say('Hello');
     *
     * // Fork to explore a different path
     * const branch = main.fork();
     * await branch.say('What if we went this way?');
     *
     * // Original conversation is unaffected
     * await main.say('Let me continue the main topic');
     * ```
     */
    fork(): Conversation {
        const forked = new Conversation(this.options, this.client);
        forked.messages = structuredClone(this.messages); // Deep copy
        return forked;
    }

    /** Get message count */
    get length(): number {
        return this.messages.length;
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
    client?: Pollinations,
): Promise<HTMLImageElement> {
    if (typeof document === "undefined") {
        throw new Error("showImage is only available in browsers");
    }

    const c = client || new Pollinations();
    const img = document.createElement("img");
    img.alt = prompt;
    img.src = await c.imageUrl(prompt, options);

    const target =
        typeof container === "string"
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
    container: string | HTMLElement,
): HTMLImageElement {
    if (typeof document === "undefined") {
        throw new Error("displayImage is only available in browsers");
    }

    const img = document.createElement("img");

    // Check if it has toDataURL (extended response)
    if ("toDataURL" in response) {
        img.src = response.toDataURL();
    } else {
        img.src = `data:${response.contentType};base64,${arrayBufferToBase64(response.buffer)}`;
    }

    const target =
        typeof container === "string"
            ? document.querySelector(container)
            : container;

    if (!target) {
        throw new Error(`Container not found: ${container}`);
    }

    target.appendChild(img);
    return img;
}

// ============================================================================
// Token Estimation (with disclaimers)
// ============================================================================

/**
 * Rough token estimation for planning purposes only.
 * This is a very approximate estimate (~4 chars per token for English text).
 *
 * **IMPORTANT**: Actual tokenization varies significantly by model and language.
 * Use this only for rough capacity planning, not for precise billing calculations.
 * For production billing, use actual token counts from API responses.
 *
 * @deprecated Consider using the `tokens` property on ChatResponseExt for actual counts
 */
export function estimateTokens(text: string): number {
    // Rough heuristic: ~4 characters per token for English
    // Highly inaccurate for code, non-Latin scripts, etc.
    return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message array (rough approximation)
 *
 * **IMPORTANT**: This is a very rough estimate. Actual token counts depend on model,
 * formatting, and tokenization algorithm. Use only for planning.
 *
 * @deprecated Use actual token counts from ChatResponseExt.tokens instead
 */
export function estimateMessageTokens(messages: Message[]): {
    estimated: number;
    breakdown: { role: string; tokens: number }[];
} {
    const breakdown = messages.map((msg) => {
        const content =
            typeof msg.content === "string"
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
// Utility: Image Generation with Progress Tracking
// ============================================================================

/** Options for generation with progress tracking */
export interface AwaitOptions {
    /** Polling interval in ms (default: 1000) */
    pollInterval?: number;
    /** Timeout in ms (default: 300000 = 5 min) */
    timeout?: number;
    /** Progress callback - guaranteed to fire on complete/error */
    onProgress?: (status: { elapsed: number; status: ProgressStatus }) => void;
}

/**
 * Generate image with typed progress tracking
 * Progress callback is guaranteed to be cleaned up even on errors
 *
 * @example
 * ```ts
 * const img = await generateImageWithProgress('A cat', {
 *   onProgress: (status) => {
 *     if (status.status === 'complete') console.log('Done!');
 *   }
 * });
 * ```
 */
export async function generateImageWithProgress(
    prompt: string,
    options?: ImageGenerateOptions & AwaitOptions,
    client?: Pollinations,
): Promise<ImageResponseExt> {
    const {
        onProgress,
        pollInterval = 1000,
        timeout = 300000,
        ...imageOptions
    } = options || {};
    const c = client || new Pollinations();
    const startTime = Date.now();

    if (onProgress) {
        onProgress({ elapsed: 0, status: "starting" });
    }

    const progressInterval = onProgress
        ? setInterval(() => {
              const elapsed = Date.now() - startTime;
              onProgress({ elapsed, status: "generating" });
          }, pollInterval)
        : null;

    try {
        const result = await Promise.race([
            c.image(prompt, imageOptions),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(`Generation timeout after ${timeout}ms`),
                        ),
                    timeout,
                ),
            ),
        ]);

        if (onProgress) {
            onProgress({ elapsed: Date.now() - startTime, status: "complete" });
        }

        return wrapImageResponse(result);
    } finally {
        // Always clear interval - even on errors
        if (progressInterval !== null) {
            clearInterval(progressInterval);
        }
    }
}

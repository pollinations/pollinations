import type {
    AudioBinaryResponse,
    ChatResponse,
    ImageResponse,
    VideoResponse,
} from "./types.js";

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

/** Extended audio response with helper methods */
export interface AudioResponseExt extends AudioBinaryResponse {
    /** Save audio to file (Node.js only) */
    saveToFile: (path: string) => Promise<void>;
    /** Get as base64 string */
    toBase64: () => string;
    /** Get as data URL (ready for audio src) */
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

/** Wrap audio response with helper methods */
export function wrapAudioResponse(
    response: AudioBinaryResponse,
): AudioResponseExt {
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

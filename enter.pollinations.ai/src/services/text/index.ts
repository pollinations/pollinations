/**
 * Text Generation Service for Cloudflare Workers
 *
 * This module provides text generation capabilities migrated from text.pollinations.ai.
 * It's designed to run in a Cloudflare Worker environment with native fetch and Web Streams.
 */

// Re-export transforms
export * from "./transforms/index.js";

// Re-export prompts
export {
    BASE_PROMPTS,
    midijourneyPrompt,
    chickyTutorPrompt,
} from "./prompts.js";

// Re-export configs
export * from "./configs/index.js";

// Types
export interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: unknown[];
}

export interface TextGenerationOptions {
    model: string;
    messages: Message[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    seed?: number;
    tools?: unknown[];
    tool_choice?: unknown;
    response_format?: { type: string; schema?: unknown };
    [key: string]: unknown;
}

export interface TextGenerationResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message?: Message;
        delta?: Partial<Message>;
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Placeholder for the main text generation function.
 * This will be implemented to call Portkey gateway directly.
 *
 * For now, the proxy.ts continues to forward requests to text.pollinations.ai.
 * This function will be used when we're ready to handle generation directly.
 */
export async function generateText(
    _options: TextGenerationOptions,
    _env: Record<string, string>,
): Promise<TextGenerationResponse | ReadableStream> {
    throw new Error(
        "Direct text generation not yet implemented. Use proxy to text.pollinations.ai for now.",
    );
}

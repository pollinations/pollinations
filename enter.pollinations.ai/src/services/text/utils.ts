/**
 * Utility functions for the text generation service
 * Cloudflare Worker compatible (no Node.js dependencies)
 */

import type { Message, TextGenerationResponse } from "./types.js";

/**
 * Validates and ensures each message has required properties
 */
export function validateAndNormalizeMessages(messages: unknown[]): Message[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages must be a non-empty array");
    }

    return messages.map((msg) => {
        const m = msg as Record<string, unknown>;
        const normalizedMsg: Message = {
            role: (m.role as Message["role"]) || "user",
            content: (m.content as string) || "",
        };

        // Preserve properties needed for function calling
        if (m.tool_call_id)
            normalizedMsg.tool_call_id = m.tool_call_id as string;
        if (m.name) normalizedMsg.name = m.name as string;
        if (m.tool_calls)
            normalizedMsg.tool_calls = m.tool_calls as Message["tool_calls"];

        return normalizedMsg;
    });
}

/**
 * Normalizes options with default values and validates ranges
 */
export function normalizeOptions(
    options: Record<string, unknown> = {},
    defaults: Record<string, unknown> = {},
): Record<string, unknown> {
    const normalized = { ...defaults, ...options };

    // Handle streaming option - ensure it's properly normalized to a boolean
    if (normalized.stream !== undefined) {
        if (
            normalized.stream === "true" ||
            normalized.stream === "1" ||
            normalized.stream === "yes"
        ) {
            normalized.stream = true;
        } else if (
            normalized.stream === "false" ||
            normalized.stream === "0" ||
            normalized.stream === "no"
        ) {
            normalized.stream = false;
        } else {
            normalized.stream = Boolean(normalized.stream);
        }
    } else {
        normalized.stream = false;
    }

    // Ensure temperature is within valid range (0-3)
    if (normalized.temperature !== undefined) {
        normalized.temperature = Math.max(
            0,
            Math.min(3, normalized.temperature as number),
        );
    }

    // Ensure top_p is within valid range (0-1)
    if (normalized.top_p !== undefined) {
        normalized.top_p = Math.max(0, Math.min(1, normalized.top_p as number));
    }

    // Ensure presence_penalty is within valid range (-2 to 2)
    if (normalized.presence_penalty !== undefined) {
        normalized.presence_penalty = Math.max(
            -2,
            Math.min(2, normalized.presence_penalty as number),
        );
    }

    // Ensure frequency_penalty is within valid range (-2 to 2)
    if (normalized.frequency_penalty !== undefined) {
        normalized.frequency_penalty = Math.max(
            -2,
            Math.min(2, normalized.frequency_penalty as number),
        );
    }

    // Ensure seed is an integer
    if (typeof normalized.seed === "number") {
        normalized.seed = Math.floor(normalized.seed);
    }

    // Handle maxTokens -> max_tokens mapping
    if (normalized.maxTokens !== undefined) {
        normalized.max_tokens = normalized.maxTokens;
        delete normalized.maxTokens;
    }

    // Handle jsonMode -> response_format conversion
    if (normalized.jsonMode) {
        if (!normalized.response_format) {
            normalized.response_format = { type: "json_object" };
        }
        delete normalized.jsonMode;
    }

    return normalized;
}

/**
 * Formats a response to match OpenAI's format
 */
export function formatToOpenAIResponse(
    response: unknown,
    modelName: string,
): TextGenerationResponse {
    const r = response as Record<string, unknown>;

    // If already in OpenAI format with choices array, return as is
    if (r.choices && Array.isArray(r.choices)) {
        return response as TextGenerationResponse;
    }

    // If it's an error response, return it directly
    if (r.error) {
        return response as TextGenerationResponse;
    }

    // Create a message object based on the response
    const message: Message = {
        role: "assistant",
        content: "",
    };

    // Handle different response formats
    if (typeof response === "string") {
        message.content = response;
    } else if (r.tool_calls) {
        message.tool_calls = r.tool_calls as Message["tool_calls"];
        message.content = (r.content as string) || "";
    } else {
        message.content = JSON.stringify(response);
    }

    // Create a basic OpenAI-compatible response structure
    return {
        id: `pllns_${Date.now().toString(36)}`,
        object: "chat.completion",
        created: Date.now(),
        model: modelName,
        choices: [
            {
                message,
                finish_reason: "stop",
                index: 0,
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
    return Math.random().toString(36).substring(7);
}

/**
 * Removes undefined values from an object (shallow)
 */
export function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
    const result = {} as T;
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            (result as Record<string, unknown>)[key] = value;
        }
    }
    return result;
}

/**
 * Removes undefined and null values from an object (shallow)
 */
export function cleanNullAndUndefined<T extends Record<string, unknown>>(
    obj: T,
): T {
    const result = {} as T;
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
            (result as Record<string, unknown>)[key] = value;
        }
    }
    return result;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
    error: Error | { message?: string; code?: number },
): {
    error: { message: string; code: number };
} {
    return {
        error: {
            message: error.message || "An unexpected error occurred",
            code: (error as { code?: number }).code || 500,
        },
    };
}

/**
 * Parses SSE (Server-Sent Events) data from a string
 */
export function parseSSEData(data: string): unknown | null {
    if (data === "[DONE]") {
        return null;
    }
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Creates an SSE formatted string
 */
export function formatSSE(data: unknown): string {
    return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates the final SSE done message
 */
export function formatSSEDone(): string {
    return "data: [DONE]\n\n";
}

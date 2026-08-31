import { getEncoding } from "js-tiktoken";
import type { ChatMessage } from "./types.js";

const encoding = getEncoding("cl100k_base");

export function countTokens(text: string): number {
    return encoding.encode(text).length;
}

export function countPromptTokens(messages: ChatMessage[]): number {
    let tokens = 3;
    for (const message of messages) {
        tokens += 3 + countTokens(message.role) + countTokens(message.content);
        if (message.name) tokens += countTokens(message.name);
    }
    return tokens;
}

export function completionLimit(request: {
    max_tokens?: number;
    max_completion_tokens?: number;
}): number | undefined {
    const limits = [request.max_tokens, request.max_completion_tokens].filter(
        (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value > 0,
    );
    return limits.length > 0 ? Math.min(...limits) : undefined;
}

export function truncateToTokens(
    text: string,
    limit: number | undefined,
): { text: string; truncated: boolean; tokens: number } {
    const tokens = encoding.encode(text);
    if (limit === undefined || tokens.length <= limit) {
        return { text, truncated: false, tokens: tokens.length };
    }
    return {
        text: encoding.decode(tokens.slice(0, limit)),
        truncated: true,
        tokens: limit,
    };
}

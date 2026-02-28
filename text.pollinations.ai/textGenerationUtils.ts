import debug from "debug";
import type { ChatMessage, TransformOptions } from "./types.js";

const log = debug("pollinations:utils");

export function validateAndNormalizeMessages(messages: unknown): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages must be a non-empty array");
    }

    return messages.map((raw: unknown) => {
        const msg = raw as ChatMessage;
        const hasToolContext = msg.tool_calls || msg.role === "tool";
        let content: string | null;
        if (hasToolContext) {
            content = msg.content != null ? String(msg.content) : null;
        } else {
            content = msg.content ? String(msg.content) : "";
        }

        const normalizedMsg: ChatMessage = {
            role: msg.role || "user",
            content,
        };

        if (msg.tool_call_id) normalizedMsg.tool_call_id = msg.tool_call_id;
        if (msg.name) normalizedMsg.name = msg.name;
        if (msg.tool_calls) normalizedMsg.tool_calls = msg.tool_calls;
        if (msg.function_call) normalizedMsg.function_call = msg.function_call;
        if (msg.reasoning_content)
            normalizedMsg.reasoning_content = msg.reasoning_content;
        if (msg.audio) normalizedMsg.audio = msg.audio;

        return normalizedMsg;
    });
}

const TRUTHY_STRINGS = new Set(["true", "1", "yes"]);
const FALSY_STRINGS = new Set(["false", "0", "no"]);

function parseStreamOption(value: unknown): boolean {
    if (value === undefined) return false;
    if (typeof value === "string") {
        if (TRUTHY_STRINGS.has(value)) return true;
        if (FALSY_STRINGS.has(value)) return false;
    }
    return Boolean(value);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function normalizeOptions(
    options: Record<string, unknown> = {},
    defaults: Record<string, unknown> = {},
): TransformOptions {
    const normalized = { ...defaults, ...options } as TransformOptions &
        Record<string, unknown>;

    normalized.stream = parseStreamOption(normalized.stream);
    log("Normalized stream option to %s", normalized.stream);

    if (normalized.temperature !== undefined) {
        normalized.temperature = clamp(normalized.temperature, 0, 3);
    }
    if (normalized.top_p !== undefined) {
        normalized.top_p = clamp(normalized.top_p, 0, 1);
    }
    if (normalized.presence_penalty !== undefined) {
        normalized.presence_penalty = clamp(normalized.presence_penalty, -2, 2);
    }
    if (normalized.frequency_penalty !== undefined) {
        normalized.frequency_penalty = clamp(
            normalized.frequency_penalty,
            -2,
            2,
        );
    }

    if (typeof normalized.seed === "number") {
        normalized.seed = Math.floor(normalized.seed);
    }

    if (normalized.maxTokens !== undefined) {
        normalized.max_tokens = normalized.maxTokens as number;
        delete normalized.maxTokens;
    }

    if (normalized.jsonMode) {
        if (!normalized.response_format) {
            normalized.response_format = { type: "json_object" };
        }
        delete normalized.jsonMode;
    }

    return normalized;
}

export function generateRequestId(): string {
    return Math.random().toString(36).substring(7);
}

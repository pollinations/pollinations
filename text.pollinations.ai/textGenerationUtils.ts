import debug from "debug";

const log = debug("pollinations:utils");

interface Message {
    role: string;
    content: string;
    tool_call_id?: string;
    name?: string;
    tool_calls?: unknown[];
}

interface NormalizedOptions {
    stream: boolean;
    temperature?: number;
    top_p?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    repetition_penalty?: number;
    seed?: number;
    max_tokens?: number;
    response_format?: { type: string };
    model?: string;
    [key: string]: unknown;
}

/**
 * Validates and ensures each message has required properties.
 */
export function validateAndNormalizeMessages(messages: unknown): Message[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages must be a non-empty array");
    }

    return messages.map((msg: any) => {
        const normalizedMsg: Message = {
            role: msg.role || "user",
            content: msg.content || "",
        };

        if (msg.tool_call_id) normalizedMsg.tool_call_id = msg.tool_call_id;
        if (msg.name) normalizedMsg.name = msg.name;
        if (msg.tool_calls) normalizedMsg.tool_calls = msg.tool_calls;

        return normalizedMsg;
    });
}

/**
 * Converts system messages to user messages for models that don't support system messages.
 */
export function convertSystemToUserMessages(messages: Message[]): Message[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        return messages;
    }

    log("Converting system messages to user messages");

    return messages.map((msg) => {
        if (msg.role === "system") {
            log(
                "Converting system message to user message:",
                `${msg.content.substring(0, 50)}...`,
            );
            return {
                ...msg,
                role: "user",
                content: `System instruction: ${msg.content}`,
            };
        }
        return msg;
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

/**
 * Normalizes options with default values and validates numeric ranges.
 */
export function normalizeOptions(
    options: any = {},
    defaults: any = {},
): NormalizedOptions {
    const normalized: any = { ...defaults, ...options };

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
    if (normalized.repetition_penalty !== undefined) {
        normalized.repetition_penalty = clamp(
            normalized.repetition_penalty,
            0,
            2,
        );
    }

    if (typeof normalized.seed === "number") {
        normalized.seed = Math.floor(normalized.seed);
    }

    if (normalized.maxTokens !== undefined) {
        normalized.max_tokens = normalized.maxTokens;
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

/**
 * Generates a unique request ID.
 */
export function generateRequestId(): string {
    return Math.random().toString(36).substring(7);
}

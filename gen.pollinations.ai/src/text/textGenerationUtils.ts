import debug from "debug";
import type { ChatMessage, ServiceError, TransformOptions } from "./types.js";

const log = debug("pollinations:utils");
const MESSAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const SEMANTIC_NAME_ROLES = new Set(["tool", "function"]);

function normalizeMessageName(name: unknown, role: string): string | undefined {
    if (name === undefined || name === null) return undefined;
    if (typeof name === "string" && MESSAGE_NAME_PATTERN.test(name)) {
        return name;
    }
    if (SEMANTIC_NAME_ROLES.has(role)) {
        const error = new Error(
            `Invalid message name for role '${role}'. Names must match ^[a-zA-Z0-9_-]{1,64}$.`,
        ) as ServiceError;
        error.status = 400;
        throw error;
    }
    log("Dropped invalid message name for role=%s: %s", role, String(name));
    return undefined;
}

/**
 * Apply the compatibility repairs required by upstream providers without
 * discarding provider-specific message fields.
 */
export function prepareMessages(messages: unknown): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
        const error = new Error(
            "Messages must be a non-empty array",
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    return messages.map((raw) => {
        const message = raw as ChatMessage;
        const role = message.role || "user";
        const hasToolContext = Boolean(message.tool_calls) || role === "tool";
        const content = hasToolContext
            ? (message.content ?? null)
            : (message.content ?? "");
        const name = normalizeMessageName(message.name, role);
        const {
            name: _name,
            role: _role,
            content: _content,
            ...extensions
        } = message;

        return {
            ...extensions,
            role,
            content,
            ...(name ? { name } : {}),
        };
    });
}

export function normalizeOptions(
    options: Record<string, unknown> = {},
    defaults: Record<string, unknown> = {},
): TransformOptions {
    const normalized = { ...defaults, ...options } as TransformOptions &
        Record<string, unknown>;

    normalized.stream = Boolean(normalized.stream);
    if (normalized.jsonMode) {
        normalized.response_format ??= { type: "json_object" };
        delete normalized.jsonMode;
    }

    return normalized;
}

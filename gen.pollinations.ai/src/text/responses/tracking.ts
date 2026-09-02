import type { Usage } from "@shared/registry/registry.ts";
import { responsesUsageToUsage } from "@shared/registry/usage-headers.ts";
import { ResponseTerminalEventSchema } from "@shared/schemas/openai.ts";

export const RESPONSE_TERMINAL_EVENT_TYPES = new Set([
    "response.completed",
    "response.incomplete",
    "response.failed",
]);

export function normalizeResponsesTerminalEvent(
    event: unknown,
    sseEvent?: string,
): unknown {
    if (
        !sseEvent ||
        !RESPONSE_TERMINAL_EVENT_TYPES.has(sseEvent) ||
        !event ||
        typeof event !== "object" ||
        typeof (event as { type?: unknown }).type === "string"
    ) {
        return event;
    }
    return { ...(event as Record<string, unknown>), type: sseEvent };
}

export function getResponsesEventUsage(
    event: unknown,
): { model?: string; usage: Usage } | null {
    const parsed = ResponseTerminalEventSchema.safeParse(event);
    if (!parsed.success) return null;
    return {
        ...(parsed.data.response.model
            ? { model: parsed.data.response.model }
            : {}),
        usage: responsesUsageToUsage(parsed.data.response.usage),
    };
}

export function isResponsesFailure(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const event = value as {
        type?: unknown;
        status?: unknown;
        response?: { status?: unknown };
    };
    return (
        event.type === "response.failed" ||
        event.status === "failed" ||
        event.response?.status === "failed"
    );
}

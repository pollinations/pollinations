import type { Usage } from "@shared/registry/registry.ts";
import { responsesUsageToUsage } from "@shared/registry/usage-headers.ts";
import { ResponseUsageSchema } from "@shared/schemas/openai.ts";

export function getResponsesUsage(value: unknown): Usage | null {
    if (!value || typeof value !== "object") return null;
    const usage = (value as { usage?: unknown }).usage;
    const parsed = ResponseUsageSchema.safeParse(usage);
    return parsed.success ? responsesUsageToUsage(parsed.data) : null;
}

export function getResponsesEventUsage(
    event: unknown,
): { model?: string; usage: Usage } | null {
    if (!event || typeof event !== "object") return null;
    const responseEvent = event as {
        type?: unknown;
        response?: { model?: unknown; usage?: unknown };
    };
    if (
        responseEvent.type !== "response.completed" &&
        responseEvent.type !== "response.incomplete" &&
        responseEvent.type !== "response.failed"
    ) {
        return null;
    }

    const parsed = ResponseUsageSchema.safeParse(responseEvent.response?.usage);
    if (!parsed.success) return null;
    return {
        ...(typeof responseEvent.response?.model === "string"
            ? { model: responseEvent.response.model }
            : {}),
        usage: responsesUsageToUsage(parsed.data),
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

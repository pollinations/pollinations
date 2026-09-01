import type { Usage } from "@shared/registry/registry.ts";
import { responsesUsageToUsage } from "@shared/registry/usage-headers.ts";
import { ResponseTerminalEventSchema } from "@shared/schemas/openai.ts";

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

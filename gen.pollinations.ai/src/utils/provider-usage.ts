import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";

export type ProviderUsageEvidence = Pick<
    TinybirdEvent,
    | "providerResponseId"
    | "providerUpstreamReported"
    | "providerReportedCostUsd"
>;

/** Provider response evidence, never an input to the caller's Pollen price. */
export function providerUsageEvidence(
    provider: string | undefined,
    output: unknown,
): ProviderUsageEvidence {
    if (!output || typeof output !== "object") return {};
    const streamEvents = (output as { streamEvents?: unknown }).streamEvents;
    const events = Array.isArray(streamEvents) ? streamEvents : [output];
    const evidence: ProviderUsageEvidence = {};
    for (const event of events) {
        if (!event || typeof event !== "object") continue;
        const envelope = event as Record<string, unknown>;
        const response =
            typeof envelope.type === "string" &&
            envelope.type.startsWith("response.") &&
            envelope.response &&
            typeof envelope.response === "object"
                ? (envelope.response as Record<string, unknown>)
                : envelope;
        if (typeof response.id === "string" && response.id) {
            evidence.providerResponseId = response.id;
        }
        if (
            provider === "openrouter" &&
            typeof response.provider === "string" &&
            response.provider
        ) {
            evidence.providerUpstreamReported = response.provider;
        }
        const usage = response.usage;
        if (
            provider !== "openrouter" ||
            !usage ||
            typeof usage !== "object" ||
            !("cost" in usage)
        ) {
            continue;
        }
        // OpenRouter usage.cost is the account charge in USD credits, not
        // cost_details.upstream_inference_cost (a different supplier's cost).
        // https://openrouter.ai/docs/cookbook/administration/usage-accounting
        // Usage arrives in the terminal SSE message. Keep the last valid report, never sum.
        const cost = usage.cost;
        const valid =
            typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
        if (valid) {
            evidence.providerReportedCostUsd = cost;
        }
    }
    return evidence;
}

import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";

export type ProviderUsageEvidence = Pick<
    TinybirdEvent,
    | "providerResponseId"
    | "providerModelReported"
    | "providerReportedCostUsd"
    | "providerCostSource"
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
        if (typeof response.model === "string" && response.model) {
            evidence.providerModelReported = response.model;
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
        // Streaming values are cumulative: retain the last report, never sum.
        const cost = usage.cost;
        const valid =
            typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
        evidence.providerReportedCostUsd = valid ? cost : undefined;
        evidence.providerCostSource = valid
            ? "openrouter.usage.cost"
            : undefined;
    }
    return evidence;
}

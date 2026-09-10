/** Reported account charge, never an input to the caller's Pollen price. */
export function getProviderReportedCostUsd(
    provider: string | undefined,
    output: unknown,
): number | undefined {
    if (provider !== "openrouter" || !output || typeof output !== "object")
        return undefined;
    const streamEvents = (output as { streamEvents?: unknown }).streamEvents;
    const events = Array.isArray(streamEvents) ? streamEvents : [output];
    let reportedCost: number | undefined;
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
        const usage = response.usage;
        if (!usage || typeof usage !== "object" || !("cost" in usage)) {
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
            reportedCost = cost;
        }
    }
    return reportedCost;
}

import type { BillingRules } from "./registry";

// Owner-declared per-call tool fees for community endpoints (the community
// analogue of gemini-billing/perplexity-billing). The owner declares
// {"<tool>": <pollen per call>}; the endpoint reports how many calls each
// request made in `usage.tool_call_counts` ({"web_search": 2}), on the final
// usage-bearing event for streams. Each declared tool becomes one adjustment
// rule billed count × price.
export type CommunityToolPrices = Record<string, number>;

export const COMMUNITY_TOOL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

type ToolCallCountsOutput = {
    usage?: { tool_call_counts?: unknown };
    streamEvents?: unknown[];
};

// Counters walk raw provider output and must never throw — a throw here
// happens before the deduction/event path in track.ts, so it would skip
// billing AND the tracking event. Guard every shape assumption.
function readReportedToolCallCount(output: unknown, toolName: string): number {
    const o = output as ToolCallCountsOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    for (const event of [...events].reverse()) {
        const counts = (event as ToolCallCountsOutput | undefined)?.usage
            ?.tool_call_counts;
        if (counts === null || typeof counts !== "object") continue;
        const value = (counts as Record<string, unknown>)[toolName];
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            console.error(
                `[billing] malformed usage.tool_call_counts.${toolName} (${JSON.stringify(value)}) — billed as 0`,
            );
            return 0;
        }
        return Math.floor(value);
    }
    return 0;
}

export function communityToolBillingRules(
    toolPrices: CommunityToolPrices,
): BillingRules | undefined {
    const adjustments = Object.entries(toolPrices)
        .filter(
            ([name, price]) =>
                COMMUNITY_TOOL_NAME_PATTERN.test(name) &&
                Number.isFinite(price) &&
                price > 0,
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, price]) => ({
            id: `community.tool.${name}.v1`,
            description: `Owner-declared ${name} tool fee: ${price} Pollen per call, billed on usage.tool_call_counts.${name}.`,
            kind: "tool_call",
            unit: "call",
            unitCost: price,
            countUnits: (output: unknown) =>
                readReportedToolCallCount(output, name),
        }));
    return adjustments.length > 0 ? { adjustments } : undefined;
}

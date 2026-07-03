import type { BillingRules } from "./registry";

type PerplexityCostOutput = {
    usage?: {
        cost?: {
            request_cost?: unknown;
        };
        search_context_size?: unknown;
    };
    streamEvents?: unknown[];
};

// Reject provider-reported request_cost that would poison the ledger.
const PROVIDER_COST_CLAMP_FACTOR = 10;

// Distinguish "no cost object at all" (expected regression case) from "cost
// object present but request_cost malformed" (should alert louder).
type ProviderRequestCostRead =
    | { status: "absent" }
    | { status: "malformed"; raw: unknown }
    | { status: "ok"; value: number };

// Read `usage.cost.request_cost` from a single response or stream event.
function readProviderRequestCost(event: unknown): ProviderRequestCostRead {
    const cost = (event as PerplexityCostOutput | undefined)?.usage?.cost;
    if (cost == null) return { status: "absent" };
    if (typeof cost !== "object") return { status: "malformed", raw: cost };
    if (!("request_cost" in cost)) return { status: "absent" };
    const value = cost.request_cost;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return { status: "malformed", raw: value };
    }
    return { status: "ok", value };
}

function getPerplexityReportedRequestCost(
    output: unknown,
): ProviderRequestCostRead {
    const o = output as PerplexityCostOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    for (const event of [...events].reverse()) {
        const read = readProviderRequestCost(event);
        if (read.status !== "absent") return read;
    }
    return { status: "absent" };
}

function getReportedSearchContextSize(output: unknown): string | undefined {
    const o = output as PerplexityCostOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    for (const event of [...events].reverse()) {
        const size = (event as PerplexityCostOutput | undefined)?.usage
            ?.search_context_size;
        if (typeof size === "string") return size;
    }
    return undefined;
}

// Resolve the per-request cost via clamp-and-alert (never throws):
//  - absent provider cost       → static fee + WARN (Perplexity-regression signal)
//  - malformed provider cost    → static fee + ERROR
//  - provider cost > 10× static → clamp to static fee + ERROR
//  - otherwise                  → provider-reported cost verbatim
// The gateway pins the search tier per model alias (callers cannot override
// web_search_options), so a reported `search_context_size` that differs from
// the pinned tier means the pin drifted — logged as WARN.
function resolvePerplexityRequestCost(args: {
    output: unknown;
    modelId: string;
    ruleId: string;
    staticFee: number;
    expectedSearchContextSize: string;
}): number {
    const { output, modelId, ruleId, staticFee, expectedSearchContextSize } =
        args;

    const reported = getReportedSearchContextSize(output);
    if (reported && reported !== expectedSearchContextSize) {
        console.warn(
            `[billing] perplexity search_context_size drift: model=${modelId} rule=${ruleId} expected=${expectedSearchContextSize} reported=${reported} — static fee assumed the expected tier`,
        );
    }

    const read = getPerplexityReportedRequestCost(output);
    if (read.status === "absent") {
        // Expected for non-stream Perplexity until the gateway cost-preserving
        // fix deploys. WARN so a persistent absence is visible without paging.
        console.warn(
            `[billing] provider request_cost absent for model=${modelId} rule=${ruleId} — using static fee ${staticFee}`,
        );
        return staticFee;
    }
    if (read.status === "malformed") {
        console.error(
            `[billing] malformed provider request_cost (${JSON.stringify(read.raw) ?? String(read.raw)}) for model=${modelId} rule=${ruleId} — using static fee ${staticFee}`,
        );
        return staticFee;
    }
    if (read.value > staticFee * PROVIDER_COST_CLAMP_FACTOR) {
        console.error(
            `[billing] provider request_cost ${read.value} exceeds 10× static fee ${staticFee} for model=${modelId} rule=${ruleId} — clamped to static fee`,
        );
        return staticFee;
    }
    return read.value;
}

function createPerplexitySearchBilling(
    id: string,
    description: string,
    unitCost: number,
    expectedSearchContextSize: string,
): BillingRules {
    return {
        adjustments: [
            {
                id,
                description,
                kind: "search_request",
                unit: "request",
                unitCost,
                countUnits: () => 1,
                resolveUnitCost: (output, modelId) =>
                    resolvePerplexityRequestCost({
                        output,
                        modelId,
                        ruleId: id,
                        staticFee: unitCost,
                        expectedSearchContextSize,
                    }),
            },
        ],
    };
}

export const PERPLEXITY_FAST_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_low.search_request.v1",
    "Perplexity Search adds $5 / 1K requests for low search context.",
    5 / 1000,
    "low",
);

export const PERPLEXITY_DEEP_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_high.search_request.v1",
    "Perplexity Search adds $12 / 1K requests for high search context.",
    12 / 1000,
    "high",
);

export const PERPLEXITY_PRO_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_pro_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    14 / 1000,
    "high",
);

export const PERPLEXITY_REASONING_BILLING = createPerplexitySearchBilling(
    "perplexity.sonar_reasoning_high.search_request.v1",
    "Perplexity Search adds $14 / 1K requests for high search context.",
    14 / 1000,
    "high",
);

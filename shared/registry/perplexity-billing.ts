import type { PricingInput } from "./cost-variants";
import type { BillingRules } from "./registry";

type SearchContextSize = "low" | "medium" | "high";
const SEARCH_CONTEXT_SIZES: SearchContextSize[] = ["low", "medium", "high"];

type PerplexityUsageOutput = {
    usage?: {
        cost?: number | { request_cost?: unknown };
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
    | { status: "total" }
    | { status: "malformed"; raw: unknown }
    | { status: "ok"; value: number };

// Usage events newest first: a stream reports usage in its last event.
function usageEvents(output: unknown): PerplexityUsageOutput[] {
    const o = output as PerplexityUsageOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    return [...events].reverse() as PerplexityUsageOutput[];
}

// Read `usage.cost.request_cost` from a single response or stream event.
function readProviderRequestCost(
    event: PerplexityUsageOutput,
): ProviderRequestCostRead {
    const cost = event?.usage?.cost;
    if (cost == null) return { status: "absent" };
    // OpenRouter reports the total charge here, including tokens. Its native
    // Sonar search fees use the same context-tier rates as direct Perplexity.
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
        return { status: "total" };
    }
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
    for (const event of usageEvents(output)) {
        const read = readProviderRequestCost(event);
        if (read.status !== "absent") return read;
    }
    return { status: "absent" };
}

function isSearchContextSize(value: unknown): value is SearchContextSize {
    return SEARCH_CONTEXT_SIZES.includes(value as SearchContextSize);
}

/**
 * The tier Perplexity charged for: what the response reports, else what the
 * caller asked for (OpenRouter reports only a total), else Perplexity's default.
 */
function billedSearchContextSize(
    output: unknown,
    input?: PricingInput,
): SearchContextSize {
    for (const event of usageEvents(output)) {
        const size = event?.usage?.search_context_size;
        if (isSearchContextSize(size)) return size;
    }
    return input?.searchContextSize ?? "low";
}

// Resolve the per-request cost via clamp-and-alert (never throws):
//  - OpenRouter total cost      → static search fee (tokens billed separately)
//  - absent provider cost       → static fee + WARN (Perplexity-regression signal)
//  - malformed provider cost    → static fee + ERROR
//  - provider cost > 10× static → clamp to static fee + ERROR
//  - otherwise                  → provider-reported cost verbatim
function resolvePerplexityRequestCost(args: {
    output: unknown;
    model: string;
    ruleId: string;
    staticFee: number;
}): number {
    const { output, model, ruleId, staticFee } = args;
    const read = getPerplexityReportedRequestCost(output);
    if (read.status === "total") return staticFee;
    if (read.status === "absent") {
        // Expected for non-stream Perplexity until the gateway cost-preserving
        // fix deploys. WARN so a persistent absence is visible without paging.
        console.warn(
            `[billing] provider request_cost absent for model=${model} rule=${ruleId} — using static fee ${staticFee}`,
        );
        return staticFee;
    }
    if (read.status === "malformed") {
        console.error(
            `[billing] malformed provider request_cost (${JSON.stringify(read.raw) ?? String(read.raw)}) for model=${model} rule=${ruleId} — using static fee ${staticFee}`,
        );
        return staticFee;
    }
    if (read.value > staticFee * PROVIDER_COST_CLAMP_FACTOR) {
        console.error(
            `[billing] provider request_cost ${read.value} exceeds 10× static fee ${staticFee} for model=${model} rule=${ruleId} — clamped to static fee`,
        );
        return staticFee;
    }
    return read.value;
}

/** One request-fee rule per search context size, in USD per 1K requests. */
function perplexitySearchBilling(
    family: string,
    feesPerThousand: Record<SearchContextSize, number>,
): BillingRules {
    return {
        adjustments: SEARCH_CONTEXT_SIZES.map((size) => {
            const id = `perplexity.${family}_${size}.search_request.v1`;
            const unitCost = feesPerThousand[size] / 1000;
            return {
                id,
                description: `Perplexity Search adds $${feesPerThousand[size]} / 1K requests for ${size} search context.`,
                kind: "search_request",
                unit: "request",
                unitCost,
                publicPricing: {
                    label: "Search",
                    quantity: 1_000,
                    unit: "requests",
                    option: {
                        group: "search_context",
                        value: size,
                        label: `${size[0].toUpperCase()}${size.slice(1)} search context`,
                        ...(size === "low" && { default: true }),
                    },
                },
                countUnits: (output, input) =>
                    billedSearchContextSize(output, input) === size ? 1 : 0,
                resolveUnitCost: (output, model) =>
                    resolvePerplexityRequestCost({
                        output,
                        model,
                        ruleId: id,
                        staticFee: unitCost,
                    }),
            };
        }),
    };
}

export const PERPLEXITY_SONAR_BILLING = perplexitySearchBilling("sonar", {
    low: 5,
    medium: 8,
    high: 12,
});

export const PERPLEXITY_PRO_BILLING = perplexitySearchBilling("sonar_pro", {
    low: 6,
    medium: 10,
    high: 14,
});

export const PERPLEXITY_REASONING_BILLING = perplexitySearchBilling(
    "sonar_reasoning",
    { low: 6, medium: 10, high: 14 },
);

import { getLogger } from "@logtape/logtape";
import {
    calculateUsageBilling,
    type Usage,
} from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    USAGE_MISSING_HEADER,
    USAGE_TYPE_HEADERS,
} from "@shared/registry/usage-headers.ts";
import {
    getHistoricalPriceRange,
    getModelStats,
} from "@shared/utils/model-stats.ts";
import { HTTPException } from "hono/http-exception";
import { getGenerationModelRegistry } from "../model-registry.ts";
import { quoteGenerationRequest } from "../utils/request-pricing.ts";

const MIN_CHARGE_USD = 0.001;
const MAX_X402_OUTPUT_TOKENS = 4096;
export type X402Request = {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
};

export type X402Quote = {
    model: string;
    scheme: "exact" | "upto";
    maximum: number;
    usage: Usage;
};

function normalizedUsd(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Invalid x402 price");
    return Math.max(
        MIN_CHARGE_USD,
        Math.ceil((amount - Number.EPSILON) * 1_000_000) / 1_000_000,
    );
}

export function usdPrice(amount: number): string {
    return `$${normalizedUsd(amount).toFixed(6)}`;
}

async function modelEntry(env: CloudflareBindings, model: string) {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model: "${model}"`,
        });
    }
    return entry;
}

export async function quoteX402Request(
    env: CloudflareBindings,
    request: X402Request,
): Promise<X402Quote> {
    const entry = await modelEntry(env, request.body.model as string);
    if (
        entry.eventType === "generate.text" &&
        Number(request.body.max_tokens) > MAX_X402_OUTPUT_TOKENS
    ) {
        throw new HTTPException(400, {
            message: `x402 max_tokens cannot exceed ${MAX_X402_OUTPUT_TOKENS}`,
        });
    }
    const quote = quoteGenerationRequest(entry, request.body);
    if (!quote) {
        throw new HTTPException(400, {
            message:
                "This request has no supported x402 spending ceiling; use a Pollinations API key.",
        });
    }
    const stats = await getModelStats(env.KV, getLogger(["x402"]));
    const range = getHistoricalPriceRange(stats, entry.id, entry.aliases);
    if (!range) {
        throw new HTTPException(400, {
            message:
                "This model does not have enough pricing history for x402; use a Pollinations API key.",
        });
    }
    const fixed = range.minimum === range.maximum;
    return {
        ...quote,
        model: entry.id,
        scheme: fixed ? "exact" : "upto",
        maximum: normalizedUsd(fixed ? range.minimum : quote.maximum),
    };
}

function parseUsage(headers: Headers, quote: X402Quote): Usage {
    if (headers.get(USAGE_MISSING_HEADER) === "true") {
        throw new Error("Model usage headers are missing");
    }
    if (
        quote.usage.promptTextTokens !== undefined &&
        !headers.has(USAGE_TYPE_HEADERS.promptTextTokens) &&
        !headers.has(USAGE_TYPE_HEADERS.promptCachedTokens)
    ) {
        throw new Error("Missing prompt usage header");
    }
    for (const unit of Object.keys(quote.usage) as (keyof Usage)[]) {
        if (unit === "promptTextTokens") continue;
        if (!headers.has(USAGE_TYPE_HEADERS[unit])) {
            throw new Error(`Missing ${unit} usage header`);
        }
    }

    const usage: Usage = {};
    let found = false;
    for (const [usageType, header] of Object.entries(USAGE_TYPE_HEADERS)) {
        const raw = headers.get(header);
        if (raw === null) continue;
        found = true;
        const value = Number(raw);
        if (!raw.trim() || !Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Invalid usage header: ${header}`);
        }
        usage[usageType as keyof Usage] = value;
    }
    if (!found) throw new Error("Model usage headers are missing");
    return usage;
}

export async function billX402Usage(
    env: CloudflareBindings,
    quote: X402Quote,
    headers: Headers,
) {
    const usedModel = headers.get(MODEL_USED_HEADER);
    if (!usedModel) throw new Error("Model usage headers are missing");
    const served = await modelEntry(env, usedModel);

    // Pollen prices fallbacks against the requested listing. Keep that same
    // quoted-model contract here; the served-model header is still required as
    // evidence that generation produced metered usage.
    const quoted = await modelEntry(env, quote.model);
    const usage = parseUsage(headers, quote);
    const billing = calculateUsageBilling({
        model: quote.model,
        usage,
        servedBy: served.definition,
        quotedBy: quoted.definition,
    });
    // Exact is the advertised historical price, not a usage estimate to reconcile.
    const totalPrice =
        quote.scheme === "exact"
            ? quote.maximum
            : normalizedUsd(billing.price.totalPrice);
    if (totalPrice > quote.maximum) {
        throw new Error("Actual usage exceeds the authorized maximum");
    }
    return { billing, usage, totalPrice, quoted, served, modelUsed: usedModel };
}

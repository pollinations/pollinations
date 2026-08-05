import type { BillingAdjustmentRule, BillingRules } from "./registry";

const PER_MILLION = 1_000_000;

type RealtimeBillingOutput = {
    realtimeCache?: {
        audioTokens?: unknown;
        imageTokens?: unknown;
    };
};

function countCachedTokens(
    output: unknown,
    modality: "audio" | "image",
): number {
    const value = output as RealtimeBillingOutput | undefined;
    const tokens = value?.realtimeCache?.[`${modality}Tokens`];
    return typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0
        ? tokens
        : 0;
}

function cachedTokenAdjustment(
    modality: "audio" | "image",
    rate: number,
    cachedTextRate: number,
): BillingAdjustmentRule {
    return {
        id: `openai.realtime.cached_${modality}_delta.v1`,
        description: `Cached ${modality} input costs $${rate.toFixed(2)}/M instead of the $${cachedTextRate.toFixed(2)}/M cached-text base rate.`,
        kind: `cached_${modality}_input`,
        unit: "token",
        unitCost: (rate - cachedTextRate) / PER_MILLION,
        countUnits: (output) => countCachedTokens(output, modality),
    };
}

// Generic cached input is billed at the cached-text rate. The provider reports
// cached audio and image tokens separately, so these rules add only the
// modality-specific difference and keep both usage and totals exact.
export const OPENAI_REALTIME_CACHE_BILLING: BillingRules = {
    adjustments: [cachedTokenAdjustment("image", 0.5, 0.4)],
};

export const OPENAI_REALTIME_2_1_MINI_CACHE_BILLING: BillingRules = {
    adjustments: [
        cachedTokenAdjustment("audio", 0.3, 0.06),
        cachedTokenAdjustment("image", 0.08, 0.06),
    ],
};

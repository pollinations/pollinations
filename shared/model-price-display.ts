/**
 * Balance calculation utilities
 *
 * Uses explicit free pricing or real usage data from Tinybird (rolling 7-day
 * median). Returns "—" when no data is available—no theoretical estimates.
 */

import { formatCount } from "@pollinations/ui";
import type { ModelInfo } from "./registry/model-info.ts";

/** Agents can spend on downstream calls even when their wrapper has no price. */
export function hasFreePricing(
    model: Partial<
        Pick<
            ModelInfo,
            "agent" | "pricing" | "pricing_variants" | "pricing_adjustments"
        >
    >,
): boolean {
    const hasRate = (rates: Record<string, string>) =>
        Object.values(rates).some((value) => Number(value) > 0);
    return (
        !model.agent &&
        model.pricing !== undefined &&
        !hasRate(model.pricing) &&
        !model.pricing_variants?.some(({ pricing }) => hasRate(pricing)) &&
        !model.pricing_adjustments?.some(({ price }) => Number(price) > 0)
    );
}

/** Format a rolling median-derived estimate as a coarse count. */
function formatEstimate(num: number): string {
    if (num < 1) return "<1";
    if (num < 10) return Math.round(num).toString();
    if (num < 100) return (Math.round(num / 5) * 5).toString();
    const rounded = Math.round(num / 50) * 50;
    if (rounded < 1000) return rounded.toString();
    return formatCount(Math.round(num / 100) * 100);
}

// Measured cost wins over the declared price. An agent lists as free because it
// charges no wrapper price, but it spends the caller's balance on the models and
// tools it calls — "∞" would be a lie. A genuinely free model never clears the
// stats pipe's priced-request floor, so it has no measured cost and still
// reads "∞".
export function calculatePerPollen(model: {
    realAvgCost?: number | null;
    free?: boolean;
}): string {
    if (model.realAvgCost != null && model.realAvgCost > 0) {
        return formatEstimate(1 / model.realAvgCost);
    }
    if (model.free) return "∞";
    return "—";
}

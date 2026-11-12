/**
 * Pollen calculation utilities
 *
 * Uses explicit free pricing or real usage data from Tinybird (rolling 7-day
 * median). Returns "—" when no data is available—no theoretical estimates.
 */

import { formatCount } from "@pollinations/ui";
import type { ModelPrice } from "./types.ts";

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
export function calculatePerPollen(model: ModelPrice): string {
    if (model.realAvgCost !== undefined && model.realAvgCost > 0) {
        return formatEstimate(1 / model.realAvgCost);
    }
    if (model.free) return "∞";
    return "—";
}

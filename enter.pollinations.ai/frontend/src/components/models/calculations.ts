/**
 * Pollen calculation utilities
 *
 * Only uses real usage data from Tinybird (rolling 7-day average).
 * Returns "—" when no data is available - no theoretical estimates.
 */

import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import millify from "millify";
import type { ModelPrice } from "./types.ts";

export const TOP_UP_TOOLTIP = "🔒 Top up to use this model";

/** Format number as coarse estimate (not precise - it's an average) */
function formatCount(num: number): string {
    if (num < 1) return "1";
    if (num < 10) return Math.round(num).toString();
    if (num < 100) return (Math.round(num / 5) * 5).toString();
    if (num < 1000) return (Math.round(num / 50) * 50).toString();
    return millify(Math.round(num / 100) * 100, { precision: 1 });
}

/**
 * Calculate "Per Pollen" value for a model.
 * Uses real average base price from Tinybird when available (rolling 7-day average).
 * Returns "—" when no data is available.
 */
export function calculatePerPollen(model: ModelPrice): string {
    if (model.realAvgBasePrice && model.realAvgBasePrice > 0) {
        const unitsPerPollen = 1 / model.realAvgBasePrice;
        return formatCount(unitsPerPollen);
    }

    return "—";
}

export function canAffordModel(
    model: ModelPrice,
    rewardBalance: number,
    paidBalance: number,
    isPaidOnly: boolean,
): boolean {
    const cost = model.realAvgBasePrice ?? 0;
    return canCoverEstimatedCharge(
        { rewardBalance, paidBalance },
        cost,
        isPaidOnly,
    );
}

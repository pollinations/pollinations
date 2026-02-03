/**
 * Pollen calculation utilities
 *
 * Only uses real usage data from Tinybird (rolling 7-day average).
 * Returns "—" when no data is available - no theoretical estimates.
 */

import millify from "millify";
import type { ModelPrice } from "./types.ts";

/** Format number as coarse estimate (not precise - it's an average) */
const formatCount = (num: number): string => {
    if (num < 1) return "1";
    if (num < 10) return Math.round(num).toString(); // 1, 2, 5
    if (num < 100) return (Math.round(num / 5) * 5).toString(); // 10, 15, 50
    if (num < 1000) return (Math.round(num / 50) * 50).toString(); // 100, 150, 500
    return millify(Math.round(num / 100) * 100, { precision: 1 }); // 1.5K, 2K
};

/**
 * Calculate "Per Pollen" value for a model.
 * Uses real average cost from Tinybird when available (rolling 7-day average).
 * Returns "—" when no data is available.
 */
export const calculatePerPollen = (model: ModelPrice): string => {
    // Only use real usage data from Tinybird
    if (model.realAvgCost && model.realAvgCost > 0) {
        const unitsPerPollen = 1 / model.realAvgCost;
        return formatCount(unitsPerPollen);
    }

    // No data available
    return "—";
};

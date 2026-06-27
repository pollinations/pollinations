/**
 * Pollen calculation utilities
 *
 * Only uses real usage data from Tinybird (rolling 7-day average).
 * Returns "—" when no data is available - no theoretical estimates.
 */

import type { ModelPrice } from "./types.ts";

/** Abbreviate a value >= 1000 as K/M/B with one decimal (locale-stable, "1.5K"). */
function compact(num: number): string {
    for (const [divisor, suffix] of [
        [1e9, "B"],
        [1e6, "M"],
        [1e3, "K"],
    ] as const) {
        if (num >= divisor) {
            const value = Math.round((num / divisor) * 10) / 10;
            return `${value}${suffix}`;
        }
    }
    return num.toString();
}

/** Format number as coarse estimate (not precise - it's an average) */
function formatCount(num: number): string {
    if (num < 1) return "1";
    if (num < 10) return Math.round(num).toString();
    if (num < 100) return (Math.round(num / 5) * 5).toString();
    const rounded = Math.round(num / 50) * 50;
    if (rounded < 1000) return rounded.toString();
    return compact(Math.round(num / 100) * 100);
}

/**
 * Calculate "Per Pollen" value for a model.
 * Uses real average cost from Tinybird when available (rolling 7-day average).
 * Returns undefined when no data is available.
 */
export function calculatePerPollenValue(model: ModelPrice): number | undefined {
    if (model.realAvgCost && model.realAvgCost > 0) {
        return 1 / model.realAvgCost;
    }

    return undefined;
}

export function calculatePerPollen(model: ModelPrice): string {
    const unitsPerPollen = calculatePerPollenValue(model);
    if (unitsPerPollen !== undefined) {
        return formatCount(unitsPerPollen);
    }

    return "—";
}

/** Coarse unit noun per model type, used in the "1 pollen ≈ …" column. */
export const unitLabels: Record<string, string> = {
    text: "responses",
    image: "images",
    video: "videos",
    audio: "responses",
    realtime: "sessions",
    community: "responses",
    embedding: "embeddings",
};

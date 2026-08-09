/**
 * Pollen calculation utilities
 *
 * Uses explicit free pricing or real usage data from Tinybird (rolling 7-day
 * average). Returns "—" when no data is available—no theoretical estimates.
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

export function calculatePerPollen(model: ModelPrice): string {
    if (model.free) return "∞";
    if (model.realAvgCost !== undefined && model.realAvgCost > 0) {
        return formatCount(1 / model.realAvgCost);
    }
    return "—";
}

/** Coarse unit noun per model type, used in generation estimate tooltips. */
export const unitLabels: Record<string, string> = {
    text: "responses",
    image: "images",
    video: "videos",
    "3d": "3D models",
    audio: "responses",
    realtime: "sessions",
    community: "responses",
    embedding: "embeddings",
};

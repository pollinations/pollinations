import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "bytedance/seedream-5.0-lite:fal";
export const parent = "bytedance/seedream-5.0-lite";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-01").getTime(),
    maxReferenceImages: 10,
} satisfies FallbackDefinition;

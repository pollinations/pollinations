import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "alibaba/wan-2.2-fast:fal";
export const parent = "alibaba/wan-2.2-fast";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-02").getTime(),
    // Fal charges $0.05 per fixed 5-second 480p generation. The
    // inherited $0.01/second sheet bills the caller the same $0.05, so
    // this fallback has no loss for either text-to-video or image-to-video.
} satisfies FallbackDefinition;

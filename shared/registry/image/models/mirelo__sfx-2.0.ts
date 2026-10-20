import type { ModelDefinition } from "../../registry";
export const id = "mirelo/sfx-2.0";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Mirelo AI",
    category: "video",
    addedDate: new Date("2026-10-15").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal's price per returned second: $0.010 during Mirelo's launch
    // promo, $0.015 from 2026-12-14. Charges use fal's reported seconds at
    // its live endpoint price.
    cost: { completionVideoSeconds: 0.01 },
    // The output keeps the source video's dimensions.
    resolutions: ["source"],
    title: "Mirelo SFX 2.0",
    description: "Adds synchronized sound effects to an existing video",
    inputModalities: ["text", "video"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["reference_videos", "audio_output"],
    maxReferenceVideos: 1,
    // Up to the first 120 seconds of the source; fal bills the seconds it returns.
    minDuration: 1,
    maxDuration: 120,
    defaultDuration: 120,
} satisfies ModelDefinition;

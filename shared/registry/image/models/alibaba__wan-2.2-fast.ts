import type { ModelDefinition } from "../../registry";
export const id = "alibaba/wan-2.2-fast";

export default {
    aliases: ["wan2.2", "wan-2.2", "wan-fast"],
    provider: "replicate",
    publisher: "Alibaba",
    category: "video",
    addedDate: new Date("2026-03-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate wan-2.2-fast, locked to 480p. Silent, fixed ~5s clip billed
    // flat ($0.01/s x 5s = $0.05).
    cost: {
        promptImageTokens: 0,
        completionVideoSeconds: 0.01, // per sec (480p, silent)
    },
    resolutions: ["480p"],
    title: "Wan 2.2",
    description: "Cheap 5-second silent clips at 480p — great for quick drafts",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame", "end_frame"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 5,
    maxDuration: 5,
    defaultDuration: 5,
} satisfies ModelDefinition;

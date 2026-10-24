import type { ModelDefinition } from "../../registry";
export const id = "x-ai/grok-imagine-video";

export default {
    aliases: ["grok-imagine-video", "grok-video-pro"],
    provider: "fal",
    publisher: "xAI",
    category: "video",
    addedDate: new Date("2026-03-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptImageTokens: 0.002, // per start-frame image
        completionVideoSeconds: 0.07, // per sec at 720p
    },
    resolutions: ["720p"],
    title: "Grok Video Pro",
    description: "Short videos from text or an image (720p, 1-15s)",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 1,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;

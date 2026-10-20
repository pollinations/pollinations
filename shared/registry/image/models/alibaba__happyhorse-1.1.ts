import type { ModelDefinition } from "../../registry";
export const id = "alibaba/happyhorse-1.1";

export default {
    aliases: ["happyhorse", "happy-horse-1.1", "happyhorse-1.1"],
    provider: "openrouter",
    publisher: "Alibaba",
    category: "video",
    addedDate: new Date("2026-07-18").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionVideoSeconds: 0.0988 * 1.055, // per sec at 720p
    },
    resolutions: ["720p"],
    title: "HappyHorse 1.1",
    description: "Text and first-frame video generation at 720p",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame"],
    maxReferenceImages: 1,
    minDuration: 3,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;

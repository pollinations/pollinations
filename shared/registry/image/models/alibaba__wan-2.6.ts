import type { ModelDefinition } from "../../registry";
export const id = "alibaba/wan-2.6";

export default {
    aliases: ["wan2.6", "wan-i2v", "wan"],
    provider: "alibaba",
    publisher: "Alibaba",
    category: "video",
    addedDate: new Date("2026-01-21").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Alibaba wan2.6-t2v / wan2.6-i2v, locked to 720p ($0.10/s). Native audio is bundled
    // into the per-second rate, so there is no separate audio line.
    cost: {
        completionVideoSeconds: 0.1, // per sec (720p, includes audio)
    },
    resolutions: ["720p"],
    title: "Wan 2.6",
    description:
        "Video with sound from text or an image (720p, 5/10/15s clips)",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame", "audio_output"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 5,
    maxDuration: 15,
    defaultDuration: 5,
    allowedDurations: [5, 10, 15],
} satisfies ModelDefinition;

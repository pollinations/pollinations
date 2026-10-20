import type { ModelDefinition } from "../../registry";
export const id = "bytedance/seedance-2.0-fast";

export default {
    aliases: ["seedance-2.0-fast"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "video",
    addedDate: new Date("2026-08-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate non_video_in 480p tier; 720p misses the latency limit.
    cost: {
        completionVideoSeconds: 0.07,
    },
    resolutions: ["480p"],
    title: "Seedance 2.0 Fast",
    description:
        "Short 4–5 second video with synchronized sound and first/last-frame control at 480p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 4,
    maxDuration: 5,
    defaultDuration: 5,
} satisfies ModelDefinition;

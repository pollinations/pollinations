import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "google/veo-3.1-fast";

export default {
    aliases: [
        "veo-3.1-fast",
        "veo-720p",
        "video",
        "veo-1080p",
        "veo-3.1-fast-1080p",
        "veo-1080",
        "veo",
    ],
    provider: "google",
    publisher: "Google",
    category: "video",
    addedDate: new Date("2025-11-27").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        completionVideoSeconds: 0.08, // per sec (720p video)
        completionAudioSeconds: 0.02, // per sec when audio is enabled
    },
    ...defineCostVariants(
        {
            "1080p": {
                completionVideoSeconds: 0.1, // per sec (1080p video)
            },
        },
        matchResolution("1080p"),
        {
            "1080p": {
                label: "1080p",
                description:
                    "Applies when the requested video resolution is 1080p.",
            },
        },
        "720p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "720p",
                    "1080p": "1080p",
                },
            },
        ],
    ),
    resolutions: ["720p", "1080p"],
    // Omitted size/audio used to give portrait video with billed audio.
    cacheVersion: "2026-09-30-landscape-audio-opt-in",
    title: "Veo 3.1 Fast",
    description: "Fast video with optional audio at 720p or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 4,
    maxDuration: 8,
    defaultDuration: 4,
    allowedDurations: [4, 6, 8],
} satisfies ModelDefinition;

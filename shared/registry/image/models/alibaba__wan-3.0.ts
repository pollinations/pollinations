import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "alibaba/wan-3.0";

export default {
    aliases: ["wan-3.0"],
    provider: "alibaba",
    publisher: "Alibaba",
    category: "video",
    addedDate: new Date("2026-08-25").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Alibaba Prime Singapore list rates; input video is also billed.
    cost: {
        promptVideoSeconds: 0.068,
        completionVideoSeconds: 0.068, // per sec at 480p
    },
    ...defineCostVariants(
        {
            "720p": {
                promptVideoSeconds: 0.14,
                completionVideoSeconds: 0.14,
            },
            "1080p": {
                promptVideoSeconds: 0.28,
                completionVideoSeconds: 0.28,
            },
        },
        matchResolution("720p", "1080p"),
        {
            "720p": {
                label: "720p",
                description:
                    "Applies when the requested video resolution is 720p.",
            },
            "1080p": {
                label: "1080p",
                description:
                    "Applies when the requested video resolution is 1080p.",
            },
        },
        "480p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "480p",
                    "720p": "720p",
                    "1080p": "1080p",
                },
            },
        ],
    ),
    resolutions: ["480p", "720p", "1080p"],
    title: "Wan 3.0",
    description:
        "Five-second video from text, start/end frames, or reference media with optional audio at 480p, 720p, or 1080p",
    inputModalities: ["text", "image", "video", "audio"],
    outputModalities: ["video", "audio"],
    videoCapabilities: [
        "start_frame",
        "end_frame",
        "audio_output",
        "reference_images",
        "reference_videos",
        "reference_audios",
    ],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 5,
    maxDuration: 5,
    defaultDuration: 5,
} satisfies ModelDefinition;

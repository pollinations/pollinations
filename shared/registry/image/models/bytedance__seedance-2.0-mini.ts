import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "bytedance/seedance-2.0-mini";

export default {
    aliases: ["seedance-2.0-mini"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "video",
    addedDate: new Date("2026-08-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate non_video_in tiers: 480p $0.04/s, 720p $0.09/s.
    cost: {
        completionVideoSeconds: 0.09,
    },
    ...defineCostVariants(
        {
            "480p": {
                completionVideoSeconds: 0.04,
            },
        },
        matchResolution("480p"),
        {
            "480p": {
                label: "480p",
                description:
                    "Applies when the requested video resolution is 480p.",
            },
        },
        "720p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "720p",
                    "480p": "480p",
                },
            },
        ],
    ),
    resolutions: ["720p", "480p"],
    title: "Seedance 2.0 Mini",
    description:
        "Lower-cost 4–10 second video with synchronized sound and first/last-frame control at 480p or 720p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 4,
    maxDuration: 10,
    defaultDuration: 5,
} satisfies ModelDefinition;

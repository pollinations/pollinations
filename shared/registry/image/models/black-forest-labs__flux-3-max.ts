import { defineCostVariants, matchResolution } from "../../cost-variants";

export const id = "black-forest-labs/flux-3-max";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Black Forest Labs",
    category: "video",
    addedDate: new Date("2026-10-20").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal.ai FLUX 3 Max promotional per-second rates (2026-10-20), 75% off
    // through 2026-11-07. List after the promotion: $0.17/s at 720p and
    // $0.29/s at 1080p (follow-up PR). fal's page lists no separate audio rate.
    cost: { completionVideoSeconds: 0.0425 },
    ...defineCostVariants(
        {
            "1080p": { completionVideoSeconds: 0.0725 },
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
                key: "resolution",
                label: "Resolution",
                values: { "": "720p", "1080p": "1080p" },
            },
        ],
    ),
    resolutions: ["720p", "1080p"],
    title: "FLUX 3 Max",
    description:
        "Fast video from text or start and end frames with optional synchronized audio at 720p or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 5,
    maxDuration: 20,
    defaultDuration: 5,
} satisfies ModelDefinition;

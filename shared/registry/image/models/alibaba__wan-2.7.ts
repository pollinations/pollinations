import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "alibaba/wan-2.7";

export default {
    aliases: [
        "wan2.7",
        "wan-2.7",
        "wan-pro-1080p",
        "wan2.7-1080p",
        "wan-pro-1080",
        "wan-pro",
    ],
    provider: "replicate",
    publisher: "Alibaba",
    category: "video",
    addedDate: new Date("2026-05-26").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate wan-2.7. Audio is bundled into the per-second rate. T2V and
    // R2V are $0.10/s at both resolutions; I2V is $0.10/s at 720p and
    // $0.15/s at 1080p. R2V never sets hasImage, so it always lands on the
    // base or "1080p" sheet and avoids the I2V surcharge.
    cost: {
        completionVideoSeconds: 0.1, // per sec (720p, includes audio; also R2V)
    },
    ...defineCostVariants(
        {
            "1080p": {
                completionVideoSeconds: 0.1,
            },
            "1080p_image": {
                completionVideoSeconds: 0.15,
            },
        },
        ({ input }) => {
            if (input?.resolution !== "1080p") return undefined;
            return input.hasImage ? "1080p_image" : "1080p";
        },
        {
            "1080p": {
                label: "1080p text-to-video",
                description:
                    "Applies to 1080p requests without an input image.",
            },
            "1080p_image": {
                label: "1080p image-to-video",
                description: "Applies to 1080p requests with an input image.",
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
                    "1080p_image": "1080p",
                },
            },
            {
                "key": "input",
                "label": "Input",
                "values": {
                    "": "Any",
                    "1080p": "Text/video",
                    "1080p_image": "Image",
                },
            },
        ],
    ),
    resolutions: ["720p", "1080p"],
    title: "Wan 2.7",
    description:
        "Keyframe-controlled video with sound at 720p or 1080p; also accepts reference images and videos",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["video", "audio"],
    videoCapabilities: [
        "start_frame",
        "end_frame",
        "audio_output",
        "reference_images",
        "reference_videos",
    ],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 2,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;

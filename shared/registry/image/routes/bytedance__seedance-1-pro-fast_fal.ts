import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "bytedance/seedance-1-pro-fast:fal";
export const parent = "bytedance/seedance-1-pro-fast";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-01").getTime(),
    cost: { completionVideoSeconds: 0.0216 },
    ...defineCostVariants(
        {
            "480p": { completionVideoSeconds: 0.0096 },
            "1080p": { completionVideoSeconds: 0.0486 },
        },
        matchResolution("480p", "1080p"),
        {
            "480p": {
                label: "480p",
                description:
                    "Applies when the requested video resolution is 480p.",
            },
            "1080p": {
                label: "1080p",
                description:
                    "Applies when the requested video resolution is 1080p.",
            },
        },
        "720p",
    ),
} satisfies FallbackDefinition;

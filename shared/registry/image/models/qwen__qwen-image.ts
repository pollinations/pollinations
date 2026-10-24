import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "qwen/qwen-image";

export default {
    aliases: [
        "qwen-image-plus",
        "qwen-image-2512",
        "qwen-image-edit",
        "qwen-image-edit-plus",
        "qwen-image",
    ],
    provider: "replicate",
    publisher: "Qwen",
    category: "image",
    addedDate: new Date("2026-03-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Moved off Alibaba DashScope to Replicate: qwen/qwen-image (t2i,
    // $0.025) + qwen/qwen-image-edit-plus (edit, $0.03).
    cost: {
        completionImageTokens: 0.025, // per t2i image
    },
    ...defineCostVariants(
        {
            edit: {
                completionImageTokens: 0.03, // per edited image
            },
        },
        ({ input }) => (input?.hasImage ? "edit" : undefined),
        {
            edit: {
                label: "Image editing",
                description:
                    "Applies when the request includes one or more input images.",
            },
        },
        "Image generation",
        [
            {
                "key": "operation",
                "label": "Operation",
                "values": {
                    "": "Generation",
                    "edit": "Editing",
                },
            },
        ],
    ),
    title: "Qwen Image",
    description:
        "Versatile image creation and editing, strong at text inside images",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 3, // Replicate qwen-image-edit-plus works best with 1 to 3.
} satisfies ModelDefinition;

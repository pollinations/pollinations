import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/stem-separation";

export default {
    aliases: [],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-09-26").getTime(),
    priceMultiplier: 1,
    // Workspace analytics: 20s input costs $0.10 (six) or $0.05 (two).
    cost: { promptAudioSeconds: 0.3 / 60 },
    ...defineCostVariants(
        { two_stems_v1: { promptAudioSeconds: 0.15 / 60 } },
        ({ input }) =>
            input?.stemVariation === "two_stems_v1"
                ? "two_stems_v1"
                : undefined,
        {
            two_stems_v1: {
                label: "Two stems",
                description:
                    "Vocals and instrumental; stem_variation_id=two_stems_v1.",
            },
        },
        "Six stems",
        [
            {
                key: "stem_variation_id",
                label: "Stems",
                values: { "": "Six", two_stems_v1: "Two" },
            },
        ],
    ),
    title: "ElevenLabs Stem Separation",
    description:
        "Separate vocals and instruments into two or six downloadable audio tracks",
    inputModalities: ["audio"],
    outputModalities: ["audio"],
    supportedEndpoints: ["/alpha/audio/stem-separation"],
} satisfies ModelDefinition;

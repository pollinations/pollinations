import { CSM_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "sesame/csm-1b";

export default {
    aliases: ["csm", "sesame-csm", "sesame-csm-1b", "csm-1b"],
    provider: "deepinfra",
    publisher: "Sesame",
    category: "audio",
    addedDate: new Date("2026-07-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // DeepInfra bills CSM by input character: $7 per 1M characters.
        completionAudioTokens: 7 / 1_000_000,
    },
    title: "CSM 1B",
    description:
        "English conversational speech with six reading and dialogue voices",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...CSM_VOICES],
} satisfies ModelDefinition;

import { GPT_5_6_SOL_COST, GPT_5_6_SOL_COST_VARIANTS } from "./openai-pricing";
import type { ModelDefinition } from "./registry";

/** Pollinations-owned prompt agents served directly by Gen. */
export const AGENT_SERVICES = {
    midijourney: {
        aliases: [],
        provider: "azure",
        brand: "Pollinations",
        category: "text",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 0.5,
        cost: GPT_5_6_SOL_COST,
        ...GPT_5_6_SOL_COST_VARIANTS,
        title: "MIDI Journey",
        description: "Turns musical ideas into playable MIDI notation",
        isSpecialized: true,
        agent: true,
        baseModel: "gpt-5.6-sol",
    },
} as const satisfies Record<string, ModelDefinition>;

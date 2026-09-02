import { GPT_5_6_SOL_SERVICE } from "./openai-models";
import type { ModelDefinition } from "./registry";

type AgentIdentity = Pick<
    ModelDefinition,
    "brand" | "addedDate" | "title" | "description"
>;

function defineAgent(
    baseModel: string,
    base: ModelDefinition,
    identity: AgentIdentity,
): ModelDefinition {
    return {
        ...base,
        aliases: [],
        ...identity,
        agent: true,
        baseModel,
    };
}

/** Pollinations-owned prompt agents served directly by Gen. */
export const AGENT_SERVICES = {
    midijourney: defineAgent("gpt-5.6-sol", GPT_5_6_SOL_SERVICE, {
        brand: "Pollinations",
        addedDate: new Date("2025-10-07").getTime(),
        title: "MIDI Journey",
        description: "Turns musical ideas into playable MIDI notation",
    }),
} as const satisfies Record<string, ModelDefinition>;

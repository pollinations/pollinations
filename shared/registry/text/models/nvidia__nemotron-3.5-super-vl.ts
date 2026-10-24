import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3.5-super-vl";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterNemotronSuperVl,
    aliases: [],
    provider: "deepinfra",
    publisher: "NVIDIA",
    category: "text",
    addedDate: new Date("2026-10-15").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // DeepInfra direct fp4 list rates (2026-10-23). No gateway fee.
        promptTextTokens: perMillion(0.15),
        promptCachedTokens: perMillion(0.02),
        completionTextTokens: perMillion(0.5),
    },
    title: "NVIDIA Nemotron 3.5 Super VL",
    description:
        "Open-weight reasoning over text and image inputs, with tool calling and structured output",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;

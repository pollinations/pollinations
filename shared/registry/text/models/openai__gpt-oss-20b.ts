import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-oss-20b";

export default {
    supportedParameters: CHAT_PARAMETERS.ovhGptOss,
    aliases: ["gpt-oss-20b", "ovh-reasoning", "gpt-oss"],
    provider: "ovhcloud",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.05),
        completionTextTokens: perMillion(0.18),
    },
    title: "GPT-OSS 20B",
    description:
        "Compact open-weight reasoner; solid logic on a budget, limited world knowledge",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;

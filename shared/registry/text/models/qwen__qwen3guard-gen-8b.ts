import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3guard-gen-8b";

export default {
    supportedParameters: CHAT_PARAMETERS.qwenGuard,
    aliases: ["qwen3guard-gen-8b", "qwen-safety"],
    provider: "ovhcloud",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-02-15").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    cost: {
        // OVHcloud lists this moderation endpoint as free (2026-10-12).
        promptTextTokens: perMillion(0),
        completionTextTokens: perMillion(0),
    },
    title: "Qwen3Guard 8B",
    description: "Flags unsafe content for moderation",
    inputModalities: ["text"],
    outputModalities: ["text"],
    isSpecialized: true,
} satisfies ModelDefinition;

import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-vl-235b-a22b-thinking";

export default {
    supportedParameters: CHAT_PARAMETERS.alibabaQwenVl,
    aliases: [
        "qwen3-vl-pro",
        "qwen3-vl-235b",
        "qwen3-vl-235b-a22b-thinking",
        "qwen-vl-pro",
        "qwen-vision-pro",
    ],
    provider: "alibaba",
    publisher: "Qwen",
    addedDate: new Date("2026-05-15").getTime(),
    // Alibaba Model Studio notice on postponed legacy retirements.
    // Provider retires this route on 2026-10-10T00:00:00+08:00.
    paidOnly: true,
    priceMultiplier: 1,
    category: "text",
    cost: {
        // Alibaba Model Studio Singapore PAYG, verified 2026-08-28.
        promptTextTokens: perMillion(0.4),
        promptImageTokens: perMillion(0.4),
        completionTextTokens: perMillion(4),
        completionReasoningTokens: perMillion(4),
    },
    title: "Qwen3 VL 235B A22B Thinking",
    description:
        "Careful visual reasoning for charts, documents and complex scenes",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;

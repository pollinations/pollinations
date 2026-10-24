import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-coder-30b-a3b-instruct";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockQwenCoder,
    aliases: ["qwen3-coder", "qwen3-coder-30b-a3b-instruct", "qwen-coder"],
    provider: "aws",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // AWS Bedrock on-demand standard tier, us-east-1.
        promptTextTokens: perMillion(0.15),
        completionTextTokens: perMillion(0.6),
    },
    title: "Qwen3 Coder 30B",
    description:
        "Writes and fixes code quickly at low cost; best for programming, not chat",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;

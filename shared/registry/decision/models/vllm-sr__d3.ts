import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "vllm-sr/d3";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: [],
    provider: "vllm-sr",
    publisher: "vLLM Semantic Router",
    category: "decision",
    addedDate: new Date("2026-10-18").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    // One shared free key: 16 concurrent requests, 540 per minute.
    perUserRpm: 30,
    cost: {
        promptTextTokens: perMillion(0),
        completionTextTokens: perMillion(0),
    },
    title: "D3",
    description:
        "Typed choices, yes/no probabilities and scores for routing and " +
        "classification. Inputs may be logged and used for training",
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    contextLength: 65536,
    isSpecialized: true,
} satisfies ModelDefinition;

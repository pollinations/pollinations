import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { AUDIO_VOICES } from "../../text.ts";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-audio-1.5";

export default {
    supportedParameters: CHAT_PARAMETERS.azureAudio,
    aliases: [
        "gpt-audio",
        "gpt-audio-1.5",
        "gpt-audio-2025-12-15",
        "openai-audio-large",
    ],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-04-02").getTime(),
    // Provider retires this route on 2027-08-24.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        // Azure GPT Audio 1.5 Global meters, verified against account
        // usage and Retail Prices on 2026-08-24.
        promptTextTokens: perMillion(2.5),
        completionTextTokens: perMillion(10.0),
        promptAudioTokens: perMillion(32.0),
        completionAudioTokens: perMillion(64.0),
    },
    title: "GPT Audio 1.5",
    description:
        "Rich, natural voice conversations; premium quality at a higher price",
    voices: [...AUDIO_VOICES],
    inputModalities: ["text", "audio"],
    outputModalities: ["audio", "text"],
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;

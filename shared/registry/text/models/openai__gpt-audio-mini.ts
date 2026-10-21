import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { AUDIO_VOICES } from "../../text/constants.ts";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-audio-mini";

export default {
    supportedParameters: CHAT_PARAMETERS.azureAudio,
    aliases: [
        "gpt-audio-mini",
        "gpt-audio-mini-2025-12-15",
        "gpt-4o-mini-audio-preview",
        "gpt-4o-mini-audio-preview-2024-12-17",
        "openai-audio",
    ],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    // Provider retires this route on 2027-06-15.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.6),
        completionTextTokens: perMillion(2.4),
        promptAudioTokens: perMillion(10.0),
        completionAudioTokens: perMillion(20.0),
    },
    title: "GPT Audio Mini",
    description:
        "Talks and listens — voice conversations with spoken or text replies",
    voices: [...AUDIO_VOICES],
    inputModalities: ["text", "audio"],
    outputModalities: ["audio", "text"],
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;

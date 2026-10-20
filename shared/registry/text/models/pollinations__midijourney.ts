import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "pollinations/midijourney";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGptMini,
    aliases: ["midijourney"],
    provider: "azure",
    publisher: "Pollinations",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    // Its Azure gpt-5.4-mini route.
    // Provider retires this route on 2027-09-21.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.75),
        promptCachedTokens: perMillion(0.075),
        completionTextTokens: perMillion(4.5),
    },
    title: "MIDIjourney",
    description: "Turns your musical ideas into playable MIDI notation",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    isSpecialized: true,
} satisfies ModelDefinition;

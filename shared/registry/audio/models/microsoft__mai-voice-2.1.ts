import { MAI_VOICE_21_VOICES } from "../../audio.ts";
import type { ModelDefinition } from "../../registry";

export const id = "microsoft/mai-voice-2.1";

export default {
    aliases: [],
    provider: "azure",
    publisher: "Microsoft",
    category: "audio",
    addedDate: new Date("2026-10-08").getTime(),
    paidOnly: false,
    priceMultiplier: 0.75,
    // Direct Azure Speech list rate; Vercel matches it.
    cost: { completionAudioTokens: 22 / 1_000_000 },
    title: "MAI-Voice-2.1",
    description:
        "Expressive speech across 23 languages with consistent voices for long-form narration; mp3 or 24 kHz pcm",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...MAI_VOICE_21_VOICES],
} satisfies ModelDefinition;

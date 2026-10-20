import { OPENAI_REALTIME_BASE } from "../../realtime.ts";
import { OPENAI_REALTIME_2_1_MINI_CACHE_BILLING } from "../../realtime-billing";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-realtime-2.1-mini";

export default {
    ...OPENAI_REALTIME_BASE,
    aliases: ["gpt-realtime-2.1-mini"],
    addedDate: new Date("2026-07-26").getTime(),
    // Azure retirement schedule; the model catalog says 2027-07-31.
    // Provider retires this route on 2027-06-25.
    paidOnly: false,
    cost: {
        promptTextTokens: 0.0000006,
        promptCachedTokens: 0.00000006,
        promptAudioTokens: 0.00001,
        promptImageTokens: 0.0000008,
        completionTextTokens: 0.0000024,
        completionAudioTokens: 0.00002,
    },
    billing: OPENAI_REALTIME_2_1_MINI_CACHE_BILLING,
    title: "GPT Realtime 2.1 Mini",
    description:
        "Cost-efficient live voice conversations with fast, reasoned replies and tool use",
    contextLength: 128000,
    voices: [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "sage",
        "shimmer",
        "verse",
        "marin",
        "cedar",
    ],
} satisfies ModelDefinition;

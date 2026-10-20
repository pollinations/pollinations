import { OPENAI_REALTIME_BASE, OPENAI_REALTIME_COST } from "../../realtime.ts";
import { OPENAI_REALTIME_CACHE_BILLING } from "../../realtime-billing";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-realtime-2.1";

export default {
    ...OPENAI_REALTIME_BASE,
    aliases: ["gpt-realtime-2.1", "gpt-realtime-2"],
    addedDate: new Date("2026-07-16").getTime(),
    // Azure retirement schedule; the model catalog says 2027-07-31.
    // Provider retires this route on 2027-06-25.
    cost: OPENAI_REALTIME_COST,
    billing: OPENAI_REALTIME_CACHE_BILLING,
    title: "GPT Realtime 2.1",
    description:
        "Live voice conversations with instant replies and solid noise handling",
    contextLength: 32000,
    paidOnly: false,
} satisfies ModelDefinition;

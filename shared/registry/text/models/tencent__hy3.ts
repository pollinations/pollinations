import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "tencent/hy3";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterHy3,
    aliases: [],
    provider: "openrouter",
    publisher: "Tencent",
    category: "text",
    addedDate: new Date("2026-09-13").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Novita route rates (2026-09-18, includes the
        // mandatory 5.5% OpenRouter credit fee). Ties GMICloud's flat
        // rate but with materially better uptime (99.96% vs 99.91%) and
        // roughly half the latency in local E2E testing. Tencent's own
        // direct route bills a time-of-day rate the registry can't
        // represent, and DeepInfra's discount pricing structure was
        // passed over — both confirmed still true on re-check.
        promptTextTokens: perMillion(0.14) * 1.055,
        promptCachedTokens: perMillion(0.035) * 1.055,
        completionTextTokens: perMillion(0.58) * 1.055,
    },
    title: "Hy3",
    description:
        "Mixture-of-experts reasoning for agentic workflows and production tool-use",
    inputModalities: ["text"],
    outputModalities: ["text"],
    // Forced tool_choice:"required" isn't reliably supported on any of
    // Hy3's OpenRouter routes: Novita/GMICloud/Phala silently ignore it
    // (plain text, no tool call, no error) and AtlasCloud hard-400s.
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;

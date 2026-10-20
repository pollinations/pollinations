import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4-pro";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterDeepseekV4Pro,
    aliases: ["deepseek-v4-pro", "deepseek-pro"],
    provider: "openrouter",
    publisher: "DeepSeek",
    category: "text",
    addedDate: new Date("2026-04-24").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter base Alibaba peak rates (00:00–14:00 UTC, 2026-09-23),
        // including the account's 5.5% credit-purchase fee. Alibaba
        // halves them the rest of the day; costs are not time-based, so
        // the peak rate applies all day and never undercharges.
        promptTextTokens: perMillion(1.122) * 1.055,
        promptCachedTokens: perMillion(0.1122) * 1.055,
        completionTextTokens: perMillion(3.366) * 1.055,
    },
    title: "DeepSeek V4 Pro 0813",
    description: "Deep reasoning and strong coding for demanding problems",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;

import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export type ModerationModelName = keyof typeof MODERATION_SERVICES;

export const DEFAULT_MODERATION_MODEL: ModerationModelName = "qwen-safety";

export const MODERATION_SERVICES = {
    "qwen-safety": {
        aliases: ["qwen3guard-gen-8b"],
        provider: "ovhcloud",
        brand: "Qwen",
        category: "moderation",
        addedDate: new Date("2026-02-15").getTime(),
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(0.01),
            completionTextTokens: perMillion(0.01),
        },
        title: "Qwen3Guard 8B",
        description:
            "Flags unsafe content — a moderation filter, not a chat companion",
        inputModalities: ["text"],
        outputModalities: ["text"],
        isSpecialized: true,
    },
} as const satisfies Record<string, ModelDefinition>;

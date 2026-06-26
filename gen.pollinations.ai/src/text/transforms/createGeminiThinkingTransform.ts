import debug from "debug";
import type { TransformFn } from "../types.js";

const log = debug("pollinations:transforms:gemini-thinking");

/**
 * - v2.5-flash variants: Uses thinking.budget_tokens, including 0 to disable
 * - v3-flash: Uses reasoning_effort ("none" to get as close as possible to disabled)
 * - v3-pro: Uses reasoning_effort ("low" to minimize, can't fully disable)
 */
export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

const EFFORT_TO_BUDGET: Record<string, number> = {
    minimal: 1024,
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 8192,
};

function normalizeEffort(value: unknown): string | undefined {
    return typeof value === "string" ? value.toLowerCase() : undefined;
}

/**
 * Creates a transform that configures Gemini thinking mode.
 *
 * Portkey gateway expects OpenAI-compatible format:
 * - `thinking: { budget_tokens: N }` for Gemini 2.5 Flash budgets, including 0 to disable
 * - `reasoning_effort: "none"` to minimize Gemini 3 Flash thinking
 * - `reasoning_effort` for other Gemini 3 model levels
 */
export function createGeminiThinkingTransform(
    modelType: GeminiModelType = "v2.5",
): TransformFn {
    return (messages, options) => {
        const effort = normalizeEffort(options.reasoning_effort);

        if (effort === undefined) {
            return { messages, options };
        }

        const updatedOptions = { ...options };

        log("Configuring Gemini thinking for %s, effort=%s", modelType, effort);

        if (modelType === "v2.5") {
            updatedOptions.thinking = {
                ...(effort === "none" ? {} : { type: "enabled" }),
                budget_tokens:
                    effort === "none"
                        ? 0
                        : (EFFORT_TO_BUDGET[effort] ??
                          EFFORT_TO_BUDGET.medium),
            };
            delete updatedOptions.reasoning_effort;
        } else if (modelType === "v3-pro" && effort === "none") {
            // Gemini 3 Pro can't fully disable thinking; use the lowest supported level.
            updatedOptions.reasoning_effort = "low";
        }

        log("Final options:", {
            thinking: updatedOptions.thinking,
            reasoning_effort: updatedOptions.reasoning_effort,
        });

        return { messages, options: updatedOptions };
    };
}

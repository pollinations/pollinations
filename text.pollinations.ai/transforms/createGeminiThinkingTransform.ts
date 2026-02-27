import debug from "debug";
import type { TransformFn } from "../types.js";

const log = debug("pollinations:transforms:gemini-thinking");

/**
 * - v2.5: Uses thinking.budget_tokens (0 to disable)
 * - v3-flash: Uses thinking.budget_tokens (0 to disable)
 * - v3-pro: Uses reasoning_effort ("low" for minimal thinking, can't fully disable)
 */
export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

/**
 * Maps a token budget to a reasoning_effort level for v3 models.
 */
function budgetToReasoningEffort(budget: number): string {
    if (budget <= 1024) return "low";
    if (budget <= 4096) return "medium";
    return "high";
}

/**
 * Creates a transform that configures Gemini thinking mode.
 *
 * Portkey gateway expects OpenAI-compatible format:
 * - `thinking: { type: "enabled", budget_tokens: N }` for Gemini 2.5 / 3 Flash
 * - `reasoning_effort: "none"|"low"|"medium"|"high"` for Gemini 3 Pro
 */
export function createGeminiThinkingTransform(
    modelType: GeminiModelType = "v2.5",
): TransformFn {
    return (messages, options) => {
        const thinkingBudget = options.thinking_budget as number | undefined;

        if (thinkingBudget === undefined) {
            return { messages, options };
        }

        const updatedOptions = { ...options };
        const isDisabled = thinkingBudget === 0;

        log(
            `Configuring thinking for ${modelType}. Budget: ${thinkingBudget}, Disabled: ${isDisabled}`,
        );

        if (isDisabled) {
            if (modelType === "v3-pro") {
                // Gemini 3 Pro can't fully disable thinking; use "low" as minimum
                updatedOptions.reasoning_effort = "low";
            } else {
                updatedOptions.thinking = { type: "enabled", budget_tokens: 0 };
            }
        } else if (modelType === "v2.5") {
            updatedOptions.thinking = {
                type: "enabled",
                budget_tokens: thinkingBudget,
            };
        } else {
            updatedOptions.reasoning_effort =
                budgetToReasoningEffort(thinkingBudget);
        }

        // Clean up internal parameter not recognized by OpenAI/Portkey
        delete updatedOptions.thinking_budget;

        log("Final options:", {
            thinking: updatedOptions.thinking,
            reasoning_effort: updatedOptions.reasoning_effort,
        });

        return { messages, options: updatedOptions };
    };
}

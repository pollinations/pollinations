import debug from "debug";

const log = debug("pollinations:transforms:gemini-thinking");

/**
 * Gemini model type for thinking configuration
 * - v2.5: Uses thinking.budget_tokens (0 to disable)
 * - v3-flash: Uses reasoning_effort ("none" for minimal thinking)
 * - v3-pro: Uses reasoning_effort ("low" for minimal thinking, can't fully disable)
 */
export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

/**
 * Creates a transform that handles Gemini thinking mode configuration.
 *
 * Portkey gateway expects OpenAI-compatible format:
 * - `thinking: { type: "enabled", budget_tokens: N }` for Gemini 2.5
 * - `reasoning_effort: "none"|"minimal"|"low"|"medium"|"high"` for Gemini 3
 *
 * The gateway translates these to Vertex AI's thinking_config internally.
 *
 * @param modelType - The Gemini model version to configure thinking for
 */
export function createGeminiThinkingTransform(
    modelType: GeminiModelType = "v2.5",
) {
    return (messages: unknown[], options: Record<string, unknown>) => {
        const updatedOptions = { ...options };

        // Check if user explicitly requested thinking to be disabled
        // This can come from:
        // 1. thinking_budget: 0 (direct)
        // 2. thinking: { type: "disabled" } (Anthropic-style, parsed by parameterValidators)
        const thinkingBudget = updatedOptions.thinking_budget as
            | number
            | undefined;

        // Only modify if thinking_budget is explicitly set
        if (thinkingBudget !== undefined) {
            const isDisabled = thinkingBudget === 0;

            log(
                `Configuring thinking for ${modelType}. Budget: ${thinkingBudget}, Disabled: ${isDisabled}`,
            );

            if (isDisabled) {
                // User wants to disable thinking - use Portkey-compatible format
                // Portkey docs: { "type": "enabled", "budget_tokens": 0 } disables thinking
                // This works for both Gemini 2.5 and Gemini 3 models
                switch (modelType) {
                    case "v3-pro":
                        // Gemini 3 Pro: Can't fully disable, use "low" for minimal thinking
                        updatedOptions.reasoning_effort = "low";
                        break;
                    case "v3-flash":
                    case "v2.5":
                    default:
                        // Gemini 2.5 and 3 Flash: Use thinking object with budget_tokens: 0
                        updatedOptions.thinking = {
                            type: "enabled",
                            budget_tokens: 0,
                        };
                        break;
                }
            } else {
                // User wants thinking enabled with specific budget
                // Only set for v2.5 models that support budget_tokens
                if (modelType === "v2.5") {
                    updatedOptions.thinking = {
                        type: "enabled",
                        budget_tokens: thinkingBudget,
                    };
                } else {
                    // For v3 models, map budget to reasoning_effort levels
                    // This is a rough approximation since v3 uses levels not tokens
                    if (thinkingBudget <= 1024) {
                        updatedOptions.reasoning_effort = "low";
                    } else if (thinkingBudget <= 4096) {
                        updatedOptions.reasoning_effort = "medium";
                    } else {
                        updatedOptions.reasoning_effort = "high";
                    }
                }
            }

            // Clean up the internal thinking_budget parameter
            // (it's not a valid OpenAI/Portkey parameter)
            delete updatedOptions.thinking_budget;

            log("Final options:", {
                thinking: updatedOptions.thinking,
                reasoning_effort: updatedOptions.reasoning_effort,
            });
        }

        return { messages, options: updatedOptions };
    };
}

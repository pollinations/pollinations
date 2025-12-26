import debug from "debug";

const log = debug("pollinations:transforms:gemini-thinking");

/**
 * Gemini models have different mechanisms for controlling the thinking (reasoning) process.
 * v2.5: Supports 'thinking_budget' (0 to disable).
 * v3-flash: Supports 'thinking_level' ('MINIMAL' is closest to off).
 * v3-pro: Supports 'thinking_level' ('LOW' is the lowest possible depth).
 */
export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

/**
 * Creates a transform that maps normalized 'thinking_budget' to Gemini-specific 'thinking_config'.
 * This ensures that when a client requests to disable thinking, the model respects it 
 * according to its specific technical capabilities.
 * 
 * @param modelType - The version/tier of the Gemini model to determine the disable strategy.
 */
export function createGeminiThinkingTransform(modelType: GeminiModelType = "v2.5") {
    return (messages, options) => {
        const updatedOptions = { ...options };

        // We use thinking_budget as our internal normalized parameter
        if (updatedOptions.thinking_budget !== undefined) {
            const budget = updatedOptions.thinking_budget;
            const isEnabled = budget > 0;
            
            log(`Configuring thinking for ${modelType}. Budget: ${budget}, Enabled: ${isEnabled}`);

            let thinkingConfig: Record<string, any> = {
                include_thoughts: isEnabled
            };

            if (isEnabled) {
                // All Gemini models that support thinking also support explicit token budget
                thinkingConfig.thinking_budget = budget;
            } else {
                // Strategy for "disabling" depends on what the specific model version allows
                switch (modelType) {
                    case "v3-flash":
                        // Gemini 3 Flash: "MINIMAL" matches the "no thinking" setting for most queries.
                        thinkingConfig.thinking_level = "MINIMAL";
                        break;
                    case "v3-pro":
                        // Gemini 3 Pro: Cannot disable thinking. "LOW" minimizes reasoning depth and cost.
                        thinkingConfig.thinking_level = "LOW";
                        break;
                    case "v2.5":
                    default:
                        // Gemini 2.5: Setting budget to 0 explicitly disables thinking.
                        thinkingConfig.thinking_budget = 0;
                        break;
                }
            }
            
            log("Final thinking_config generated:", thinkingConfig);
            updatedOptions.thinking_config = thinkingConfig;
        }

        return { messages, options: updatedOptions };
    };
}

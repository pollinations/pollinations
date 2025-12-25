export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

export function createGeminiThinkingTransform(modelType: GeminiModelType = "v2.5") {
    return (messages, options) => {
        const updatedOptions = { ...options };

        if (updatedOptions.thinking_budget !== undefined) {
            const budget = updatedOptions.thinking_budget;
            const isEnabled = budget > 0;
            
            let thinkingConfig: any = {
                include_thoughts: isEnabled
            };

            if (isEnabled) {
                // If enabled with specific budget, all models support thinking_budget
                thinkingConfig.thinking_budget = budget;
            } else {
                // Strategy for "disabling" (budget === 0) depends on model version
                switch (modelType) {
                    case "v3-flash":
                        // Gemini 3 Flash supports "MINIMAL" which is effectively "off" (or close to it)
                        thinkingConfig.thinking_level = "MINIMAL";
                        break;
                    case "v3-pro":
                        // Gemini 3 Pro cannot fully disable thinking and doesn't support MINIMAL.
                        // "LOW" is the most economical option.
                        thinkingConfig.thinking_level = "LOW";
                        break;
                    case "v2.5":
                    default:
                        // Gemini 2.5 supports explicit budget 0 to disable
                        thinkingConfig.thinking_budget = 0;
                        break;
                }
            }
            
            updatedOptions.thinking_config = thinkingConfig;
        }

        return { messages, options: updatedOptions };
    };
}

import debug from "debug";

const log = debug("pollinations:transforms:gemini-thinking");

export type GeminiModelType = "v2.5" | "v3-flash" | "v3-pro";

export function createGeminiThinkingTransform(modelType: GeminiModelType = "v2.5") {
    return (messages, options) => {
        const updatedOptions = { ...options };

        if (updatedOptions.thinking_budget !== undefined) {
            const budget = updatedOptions.thinking_budget;
            const isEnabled = budget > 0;
            
            log(`Setting thinking config for model type ${modelType}. Budget: ${budget}, Enabled: ${isEnabled}`);

            let thinkingConfig: Record<string, any> = {
                include_thoughts: isEnabled
            };

            if (isEnabled) {
                thinkingConfig.thinking_budget = budget;
            } else {
                switch (modelType) {
                    case "v3-flash":
                        thinkingConfig.thinking_level = "MINIMAL";
                        break;
                    case "v3-pro":
                        thinkingConfig.thinking_level = "LOW";
                        break;
                    case "v2.5":
                    default:
                        thinkingConfig.thinking_budget = 0;
                        break;
                }
            }
            
            log("Final thinking_config:", thinkingConfig);
            updatedOptions.thinking_config = thinkingConfig;
        }

        return { messages, options: updatedOptions };
    };
}

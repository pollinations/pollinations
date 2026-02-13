import debug from "debug";

const log = debug("pollinations:transforms:parameters");

/**
 * Transform that processes sampling parameters and parameter filtering
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelConfig and modelDef
 * @returns {Object} Object with messages and processed options
 */
export function processParameters(messages, options) {
    if (!options.modelConfig || !options.modelDef) {
        return { messages, options };
    }

    const config = options.modelConfig;
    const updatedOptions = { ...options };

    // Apply model-specific sampling parameter defaults
    const samplingParams = [
        "temperature",
        "top_p",
        "presence_penalty",
        "frequency_penalty",
        "repetition_penalty",
    ];
    samplingParams.forEach((param) => {
        if (
            updatedOptions[param] === undefined &&
            config[param] !== undefined
        ) {
            log(`Setting ${param} to model default value: ${config[param]}`);
            updatedOptions[param] = config[param];
        }
    });

    // Add stream_options for all streaming requests to get usage data
    if (updatedOptions.stream) {
        log("Adding stream_options to include usage data in stream");
        updatedOptions.stream_options = { include_usage: true };
    }

    // Convert max_tokens → max_completion_tokens for Azure OpenAI models
    // Newer Azure models (gpt-4o, gpt-5, o1, o3, etc.) require max_completion_tokens
    if (
        updatedOptions.max_tokens !== undefined &&
        config.provider === "azure-openai"
    ) {
        log(
            `Converting max_tokens (${updatedOptions.max_tokens}) to max_completion_tokens for Azure model`,
        );
        updatedOptions.max_completion_tokens = updatedOptions.max_tokens;
        delete updatedOptions.max_tokens;
    }

    // Force temperature=1 for reasoning models (o1, o3, o4) and GPT-5 series
    // These Azure OpenAI models only support temperature=1
    // options.model is already resolved to actual model name by modelResolver
    const model = updatedOptions.model || "";
    const isReasoningOrGpt5Model = /^(o[134](-mini|-preview)?|gpt-5)/i.test(
        model,
    );
    if (isReasoningOrGpt5Model) {
        log(`Forcing temperature=1 for reasoning/GPT-5 model: ${model}`);
        updatedOptions.temperature = 1;
    }

    return { messages, options: updatedOptions };
}

import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:parameters");

const SAMPLING_PARAMS = [
    "temperature",
    "top_p",
    "presence_penalty",
    "frequency_penalty",
    "repetition_penalty",
] as const;

/**
 * Transform that applies model-specific sampling defaults, streaming options,
 * and provider-specific parameter conversions.
 */
export function processParameters(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (!options.modelConfig || !options.modelDef) {
        return { messages, options };
    }

    const config = options.modelConfig as Record<string, unknown>;
    const updatedOptions = { ...options };

    // Apply model-specific sampling parameter defaults
    for (const param of SAMPLING_PARAMS) {
        if (
            updatedOptions[param] === undefined &&
            config[param] !== undefined
        ) {
            log(`Setting ${param} to model default value: ${config[param]}`);
            updatedOptions[param] = config[param] as number;
        }
    }

    if (updatedOptions.stream) {
        log("Adding stream_options to include usage data in stream");
        updatedOptions.stream_options = { include_usage: true };
    }

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

    // Reasoning models (o1, o3, o4) and GPT-5 series only support temperature=1
    const model = updatedOptions.model || "";
    if (/^(o[134](-mini|-preview)?|gpt-5)/i.test(model)) {
        log(`Forcing temperature=1 for reasoning/GPT-5 model: ${model}`);
        updatedOptions.temperature = 1;
    }

    return { messages, options: updatedOptions };
}

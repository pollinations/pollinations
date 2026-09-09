import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:parameters");

/**
 * Transform that applies streaming options and provider-specific parameter
 * conversions.
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

    if (updatedOptions.stream && config.supportsStreamOptions !== false) {
        log("Adding stream_options to include usage data in stream");
        updatedOptions.stream_options = { include_usage: true };
    } else {
        delete updatedOptions.stream_options;
    }

    if (config.supportsMaxCompletionTokens === true) {
        if (updatedOptions.max_tokens !== undefined) {
            log(
                `Converting max_tokens (${updatedOptions.max_tokens}) to max_completion_tokens`,
            );
            updatedOptions.max_completion_tokens = updatedOptions.max_tokens;
            delete updatedOptions.max_tokens;
        }
    } else if (updatedOptions.max_completion_tokens !== undefined) {
        if (updatedOptions.max_tokens === undefined) {
            updatedOptions.max_tokens = updatedOptions.max_completion_tokens;
        }
        delete updatedOptions.max_completion_tokens;
    }

    return { messages, options: updatedOptions };
}

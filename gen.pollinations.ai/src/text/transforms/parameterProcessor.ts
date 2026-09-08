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

    if (updatedOptions.stream) {
        log("Adding stream_options to include usage data in stream");
        updatedOptions.stream_options = { include_usage: true };
    } else {
        delete updatedOptions.stream_options;
    }

    // Newer OpenAI models (gpt-4o, gpt-5, o1, o3, etc.) require max_completion_tokens
    // Non-OpenAI models on Azure (Mistral, DeepSeek, Kimi, Grok) do NOT support it
    const azureModel = (config["azure-deployment-id"] as string) || "";
    const isOpenAIModel = /^(gpt-|o[134])/i.test(azureModel);
    const isAzureOpenAI = config.provider === "azure-openai";
    const supportsMaxCompletionTokens = isAzureOpenAI && isOpenAIModel;

    // Azure Foundry only accepts stream_options for actual OpenAI deployments.
    // Third-party deployments (Mistral, Grok, DeepSeek, Llama) reject it with a
    // 422 extra_forbidden, so strip it for non-OpenAI Azure models.
    if (
        isAzureOpenAI &&
        !isOpenAIModel &&
        updatedOptions.stream_options !== undefined
    ) {
        log(
            `Stripping stream_options for non-OpenAI Azure model: ${azureModel}`,
        );
        delete updatedOptions.stream_options;
    }

    if (supportsMaxCompletionTokens) {
        if (updatedOptions.max_tokens !== undefined) {
            log(
                `Converting max_tokens (${updatedOptions.max_tokens}) to max_completion_tokens for OpenAI Azure model`,
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

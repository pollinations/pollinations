import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:parameters");

/** Shared by Chat and Responses; model is the resolved upstream ID. */
export function stripSamplingParameters<T extends Record<string, unknown>>(
    model: string,
    options: T,
): T {
    const result = { ...options };

    // Keep one policy per family, even when some reasoning modes accept sampling.
    if (/^(?:openai\/)?(?:o[134]|gpt-5|gpt-6-astra)\b/i.test(model)) {
        for (const param of [
            "temperature",
            "top_p",
            "top_k",
            "frequency_penalty",
            "presence_penalty",
            "repetition_penalty",
            "seed",
        ]) {
            delete result[param];
        }
    }

    // Newer Claude models reject non-default sampling parameters.
    if (/claude-(opus-(4[.-][78]|5)|sonnet-5|fable-5)/i.test(model)) {
        for (const param of ["temperature", "top_p", "top_k"]) {
            delete result[param];
        }
    }

    // Bedrock Claude rejects temperature and top_p together.
    if (
        /anthropic\.claude/i.test(model) &&
        result.temperature !== undefined &&
        result.top_p !== undefined
    ) {
        delete result.top_p;
    }

    return result;
}

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
    const updatedOptions = stripSamplingParameters(
        options.model || "",
        options,
    );

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

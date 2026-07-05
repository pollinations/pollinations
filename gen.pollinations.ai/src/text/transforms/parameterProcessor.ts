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

    // Reasoning models (o1, o3, o4) and GPT-5 series only support temperature=1
    const model = updatedOptions.model || "";
    if (/^(o[134](-mini|-preview)?|gpt-5)/i.test(model)) {
        log(`Forcing temperature=1 for reasoning/GPT-5 model: ${model}`);
        updatedOptions.temperature = 1;
    }

    // Claude Opus 4.7/4.8 and Fable 5 reject non-default sampling params.
    // Strip them entirely.
    if (/claude-(opus-4-[78]|fable-5)/i.test(model)) {
        for (const param of ["temperature", "top_p", "top_k"] as const) {
            if (updatedOptions[param] !== undefined) {
                log(`Stripping ${param} for ${model}`);
                delete updatedOptions[param];
            }
        }
    }

    // Bedrock Claude models return 400 when both temperature and top_p are
    // set. Drop top_p when temperature is also present.
    if (
        /anthropic\.claude/i.test(model) &&
        updatedOptions.temperature !== undefined &&
        updatedOptions.top_p !== undefined
    ) {
        log(`Dropping top_p (temperature is set) for ${model}`);
        delete updatedOptions.top_p;
    }

    return { messages, options: updatedOptions };
}

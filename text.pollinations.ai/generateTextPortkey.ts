import debug from "debug";
import { findModelByName } from "./availableModels.js";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { createImageUrlToBase64Transform } from "./transforms/imageUrlToBase64Transform.js";
import { sanitizeMessages } from "./transforms/messageSanitizer.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import type {
    ChatCompletion,
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";

export const log = debug("pollinations:portkey");

const DEFAULT_OPTIONS = {
    model: "openai-fast",
    jsonMode: false,
};

const clientConfig = {
    endpoint: () =>
        `${process.env.PORTKEY_GATEWAY_URL || "https://portkey.pollinations.ai"}/v1/chat/completions`,
    authHeaderName: "Authorization",
    authHeaderValue: () => `Bearer ${process.env.PORTKEY_API_KEY}`,
    additionalHeaders: {},
    defaultOptions: DEFAULT_OPTIONS,
};

/** Applies a transform step, destructuring and reassigning messages/options. */
async function applyTransform(
    state: TransformResult,
    transform: TransformFn,
    label: string,
): Promise<TransformResult> {
    const result = await transform(state.messages, state.options);
    log(
        "After %s: modelDef=%s modelConfig=%s",
        label,
        !!result.options.modelDef,
        !!result.options.modelConfig,
    );
    return result;
}

export async function generateTextPortkey(
    messages: ChatMessage[],
    options: TransformOptions = {},
): Promise<ChatCompletion> {
    let state: TransformResult = { messages, options: { ...options } };

    if (state.options.model) {
        const modelDef = findModelByName(state.options.model);
        if (modelDef?.transform) {
            const result = await modelDef.transform(messages, state.options);
            state = {
                messages: result.messages,
                options: { ...state.options, ...result.options },
            };
        }
    }

    if (state.options.model) {
        state = await applyTransform(
            state,
            resolveModelConfig,
            "resolveModelConfig",
        );
        state = await applyTransform(state, generateHeaders, "generateHeaders");
        state = await applyTransform(
            state,
            createImageUrlToBase64Transform(),
            "imageUrlTransform",
        );
        state = await applyTransform(
            state,
            sanitizeMessages,
            "sanitizeMessages",
        );
        state = await applyTransform(
            state,
            processParameters,
            "processParameters",
        );
    }

    const requestConfig = {
        ...clientConfig,
        additionalHeaders: (state.options.additionalHeaders || {}) as Record<
            string,
            string
        >,
    };

    delete state.options.additionalHeaders;

    return genericOpenAIClient(state.messages, state.options, requestConfig);
}

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
    TransformOptions,
    TransformResult,
} from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";

export const log = debug("pollinations:portkey");

const clientConfig = {
    endpoint: () =>
        `${process.env.PORTKEY_GATEWAY_URL || "https://portkey.pollinations.ai"}/v1/chat/completions`,
    authHeaderName: "Authorization",
    authHeaderValue: () => `Bearer ${process.env.PORTKEY_API_KEY}`,
    additionalHeaders: {},
    defaultOptions: {
        model: "openai-fast",
        jsonMode: false,
    },
};

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
        state = await resolveModelConfig(state.messages, state.options);
        state = await generateHeaders(state.messages, state.options);
        state = await createImageUrlToBase64Transform()(
            state.messages,
            state.options,
        );
        state = await sanitizeMessages(state.messages, state.options);
        state = await processParameters(state.messages, state.options);
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

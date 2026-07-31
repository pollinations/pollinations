import { findModelByName } from "./availableModels.js";
import { sanitizeCohereResponse } from "./cohereCommandAPlus.js";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { imageUrlToBase64Transform } from "./transforms/imageUrlToBase64Transform.js";
import { sanitizeMessages } from "./transforms/messageSanitizer.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import type {
    ChatCompletion,
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";

const clientConfig = {
    defaultOptions: {
        model: "openai-fast",
        jsonMode: false,
    },
};

function buildEndpoint(gatewayUrl: unknown): string {
    const base =
        typeof gatewayUrl === "string" && gatewayUrl
            ? gatewayUrl
            : process.env.PORTKEY_GATEWAY_URL || "https://portkey.myceli.ai";
    return `${base.replace(/\/+$/, "")}/v1/chat/completions`;
}

export async function generateTextPortkey(
    messages: ChatMessage[],
    options: TransformOptions = {},
): Promise<ChatCompletion> {
    let state: TransformResult = { messages, options: { ...options } };
    const modelDef = state.options.model
        ? findModelByName(state.options.model)
        : null;

    if (modelDef?.transform) {
        // Transforms return the complete intended options (a copy of the
        // input with mutations applied), so replace state wholesale — a
        // spread-merge here would resurrect keys the transform deleted
        // (e.g. reasoning_effort:"none" stripped for mandatory-reasoning
        // models, which then 400 upstream).
        state = await modelDef.transform(messages, state.options);
    }

    if (state.options.model) {
        state = await resolveModelConfig(state.messages, state.options);
        state = await generateHeaders(state.messages, state.options);
        state = await imageUrlToBase64Transform(state.messages, state.options);
        state = await sanitizeMessages(state.messages, state.options);
        state = await processParameters(state.messages, state.options);
    }

    const portkeyGatewayUrl = state.options.portkeyGatewayUrl;
    const requestConfig = {
        ...clientConfig,
        endpoint: () => buildEndpoint(portkeyGatewayUrl),
        additionalHeaders: (state.options.additionalHeaders || {}) as Record<
            string,
            string
        >,
    };

    delete state.options.additionalHeaders;
    delete state.options.portkeyGatewayUrl;

    const completion = await genericOpenAIClient(
        state.messages,
        state.options,
        requestConfig,
    );
    return modelDef?.name === "command-a-plus"
        ? sanitizeCohereResponse(completion)
        : completion;
}

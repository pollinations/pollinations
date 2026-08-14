import debug from "debug";
import { findModelByName } from "./availableModels.js";
import { callAzureResponses } from "./azureResponsesClient.js";
import { sanitizeCohereResponse } from "./cohereCommandAPlus.js";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { imageUrlToBase64Transform } from "./transforms/imageUrlToBase64Transform.js";
import { sanitizeMessages } from "./transforms/messageSanitizer.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import type {
    ChatCompletion,
    ChatMessage,
    OpenAIClientConfig,
    TransformOptions,
    TransformResult,
} from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";

export const log = debug("pollinations:portkey");

const clientConfig = {
    defaultOptions: {
        model: "openai-fast",
        jsonMode: false,
    },
};

// Portkey applies this millisecond deadline per attempt until provider response
// headers arrive. Keep retries disabled unless the total deadline is reconsidered.
const PORTKEY_REQUEST_TIMEOUT_MS = 290_000;

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
    fetcher?: OpenAIClientConfig["fetcher"],
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
        additionalHeaders: {
            "x-portkey-request-timeout": String(PORTKEY_REQUEST_TIMEOUT_MS),
            ...((state.options.additionalHeaders || {}) as Record<
                string,
                string
            >),
        },
        fetcher,
    };

    delete state.options.additionalHeaders;
    delete state.options.portkeyGatewayUrl;

    // GPT-5-family models on Azure only honor reasoning.effort through the
    // Responses API, which has a different request/response/stream shape.
    // Route them through the dedicated client (direct Azure call — Portkey
    // cannot translate a Responses API request). Note: `additionalHeaders`
    // (Portkey-specific, e.g. the request-timeout header) is intentionally not
    // forwarded to Azure — the Responses client sets its own headers/timeout.
    const needsResponsesApi =
        modelDef?.useResponsesApi &&
        (state.options.seed === undefined ||
            state.options.reasoning_effort !== undefined ||
            (Array.isArray(state.options.tools) &&
                state.options.tools.length > 0));

    // Azure Responses has no seed parameter. Preserve existing deterministic
    // behavior for plain seeded requests, but let tools/reasoning win when the
    // otherwise-unsupported combination is explicitly requested.
    if (needsResponsesApi) {
        if (state.options.seed !== undefined) {
            log(
                "Ignoring seed because Azure Responses is required for tools/reasoning",
            );
        }
        return callAzureResponses(state.messages, state.options);
    }

    // Only the Responses adapter owns this parameter. Keep generic provider
    // requests unchanged because some OpenAI-compatible backends reject it.
    delete state.options.parallel_tool_calls;

    const completion = await genericOpenAIClient(
        state.messages,
        state.options,
        requestConfig,
    );
    return modelDef?.name === "command-a-plus-05-2026"
        ? sanitizeCohereResponse(completion)
        : completion;
}

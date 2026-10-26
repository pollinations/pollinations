import debug from "debug";
import { findModelByName } from "./availableModels.js";
import { sanitizeCohereResponse } from "./cohereCommandAPlus.js";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import { callChatViaResponses } from "./responses/chatClient.js";
import { callSystemOne } from "./systemOneClient.js";
import { normalizeOptions } from "./textGenerationUtils.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { imageUrlToBase64Transform } from "./transforms/imageUrlToBase64Transform.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import { pdfFileParts } from "./transforms/pdfFileParts.js";
import type {
    ChatCompletion,
    ChatMessage,
    OpenAIClientConfig,
    ToolCall,
    TransformOptions,
    TransformResult,
} from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";
import { callVercelSearch } from "./vercelSearch.ts";

export const log = debug("pollinations:portkey");

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

// Only Vertex reads Gemini's tool-call signatures. Strict providers such as
// Mistral and Fireworks reject the extra field when a conversation that
// started on Gemini continues on another model.
function withoutThoughtSignatures(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => {
        if (!Array.isArray(message.tool_calls)) return message;
        return {
            ...message,
            tool_calls: (message.tool_calls as ToolCall[]).map((call) => {
                if (call?.function?.thought_signature === undefined)
                    return call;
                const { thought_signature: _signature, ...fn } = call.function;
                return { ...call, function: fn };
            }),
        };
    });
}

export async function generateTextPortkey(
    messages: ChatMessage[],
    options: TransformOptions = {},
    portkeyFetcher?: OpenAIClientConfig["fetcher"],
): Promise<ChatCompletion> {
    let state: TransformResult = {
        messages,
        options: normalizeOptions(options),
    };
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

    // `voice` is a GET /text shortcut: the audio models' transform has already
    // folded it into `audio.voice`, and no provider reads it at the top level.
    delete state.options.voice;

    if (state.options.model) {
        state = await resolveModelConfig(state.messages, state.options);
        if (state.options.modelConfig?.provider !== "vertex-ai") {
            state = {
                ...state,
                messages: withoutThoughtSignatures(state.messages),
            };
        }
        // TypeSafe has its own wire format and does not use Portkey transforms.
        if (modelDef?.useSystemOneApi) {
            return callSystemOne(state.messages, state.options);
        }
        state = await generateHeaders(state.messages, state.options);
        state = await imageUrlToBase64Transform(state.messages, state.options);
        state = pdfFileParts(state.messages, state.options);
        state = await processParameters(state.messages, state.options);
    }

    const directEndpoint = state.options.modelConfig?.directEndpoint;
    // Read before the delete below: the endpoint thunk runs after it.
    const portkeyGatewayUrl = state.options.portkeyGatewayUrl;
    const additionalHeaders = (state.options.additionalHeaders || {}) as Record<
        string,
        string
    >;
    const responsesFetcher = state.options.responsesFetcher;
    const requestConfig =
        typeof directEndpoint === "string"
            ? {
                  endpoint: directEndpoint,
                  additionalHeaders,
              }
            : {
                  endpoint: () => buildEndpoint(portkeyGatewayUrl),
                  additionalHeaders: {
                      "x-portkey-request-timeout": String(
                          PORTKEY_REQUEST_TIMEOUT_MS,
                      ),
                      ...additionalHeaders,
                  },
                  fetcher: portkeyFetcher,
              };

    delete state.options.additionalHeaders;
    delete state.options.portkeyGatewayUrl;

    // Models marked for Responses use their declared direct Responses target;
    // the adapter keeps the public Chat Completions contract stateless.
    const communityResponsesEndpoint =
        !modelDef &&
        typeof state.options.modelConfig?.responsesEndpoint === "string";
    if (modelDef?.useResponsesApi || communityResponsesEndpoint) {
        return await callChatViaResponses(
            state.messages,
            state.options,
            responsesFetcher,
        );
    }

    // This internal transport belongs only to the Responses adapter.
    delete state.options.responsesFetcher;

    if (modelDef?.useVercelSearchFormatting)
        return callVercelSearch(state.messages, state.options, requestConfig);

    const completion = await genericOpenAIClient(
        state.messages,
        state.options,
        requestConfig,
    );
    return modelDef?.name === "cohere/command-a-plus"
        ? sanitizeCohereResponse(completion)
        : completion;
}

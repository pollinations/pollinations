import type {
    CreateResponseRequest,
    ResponseUsage,
} from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type { FallbackCandidate } from "../../fallback.ts";
import { requireChatCompletionUsage } from "../chat/usage.js";
import { generateTextPortkey } from "../generateTextPortkey.js";
import { gatewayContext } from "../handler.js";
import { getChatRequestData } from "../requestUtils.js";
import type { RequestData } from "../types.js";
import {
    chatCompletionToResponse,
    responsesToChatRequest,
} from "./chatAdapter.js";
import { chatStreamToResponsesEvents } from "./chatAdapterStream.js";

type ResponsesContext = Context<Env>;

export type ChatAdaptedResult = {
    response: Response;
    requestUrl: URL;
    usage: ResponseUsage | null;
};

/**
 * Serve a Responses request on a Chat-only model.
 *
 * The request is translated and run through the Chat pipeline — the same
 * transforms, provider resolution, and Portkey transport `/v1/chat/completions`
 * uses — so balance, rate limits, and billing behave exactly like Chat.
 * The completion is translated back, with the Chat usage mapped into
 * Responses usage so billing and stream validation stay uniform.
 */
export async function callChatAdaptedResponses(
    c: ResponsesContext,
    request: CreateResponseRequest,
    candidate: FallbackCandidate,
): Promise<ChatAdaptedResult> {
    const chatRequest = responsesToChatRequest(request);
    const requestData = getChatRequestData(chatRequest) as RequestData;
    const options = await gatewayContext(c, requestData, candidate);
    const portkey = c.env.PORTKEY;
    const completion = await generateTextPortkey(
        requestData.messages,
        options,
        portkey ? (input, init) => portkey.fetch(input, init) : undefined,
    );
    const requestUrl =
        completion.upstreamRequestUrl ??
        new URL("https://chat.local/completions");
    const model = candidate.id || request.model;

    if (request.stream) {
        const stream = chatStreamToResponsesEvents(completion, request, model);
        return {
            response: new Response(stream, {
                headers: { "Content-Type": "text/event-stream; charset=utf-8" },
            }),
            requestUrl,
            usage: null,
        };
    }

    requireChatCompletionUsage(completion);
    const response = chatCompletionToResponse(completion, request, model);
    return {
        response: new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
        requestUrl,
        usage: response.usage ?? null,
    };
}

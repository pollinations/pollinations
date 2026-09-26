import { UpstreamError } from "@shared/error.ts";
import type { AnthropicMessageRequest } from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { applySafetyToInput, withSafetyHeaders } from "@/middleware/safety.ts";
import { assertStreamContentType } from "../../utils/upstream-response.ts";
import { handleChatCompletionLocal } from "../handler.ts";
import type { ChatCompletion } from "../types.js";
import { anthropicToChatRequest } from "./request.js";
import { chatCompletionToAnthropic } from "./response.js";
import { chatStreamToAnthropic } from "./stream.js";

type MessagesContext = Context<Env>;

function responseHeaders(source: Response, streaming: boolean): Headers {
    const headers = new Headers(source.headers);
    headers.set(
        "Content-Type",
        streaming
            ? "text/event-stream; charset=utf-8"
            : "application/json; charset=utf-8",
    );
    if (streaming) {
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");
    }
    return headers;
}

export async function generateAnthropicMessage(
    c: MessagesContext,
): Promise<Response> {
    const request = c.req.valid("json" as never) as AnthropicMessageRequest;
    const chatRequest = anthropicToChatRequest(
        {
            ...request,
            model: c.var.model.resolved,
        },
        {
            preserveThinkingBlocks:
                c.var.model.resolved.startsWith("anthropic/"),
        },
    );
    const safeRequest = await applySafetyToInput(c, chatRequest);
    const response = await handleChatCompletionLocal(c, safeRequest);
    if (!response.ok) return response;

    assertStreamContentType(c, response, c.var.upstreamRequestUrl);

    if (request.stream) {
        if (!response.body) {
            throw new UpstreamError(502, {
                message: "Text model returned an empty stream",
                requestUrl: c.var.upstreamRequestUrl,
            });
        }
        return withSafetyHeaders(
            c,
            new Response(chatStreamToAnthropic(response.body, request.model), {
                headers: responseHeaders(response, true),
            }),
        );
    }

    let completion: ChatCompletion;
    try {
        completion = (await response.json()) as ChatCompletion;
    } catch (cause) {
        throw new UpstreamError(502, {
            message: "Text model returned invalid Chat Completions JSON",
            requestUrl: c.var.upstreamRequestUrl,
            cause,
        });
    }

    return withSafetyHeaders(
        c,
        new Response(
            JSON.stringify(
                chatCompletionToAnthropic(completion, request.model),
            ),
            { headers: responseHeaders(response, false) },
        ),
    );
}

import type { CreateMessageRequest } from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { applySafetyToInput } from "@/middleware/safety.ts";
import { assertStreamContentType } from "../../utils/upstream-response.js";
import { handleChatCompletionLocal } from "../handler.js";
import type { ChatCompletion } from "../types.js";
import { AnthropicApiError } from "./errors.js";
import { assertMaxTokens, messagesToChatRequest } from "./request.js";
import { chatCompletionToMessage } from "./response.js";
import { toAnthropicMessageStream } from "./stream.js";

/**
 * POST /v1/messages handler: translate an Anthropic Messages request into
 * the existing Chat Completions pipeline (no second provider path) and
 * translate the response or stream back into Messages shape.
 */
export async function generateMessage(c: Context<Env>): Promise<Response> {
    const request = c.req.valid("json" as never) as CreateMessageRequest;
    assertMaxTokens(request);

    const chatRequest = await applySafetyToInput(
        c,
        messagesToChatRequest(request),
    );
    const response = await handleChatCompletionLocal(c, chatRequest);
    if (!response.body) {
        throw new AnthropicApiError(502, "Upstream returned an empty body");
    }

    if (chatRequest.stream) {
        assertStreamContentType(c, response, c.var.upstreamRequestUrl);
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.set("Content-Type", "text/event-stream; charset=utf-8");
        return new Response(
            toAnthropicMessageStream(
                response.body,
                crypto.randomUUID(),
                request.model,
            ),
            { headers },
        );
    }

    const completion = (await response.json()) as ChatCompletion;
    const message = chatCompletionToMessage(completion, request.model);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(message), { headers });
}

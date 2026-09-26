import { MODEL_USED_HEADER } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { chatCompletionResponse } from "../../routes/generation-handlers.ts";
import { type CreateMessageRequest, messagesToChatRequest } from "./request.ts";
import { chatToMessage } from "./response.ts";
import { chatStreamToMessageStream } from "./stream.ts";

/**
 * Anthropic Messages on top of the Chat Completions pipeline: model fallback,
 * usage validation and billing all run there, unchanged. Only the request and
 * the response are translated. Tracking keeps the Chat-shaped response it
 * captured, so billing sees exactly what it would for Chat Completions.
 */
export async function generateMessage(c: Context<Env>): Promise<Response> {
    const request = c.req.valid("json" as never) as CreateMessageRequest;
    const response = await chatCompletionResponse(
        c,
        messagesToChatRequest(request, c.var.model.resolved),
    );
    if (!response.ok) return response;

    const model =
        response.headers.get(MODEL_USED_HEADER) ?? c.var.model.resolved;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    if (request.stream) {
        headers.set("content-type", "text/event-stream; charset=utf-8");
        return new Response(
            chatStreamToMessageStream(
                response.body as ReadableStream<Uint8Array<ArrayBuffer>>,
                model,
            ),
            { headers },
        );
    }
    headers.set("content-type", "application/json; charset=utf-8");
    return Response.json(chatToMessage(await response.json(), model), {
        headers,
    });
}

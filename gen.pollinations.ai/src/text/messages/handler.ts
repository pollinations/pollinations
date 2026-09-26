import type { ModelDefinition } from "@shared/registry/registry.ts";
import type { CreateMessageRequest } from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { applySafetyToInput, withSafetyHeaders } from "@/middleware/safety.ts";
import { assertStreamContentType } from "../../utils/upstream-response.js";
import { handleChatCompletionLocal } from "../handler.js";
import type { ChatCompletion } from "../types.js";
import { messagesToChatRequest } from "./request.js";
import { chatCompletionToMessage } from "./response.js";
import { toAnthropicMessageStream } from "./stream.js";

function messagesCapabilityError(
    definition: ModelDefinition | undefined,
): string | undefined {
    if (definition?.outputModalities?.some((modality) => modality !== "text")) {
        return "This model's output cannot be represented by the Messages API; use /v1/chat/completions instead.";
    }
}

export async function generateMessage(c: Context<Env>): Promise<Response> {
    const anthropicRequest = c.req.valid(
        "json" as never,
    ) as CreateMessageRequest;

    const capabilityError = messagesCapabilityError(c.var.model.definition);
    if (capabilityError) {
        throw new HTTPException(400, { message: capabilityError });
    }

    const chatRequest = await applySafetyToInput(
        c,
        messagesToChatRequest(anthropicRequest, c.var.model.resolved),
    );
    const response = await handleChatCompletionLocal(c, chatRequest);
    assertStreamContentType(c, response, c.var.upstreamRequestUrl);

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    if (chatRequest.stream) {
        headers.set("Content-Type", "text/event-stream; charset=utf-8");
        return withSafetyHeaders(
            c,
            new Response(
                response.body
                    ? toAnthropicMessageStream(
                          response.body,
                          c.var.model.resolved,
                      )
                    : null,
                { headers },
            ),
        );
    }

    const completion = (await response.json()) as ChatCompletion;
    headers.set("Content-Type", "application/json; charset=utf-8");
    return withSafetyHeaders(
        c,
        new Response(
            JSON.stringify(
                chatCompletionToMessage(completion, c.var.model.resolved),
            ),
            { headers },
        ),
    );
}

import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import type {
    CreateChatCompletionRequest,
    CreateResponseRequest,
} from "@shared/schemas/openai.ts";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";
import {
    createTextResponse,
    textResponseStream,
} from "../media/response-output.ts";
import type { GenerateTextRequestQueryParams } from "../schemas/text.ts";
import {
    responsesToChatCompletion,
    responsesToChatStream,
} from "../text/responses/chatResponse.ts";

// Set false to restore HTTP 402 for every insufficient-balance response.
export const TEXT_BALANCE_NOTICE_ENABLED = true;

const MESSAGE =
    "Your Pollen balance is too low for this request. " +
    "[Top up](https://enter.pollinations.ai/pollen?ref=agent_low_balance_topup) or " +
    "[complete a quest](https://enter.pollinations.ai/quests?ref=agent_low_balance_quests), then try again.";

/** Wrap tracking and caching so they capture the original 402 before formatting. */
export const textBalanceNotice = createMiddleware<Env>(async (c, next) => {
    await next();

    const error = c.get("error");
    if (
        !TEXT_BALANCE_NOTICE_ENABLED ||
        c.res.status !== 402 ||
        !(error instanceof PaymentRequiredError) ||
        error.errorCode !== "INSUFFICIENT_BALANCE"
    )
        return;

    const isResponses = c.req.path === "/v1/responses";
    const request = c.req.valid(
        (c.req.method === "GET" ? "query" : "json") as never,
    ) as GenerateTextRequestQueryParams &
        CreateChatCompletionRequest &
        CreateResponseRequest;
    const format = isResponses
        ? request.text?.format?.type
        : request.response_format?.type;
    if (
        request.json === true ||
        format === "json_object" ||
        format === "json_schema"
    )
        return;

    // Hono preserves the old headers on replacement; update and pass them along.
    const headers = c.res.headers;
    headers.set("Cache-Control", "private, no-store");
    headers.delete("content-length");
    if (
        !request.stream &&
        !isResponses &&
        c.req.path !== "/v1/chat/completions"
    ) {
        headers.set("Content-Type", "text/plain; charset=utf-8");
        c.res = new Response(MESSAGE, { headers });
        return;
    }

    const model = c.var.model.requested ?? c.var.model.resolved;
    const response = createTextResponse(model, MESSAGE, {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
    });

    if (request.stream) {
        headers.set("Content-Type", "text/event-stream; charset=utf-8");
        const stream = textResponseStream(response);
        c.res = new Response(
            isResponses ? stream : responsesToChatStream(stream, model),
            { headers },
        );
    } else {
        headers.set("Content-Type", "application/json; charset=utf-8");
        c.res = Response.json(
            isResponses
                ? response
                : responsesToChatCompletion(
                      response,
                      model,
                      new URL(c.req.url),
                  ),
            { headers },
        );
    }
});

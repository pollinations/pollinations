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
    "[Top up](https://enter.pollinations.ai/pollen?ref=balance_topup) or " +
    "[complete a quest](https://enter.pollinations.ai/quests?ref=balance_quests) " +
    "to add Pollen, then try again.";

/** Must wrap tracking and caching: both finish handling the original 402 first. */
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

    // Hono keeps previous headers when replacing c.res. Set these on it first.
    c.res.headers.set("Cache-Control", "private, no-store");
    c.res.headers.delete("content-length");
    const model = c.var.model.requested ?? c.var.model.resolved;
    const response = createTextResponse(model, MESSAGE, {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
    });

    if (request.stream) {
        c.res.headers.set("Content-Type", "text/event-stream; charset=utf-8");
        const stream = textResponseStream(response);
        c.res = new Response(
            isResponses ? stream : responsesToChatStream(stream, model),
            { headers: c.res.headers },
        );
    } else if (c.req.path === "/v1/chat/completions" || isResponses) {
        c.res.headers.set("Content-Type", "application/json; charset=utf-8");
        c.res = Response.json(
            isResponses
                ? response
                : responsesToChatCompletion(
                      response,
                      model,
                      new URL(c.req.url),
                  ),
            { headers: c.res.headers },
        );
    } else {
        c.res.headers.set("Content-Type", "text/plain; charset=utf-8");
        c.res = new Response(MESSAGE, { headers: c.res.headers });
    }
});

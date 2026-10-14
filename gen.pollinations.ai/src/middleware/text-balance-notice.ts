import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import { PermissionRequiredError } from "@shared/http/permission-required-error.ts";
import type {
    CreateChatCompletionRequest,
    CreateResponseRequest,
} from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";
import {
    createTextResponse,
    textResponseStream,
} from "../media/response-output.ts";
import type { GenerateTextRequestQueryParams } from "../schemas/text.ts";
import { requestsJson } from "../text/requestUtils.ts";
import {
    responsesToChatCompletion,
    responsesToChatStream,
} from "../text/responses/chatResponse.ts";
import { fixLink } from "../utils/refusals.ts";

// Text routes answer these errors as a chat reply with a link to fix them.
// Set one false to return the plain HTTP error instead. JSON and audio
// requests always get the plain error.
export const TEXT_BALANCE_NOTICE_ENABLED = true; // 402
export const TEXT_PERMISSION_NOTICE_ENABLED = true; // 403 model not allowed

const NOT_YOUR_ACCOUNT =
    "If this isn’t your Pollinations account, contact whoever runs the app or service you’re using.";

// The links come from the error, so the chat reply and the JSON error agree.
function balanceNoticeMessage(
    c: Context<Env>,
    error: PaymentRequiredError,
): string {
    if (error.errorCode === "KEY_BUDGET_EXHAUSTED") {
        return (
            "The API key used for this request has reached its budget. " +
            `Please [raise the key budget](${error.fixUrl}), then try again.\n\n` +
            `Topping up the wallet does not raise this limit. ${NOT_YOUR_ACCOUNT}`
        );
    }
    if (error.errorCode === "QUEST_POLLEN_ONLY") {
        const allowPaid = `[allow paid Pollen for this key](${error.fixUrl})`;
        const remedy = error.paidOnly
            ? `This model needs paid Pollen. Please ${allowPaid}, then try again.`
            : `Please [complete a quest](${fixLink(c, "/quests", { ref: "agent_quest_pollen_only_quests" })}) or ${allowPaid}, then try again.`;
        return (
            `The API key used for this request only spends Quest Pollen${error.paidOnly ? "" : ", and there isn't enough left"}. ` +
            `${remedy}\n\n${NOT_YOUR_ACCOUNT}`
        );
    }
    const topUp = `[top up](${error.fixUrl})`;
    const remedy = error.paidOnly
        ? `This model needs paid Pollen. Please ${topUp}, then try again.`
        : `Please ${topUp} or [complete a quest](${fixLink(c, "/quests", { ref: "agent_low_balance_quests" })}), then try again.`;
    return (
        "The account behind this API key doesn't have enough credits. " +
        `${remedy}\n\n${NOT_YOUR_ACCOUNT}`
    );
}

function noticeMessage(c: Context<Env>): string | undefined {
    const error = c.get("error");
    if (
        TEXT_BALANCE_NOTICE_ENABLED &&
        c.res.status === 402 &&
        error instanceof PaymentRequiredError
    )
        return balanceNoticeMessage(c, error);
    if (
        TEXT_PERMISSION_NOTICE_ENABLED &&
        c.res.status === 403 &&
        error instanceof PermissionRequiredError
    )
        return (
            `The API key used for this request isn't allowed to use ${c.var.model.requested}. ` +
            `Please [allow it for this key](${error.fixUrl}), then try again.\n\n${NOT_YOUR_ACCOUNT}`
        );
}

/** Wrap tracking and caching so they capture the original 402/403 before formatting. */
export const textBalanceNotice = createMiddleware<Env>(async (c, next) => {
    await next();

    const message = noticeMessage(c);
    if (!message) return;

    const isResponses = c.req.path === "/v1/responses";
    const request = c.req.valid(
        (c.req.method === "POST" ? "json" : "query") as never,
    ) as GenerateTextRequestQueryParams &
        CreateChatCompletionRequest &
        CreateResponseRequest;
    const outputModalities =
        request.modalities ?? c.var.model.definition.outputModalities;
    if (outputModalities?.includes("audio")) return;
    const format = isResponses
        ? request.text?.format?.type
        : request.response_format?.type;
    // Match chat normalization: an explicit response_format overrides aliases.
    const jsonAlias =
        !isResponses &&
        !request.response_format &&
        requestsJson(request.json, request.jsonMode);
    if (jsonAlias || format === "json_object" || format === "json_schema")
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
        c.res = new Response(message, { headers });
        return;
    }

    const model = c.var.model.requested ?? c.var.model.resolved;
    const response = createTextResponse(model, message, {
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

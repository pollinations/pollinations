import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
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

// Set false to restore HTTP 402 for every insufficient-balance response.
export const TEXT_BALANCE_NOTICE_ENABLED = true;

const NOT_YOUR_ACCOUNT =
    "If this isn’t your Pollinations account, contact whoever runs the app or service you’re using.";

/** Staging gen links to staging enter, where the Open WebUI staging user is logged in. */
function enterUrl(environment: string): string {
    return environment === "staging"
        ? PUBLIC_URLS.enter.staging
        : PUBLIC_URLS.enter.production;
}

function enterLink(
    environment: string,
    path: string,
    params: Record<string, string | null | undefined>,
): string {
    const url = new URL(path, enterUrl(environment));
    for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
    }
    return url.toString();
}

function appOrigin(c: Context<Env>): string | null {
    const stored = c.var.auth?.apiKey?.metadata?.redirectOrigin;
    if (typeof stored === "string") return stored;
    const referer = c.req.header("referer");
    if (!referer) return null;
    try {
        return new URL(referer).origin;
    } catch {
        return null;
    }
}

export function balanceNoticeMessage(
    environment: string,
    error: Pick<PaymentRequiredError, "errorCode" | "paidOnly">,
    keyId: string | undefined,
    redirect: string | null,
): string {
    if (error.errorCode === "KEY_BUDGET_EXHAUSTED") {
        return (
            "The API key used for this request has reached its budget. " +
            "Please " +
            `[raise the key budget](${enterLink(environment, "/edit-key", { id: keyId, ref: "agent_key_budget", redirect })}), then try again.\n\n` +
            `Topping up the wallet does not raise this limit. ${NOT_YOUR_ACCOUNT}`
        );
    }
    const topUp = `[top up](${enterLink(environment, "/top-up", { ref: "agent_low_balance_topup", redirect })})`;
    const remedy = error.paidOnly
        ? `This model needs paid Pollen. Please ${topUp}, then try again.`
        : `Please ${topUp} or [complete a quest](${enterLink(environment, "/quests", { ref: "agent_low_balance_quests" })}), then try again.`;
    return (
        "The account behind this API key doesn't have enough credits. " +
        `${remedy}\n\n${NOT_YOUR_ACCOUNT}`
    );
}

/** Wrap tracking and caching so they capture the original 402 before formatting. */
export const textBalanceNotice = createMiddleware<Env>(async (c, next) => {
    await next();

    const error = c.get("error");
    if (
        !TEXT_BALANCE_NOTICE_ENABLED ||
        c.res.status !== 402 ||
        !(error instanceof PaymentRequiredError)
    )
        return;
    const message = balanceNoticeMessage(
        c.env.ENVIRONMENT,
        error,
        c.var.auth?.apiKey?.id,
        appOrigin(c),
    );

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

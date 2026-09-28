// POST /v1/messages — Anthropic Messages API surface over the existing Chat
// Completions generation pipeline (validation, model resolution, safety,
// caching, deduplication, tracking, and billing all stay in the pipeline).
//
// Errors thrown anywhere in a /v1/messages request — auth, balance, rate
// limits, model resolution, validation, or the generation itself — are
// rendered by handleErrorForRoute, which keeps the standard error funnel
// (telemetry, retry-after) and reshapes the final body into Anthropic's
// {"type":"error", ...} envelope.

import { handleError } from "@shared/error.ts";
import type {
    AnthropicMessagesRequest,
    AnthropicMessagesResponse,
} from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { applySafetyToInput, withSafetyHeaders } from "@/middleware/safety.ts";
import { assertStreamContentType } from "../../utils/upstream-response.ts";
import { handleChatCompletionLocal } from "../handler.js";
import type { ChatCompletion } from "../types.js";
import { anthropicToChatRequest, UnsupportedContentError } from "./request.js";
import { chatCompletionToAnthropicMessage } from "./response.js";
import { chatStreamToAnthropicEvents } from "./stream.js";

export const MESSAGES_PATH = "/v1/messages";

type TextContext = Context<Env>;

function isMessagesRequest(c: Context<Env>): boolean {
    return c.req.path === MESSAGES_PATH;
}

const ANTHROPIC_ERROR_TYPES: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    402: "billing_error",
    403: "permission_error",
    404: "not_found_error",
    407: "authentication_error",
    409: "invalid_request_error",
    413: "request_too_large",
    422: "invalid_request_error",
    429: "rate_limit_error",
    500: "api_error",
    502: "api_error",
    503: "overloaded_error",
    504: "api_error",
    529: "overloaded_error",
};

/**
 * Runs the standard error funnel, then reshapes the body of /v1/messages
 * responses into Anthropic's error envelope. Every other route is returned
 * exactly as before; only the JSON body of Messages errors differs.
 */
export async function handleErrorForRoute(
    err: Error,
    c: Context<Env>,
): Promise<Response> {
    const response = await handleError(err, c);
    if (!isMessagesRequest(c)) return response;

    let message: string | undefined;
    try {
        const body = (await response.json()) as {
            error?: { message?: unknown };
        };
        const text = body?.error?.message;
        if (typeof text === "string") message = text;
    } catch {
        // Non-JSON error bodies (HEAD requests, early returns) pass through.
        return response;
    }

    const status = response.status;
    const headers = new Headers(response.headers);
    if (status === 429) {
        // Anthropic clients expect an integer retry-after in seconds.
        const retryAfter = Math.ceil(Number(headers.get("retry-after") ?? 1));
        headers.set(
            "retry-after",
            String(
                Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1,
            ),
        );
    }
    headers.set("content-type", "application/json; charset=utf-8");

    return new Response(
        JSON.stringify({
            type: "error",
            error: {
                type: ANTHROPIC_ERROR_TYPES[status] ?? "api_error",
                message:
                    message ??
                    (err instanceof Error && err.message
                        ? err.message
                        : "Request failed"),
            },
        }),
        { status: response.status as ContentfulStatusCode, headers },
    );
}

function requireTextOutputModel(c: TextContext): void {
    const modalities = c.var.model.definition.outputModalities;
    if (modalities && !modalities.includes("text")) {
        throw new HTTPException(400, {
            message: `Model "${c.var.model.resolved}" does not produce text output and cannot be used on ${MESSAGES_PATH}.`,
        });
    }
}

/** Route handler for POST /v1/messages. */
export async function generateMessages(c: TextContext): Promise<Response> {
    const request = c.req.valid("json" as never) as AnthropicMessagesRequest;
    requireTextOutputModel(c);

    let translated: ReturnType<typeof anthropicToChatRequest>;
    try {
        translated = anthropicToChatRequest(request, c.var.model.resolved);
    } catch (error) {
        if (error instanceof UnsupportedContentError) {
            throw new HTTPException(400, { message: error.message });
        }
        throw error;
    }

    // Safety parity with Chat Completions: a caller-provided `safe` query
    // parameter or header runs the same guardrail scan over the translated
    // request. Claude Code never sends one, so this is a no-op for it.
    const chatRequest = await applySafetyToInput(c, translated);

    const response = await handleChatCompletionLocal(c, chatRequest);
    if (!response.ok) return response;

    assertStreamContentType(c, response, c.var.upstreamRequestUrl);

    const headers = new Headers(response.headers);

    if (chatRequest.stream === true) {
        const stream = chatStreamToAnthropicEvents(
            response.body as ReadableStream<Uint8Array>,
            {
                id: `msg_${crypto.randomUUID()}`,
                model: c.var.model.resolved,
            },
        );
        headers.set("content-type", "text/event-stream; charset=utf-8");
        headers.set("cache-control", "no-cache");
        return withSafetyHeaders(c, new Response(stream, { headers }));
    }

    const completion = (await response.clone().json()) as ChatCompletion;
    const message: AnthropicMessagesResponse = chatCompletionToAnthropicMessage(
        completion,
        c.var.model.resolved,
    );
    return withSafetyHeaders(
        c,
        new Response(JSON.stringify(message), { headers }),
    );
}

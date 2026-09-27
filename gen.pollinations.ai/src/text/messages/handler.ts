// Serve a Messages request through the existing Chat Completions pipeline.
//
// The translated chat body flows through handleChatCompletionLocal, so
// tracking/billing sees the original OpenAI bytes (via the pipeline's own
// response-tracking override) while the client receives Anthropic bytes.
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { CreateMessagesRequest } from "@shared/schemas/anthropic.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { UpstreamError } from "@shared/error.ts";
import { handleChatCompletionLocal } from "../handler.js";
import {
    MessagesUsageError,
    translateChatCompletion,
} from "./response.js";
import { chatStreamToMessagesStream } from "./stream.js";

type MessagesContext = Context<Env>;

function forwardedHeaders(upstream: Response): Headers {
    const headers = new Headers();
    upstream.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (
            lower === "content-type" ||
            lower === "content-length" ||
            lower === "transfer-encoding" ||
            lower === "connection"
        ) {
            return;
        }
        headers.set(name, value);
    });
    return headers;
}

async function failedUpstreamError(
    upstream: Response,
    requestUrl: URL | undefined,
): Promise<UpstreamError> {
    let body: string | undefined;
    try {
        body = await upstream.text();
    } catch {
        body = undefined;
    }
    let message = `Text provider returned HTTP ${upstream.status}`;
    if (body) {
        try {
            const parsed = JSON.parse(body);
            const extracted =
                parsed?.error?.message || parsed?.message ||
                (typeof parsed?.error === "string" ? parsed.error : null);
            if (typeof extracted === "string" && extracted) message = extracted;
        } catch {
            // Keep the default message; the raw body is attached below.
        }
    }
    return new UpstreamError(
        (upstream.status >= 400 && upstream.status <= 599
            ? upstream.status
            : 502) as ContentfulStatusCode,
        {
            message,
            requestUrl,
            responseBody: body,
        },
    );
}

export async function handleMessagesLocal(
    c: MessagesContext,
    body: CreateMessagesRequest,
    chatBody: CreateChatCompletionRequest,
): Promise<Response> {
    const requestedModel =
        chatBody.model || c.var.model.resolved || body.model;
    const upstream = await handleChatCompletionLocal(c, {
        ...chatBody,
        model: requestedModel,
    });
    if (!upstream.ok || !upstream.body) {
        throw await failedUpstreamError(upstream, c.var.upstreamRequestUrl);
    }

    if (!chatBody.stream) {
        let completion: unknown;
        try {
            completion = await upstream.json();
        } catch {
            throw new UpstreamError(502, {
                message: "Text provider returned invalid JSON",
                requestUrl: c.var.upstreamRequestUrl,
            });
        }
        let message;
        try {
            message = translateChatCompletion(
                (completion ?? {}) as Parameters<typeof translateChatCompletion>[0],
                requestedModel,
            );
        } catch (error) {
            if (error instanceof MessagesUsageError) {
                throw new UpstreamError(502, {
                    message: error.message,
                    requestUrl: c.var.upstreamRequestUrl,
                });
            }
            throw error;
        }
        const headers = forwardedHeaders(upstream);
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("Cache-Control", "no-store");
        return new Response(JSON.stringify(message), {
            status: 200,
            headers,
        });
    }

    const headers = forwardedHeaders(upstream);
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");
    return new Response(
        chatStreamToMessagesStream(upstream.body, { model: requestedModel }),
        { status: 200, headers },
    );
}

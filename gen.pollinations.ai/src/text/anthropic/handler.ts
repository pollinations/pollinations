// POST /v1/messages — Anthropic Messages API on top of the Chat pipeline.
//
// The gateway already serves /v1/chat/completions. Anthropic clients speak a
// different wire, so this handler translates in both directions and hands the
// request to the same Chat Completions pipeline — no second provider path.
//
// Billing: the Chat pipeline (and its track middleware) reads OpenAI-shaped
// usage. The outgoing body here is Anthropic-shaped, which the middleware
// cannot parse, so the outgoing response is teed and an OpenAI-shaped clone
// is handed to `overrideResponseTracking`, exactly as the Responses endpoint
// does. When the provider reports no usage, the missing-usage failure still
// fires (JSON error / `error` stream event) instead of going unbilled.

import {
    buildUsageHeaders,
    MODEL_USED_HEADER,
} from "@shared/registry/usage-headers.ts";
import type { CreateAnthropicMessageRequest } from "@shared/schemas/anthropic.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { syncTextEnvironment } from "@/text/environment.ts";
import { throwTextError } from "@/text/errors.ts";
import { handleChatCompletionLocal } from "@/text/handler.ts";
import type { ChatCompletion, ServiceError } from "@/text/types.ts";
import { AnthropicRequestError, anthropicErrorResponse } from "./errors.ts";
import { toAnthropicStream } from "./stream.ts";
import {
    anthropicToChatRequest,
    chatToAnthropicResponse,
} from "./translate.ts";

type MessagesContext = Context<Env>;

/** Read the validated Messages body the route middleware attached. */
const readRequest = (c: MessagesContext): CreateAnthropicMessageRequest =>
    c.req.valid("json" as never) as CreateAnthropicMessageRequest;

const isMediaModel = (
    definition: { outputModalities?: string[] } | undefined,
) =>
    Boolean(
        definition?.outputModalities &&
            !definition.outputModalities.includes("text"),
    );

/** Chat usage -> the OpenAI-shaped usage object the tracker understands. */
const usageForTracking = (completion: ChatCompletion) => {
    const raw = (completion.usage ?? {}) as Record<string, unknown>;
    return {
        prompt_tokens: raw.prompt_tokens,
        completion_tokens: raw.completion_tokens,
        total_tokens: raw.total_tokens,
        ...(raw.prompt_tokens_details
            ? { prompt_tokens_details: raw.prompt_tokens_details }
            : {}),
    };
};

export async function generateAnthropicMessage(
    c: MessagesContext,
): Promise<Response> {
    syncTextEnvironment(c.env);
    const request = readRequest(c);

    try {
        if (isMediaModel(c.var.model?.definition)) {
            throw new AnthropicRequestError(
                "invalid_request_error",
                `Model "${request.model}" is not a text model; /v1/messages requires a text model.`,
                400,
            );
        }

        const chatBody = anthropicToChatRequest(
            request,
        ) as CreateChatCompletionRequest;
        const upstream = await handleChatCompletionLocal(c, chatBody);

        if (!upstream.ok && !request.stream) {
            // Preserve upstream failures but re-shape them for Anthropic.
            let payload: unknown = null;
            try {
                payload = await upstream.clone().json();
            } catch {
                payload = null;
            }
            const message =
                (payload as { error?: { message?: string } } | null)?.error
                    ?.message ?? "Upstream request failed.";
            return anthropicErrorResponse(c, {
                status: upstream.status,
                message,
            });
        }

        // Re-adapt the Chat response/stream into the Messages wire.
        const modelUsed =
            upstream.headers.get(MODEL_USED_HEADER) ?? request.model;

        if (request.stream) {
            const body = upstream.body;
            if (!body) {
                throw new AnthropicRequestError(
                    "api_error",
                    "Upstream returned no stream body.",
                    502,
                );
            }
            const anthropicStream = toAnthropicStream({
                body,
                messageId: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
                model: modelUsed,
            });
            const [clientBody, trackingBody] = anthropicStream.tee();
            const headers = new Headers({
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                [MODEL_USED_HEADER]: modelUsed,
            });
            const response = new Response(clientBody, { headers });
            // The tracker cannot read Anthropic SSE, so re-frame the clone as
            // a minimal OpenAI SSE carrying the usage the stream reported.
            c.var.track?.overrideResponseTracking(
                anthropicToTrackableStream(trackingBody, modelUsed),
            );
            return response;
        }

        const completion = (await upstream.json()) as ChatCompletion;
        const anthropic = chatToAnthropicResponse(completion, request.model);
        const headers = new Headers({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            [MODEL_USED_HEADER]: modelUsed,
        });
        const usage = usageForTracking(completion);
        for (const [name, value] of Object.entries(
            buildUsageHeaders(modelUsed, usage as never),
        )) {
            headers.set(name, value);
        }
        const response = new Response(JSON.stringify(anthropic), { headers });
        c.var.track?.overrideResponseTracking(response.clone());
        return response;
    } catch (thrown) {
        if (thrown instanceof AnthropicRequestError) {
            return anthropicErrorResponse(c, thrown);
        }
        // Reuse the gateway's error funnel, then re-shape to Anthropic.
        try {
            throwTextError(thrown as ServiceError);
        } catch (mapped) {
            return anthropicErrorResponse(c, mapped);
        }
    }
}

/**
 * Re-frame the Anthropic SSE clone as an OpenAI SSE chunk stream carrying the
 * same usage, so the shared tracker extracts and settles it. Missing usage in
 * the Anthropic stream surfaces as a missing-usage failure downstream.
 */
function anthropicToTrackableStream(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    model: string,
): Response {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const tracked = new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
            let buffer = "";
            const reader = body.getReader();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const segments = buffer.split("\n\n");
                    buffer = segments.pop() ?? "";
                    for (const segment of segments) {
                        const dataLine = segment
                            .split("\n")
                            .find((line) => line.startsWith("data:"));
                        if (!dataLine) continue;
                        let event: Record<string, unknown>;
                        try {
                            event = JSON.parse(dataLine.slice(5).trim());
                        } catch {
                            continue;
                        }
                        if (
                            event.type === "message_start" ||
                            event.type === "message_delta"
                        ) {
                            const messageUsage =
                                (
                                    event.message as
                                        | { usage?: unknown }
                                        | undefined
                                )?.usage ?? event.usage;
                            if (!messageUsage) continue;
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        id: "msg_track",
                                        model,
                                        choices: [
                                            {
                                                index: 0,
                                                delta: {},
                                                finish_reason: null,
                                            },
                                        ],
                                        usage: messageUsage,
                                    })}\n\n`,
                                ),
                            );
                        }
                        if (event.type === "message_stop") {
                            controller.enqueue(
                                encoder.encode("data: [DONE]\n\n"),
                            );
                        }
                    }
                }
            } finally {
                controller.close();
            }
        },
    });
    return new Response(tracked, {
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
}

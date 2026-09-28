import { CreateChatCompletionResponseSchema } from "@shared/schemas/openai.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    type CreateMessageRequest,
    CreateMessageRequestSchema,
    CreateMessageResponseSchema,
    MessagesErrorSchema,
} from "../text/messages/schema.ts";
import { chatToMessagesStream } from "../text/messages/stream.ts";
import {
    chatToMessagesResponse,
    MessagesRequestError,
    messagesError,
    messagesToChatRequest,
} from "../text/messages/translate.ts";
import { textBodyLimit } from "./generation-handlers.ts";

type Dispatch = (
    request: Request,
    c: Context<Env>,
) => Response | Promise<Response>;

function errorResponse(status: number, message: string, headers?: Headers) {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(messagesError(status, message)), {
        status,
        headers: responseHeaders,
    });
}

async function upstreamErrorMessage(response: Response): Promise<string> {
    const text = await response.text();
    try {
        return JSON.parse(text).error?.message ?? text;
    } catch {
        return text;
    }
}

/**
 * Anthropic Messages API. Each request runs as a Chat Completions request
 * through the whole chat route, so auth, balance, rate limits, caching,
 * deduplication, tracking and billing are exactly those of chat.
 */
export function createMessagesRoutes(dispatch: Dispatch) {
    const app = new Hono<Env>().onError((error) =>
        errorResponse(
            error instanceof HTTPException ? error.status : 500,
            error instanceof HTTPException
                ? error.message || "Request failed"
                : "Internal server error",
        ),
    );
    return app.post(
        "/v1/messages",
        describeRoute({
            tags: ["✍️ Text"],
            summary: "Create Message (Anthropic-compatible)",
            description: [
                "Anthropic Messages API for Claude Code, the Anthropic SDKs, and other Messages clients. Point the client's base URL at `https://gen.pollinations.ai` and authenticate with `Authorization: Bearer`.",
                "",
                "Runs every model that lists `/v1/messages` in `supported_endpoints` — the same text models as Chat Completions, with the same balance checks, key permissions, rate limits, caching, and billing. Supports streaming, tools, images, system prompts, stop sequences, `cache_control`, and thinking. Thinking maps to `reasoning_effort`; provider reasoning returns as `thinking` blocks.",
                "",
                "Errors use Anthropic's error shape. `count_tokens`, batches, files, server tools, and `x-api-key` auth are not supported.",
            ].join("\n"),
            responses: {
                200: {
                    description: "Message JSON or Messages SSE stream",
                    content: {
                        "application/json": {
                            schema: resolver(CreateMessageResponseSchema),
                        },
                        "text/event-stream": {
                            schema: resolver(
                                z.string().meta({
                                    description:
                                        "Messages events from message_start to message_stop, with ping keepalives. A failed stream ends with an error event.",
                                }),
                            ),
                        },
                    },
                },
                default: {
                    description: "Anthropic-shaped error",
                    content: {
                        "application/json": {
                            schema: resolver(MessagesErrorSchema),
                        },
                    },
                },
            },
        }),
        textBodyLimit,
        validator("json", CreateMessageRequestSchema, (result) => {
            if (!result.success) {
                const issue = result.error[0];
                return errorResponse(
                    400,
                    `${issue?.path?.join(".") || "body"}: ${issue?.message ?? "Invalid request"}`,
                );
            }
        }),
        async (c) => {
            const request = c.req.valid("json") as CreateMessageRequest;
            // Media models also accept chat requests; they have no Messages form.
            const entry = (await getGenerationModelRegistry(c.env)).resolve(
                request.model,
            );
            if (
                entry?.visible &&
                !entry.supportedEndpoints.includes("/v1/messages")
            ) {
                return errorResponse(
                    400,
                    `Model "${request.model}" cannot be used on /v1/messages. Supported endpoints: ${entry.supportedEndpoints.join(", ")}.`,
                );
            }
            let chatRequest: ReturnType<typeof messagesToChatRequest>;
            try {
                chatRequest = messagesToChatRequest(request);
            } catch (error) {
                if (error instanceof MessagesRequestError) {
                    return errorResponse(400, error.message);
                }
                throw error;
            }

            const headers = new Headers(c.req.raw.headers);
            headers.delete("content-length");
            headers.set("Content-Type", "application/json");
            const response = await dispatch(
                new Request(new URL("/v1/chat/completions", c.req.url), {
                    method: "POST",
                    headers,
                    body: JSON.stringify(chatRequest),
                    signal: c.req.raw.signal,
                }),
                c,
            );

            const responseHeaders = new Headers(response.headers);
            responseHeaders.delete("content-length");
            if (!response.ok) {
                return errorResponse(
                    response.status,
                    await upstreamErrorMessage(response),
                    responseHeaders,
                );
            }
            if (request.stream && response.body) {
                responseHeaders.set(
                    "Content-Type",
                    "text/event-stream; charset=utf-8",
                );
                return new Response(
                    chatToMessagesStream(response.body, request.model),
                    { headers: responseHeaders },
                );
            }
            const completion = CreateChatCompletionResponseSchema.safeParse(
                await response.json().catch(() => null),
            );
            if (!completion.success) {
                return errorResponse(
                    502,
                    "Provider returned an invalid response or omitted usage",
                    responseHeaders,
                );
            }
            responseHeaders.set(
                "Content-Type",
                "application/json; charset=utf-8",
            );
            try {
                return new Response(
                    JSON.stringify(
                        chatToMessagesResponse(completion.data, request.model),
                    ),
                    { headers: responseHeaders },
                );
            } catch {
                return errorResponse(
                    502,
                    "Provider returned invalid tool arguments",
                    responseHeaders,
                );
            }
        },
    );
}

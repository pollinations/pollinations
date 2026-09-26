import { validator } from "@shared/middleware/validator.ts";
import {
    CreateMessageRequestSchema,
    CreateMessageResponseSchema,
} from "@shared/schemas/anthropic.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { deduplicateGeneration } from "@/middleware/generation-deduplication.ts";
import { resolveModel } from "@/middleware/model.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import {
    apiKeyBudgetReservation,
    generationAccess,
} from "@/utils/generation-access.ts";
import { anthropicErrorHandler } from "./errors.ts";
import { generateMessage } from "./handler.ts";

const textBodyLimit = bodyLimit({ maxSize: 20 * 1024 * 1024 });

/**
 * `/v1/messages` needs Anthropic-shaped errors instead of the app-wide OpenAI
 * envelope. Hono only resolves a thrown error against the nearest mounted
 * app's own `onError`, so this route lives on its own sub-app rather than as
 * a middleware in a shared chain.
 */
export const messagesRoutes = new Hono<Env>()
    .onError(anthropicErrorHandler)
    .post(
        "/v1/messages",
        describeRoute({
            tags: ["✍️ Text"],
            summary: "Create Message",
            description: [
                "Generate text with Anthropic's Messages API shape. Point Claude Code or an Anthropic SDK at `https://gen.pollinations.ai` with `ANTHROPIC_AUTH_TOKEN`/`auth_token` set to a Pollinations key — no router in between.",
                "",
                "Runs through the same model routing, fallback, and billing as `/v1/chat/completions`; every model that lists `/v1/chat/completions` in `supported_endpoints` also lists `/v1/messages`. Models whose output can't be represented as Anthropic content blocks (non-text modalities) return 400.",
                "",
                "Supports system prompts, images, tool use and tool results, `stop_sequences`, and Anthropic-style `cache_control` prompt caching. `thinking.budget_tokens` requests the model's standard reasoning depth; provider reasoning comes back as `thinking` content blocks. Fields Claude Code sends that this endpoint doesn't act on (`output_config`, `metadata`, `mcp_servers`, `container`) are accepted and ignored rather than rejected.",
                "",
                "Successful JSON responses and terminal stream events contain usage in Anthropic's fields; missing provider usage fails the response (JSON error, or a stream `error` event). Errors use Anthropic's `{type:\"error\",error:{type,message}}` shape and status codes, including an integer `retry-after` on 429.",
                "",
                "`count_tokens`, batches, files, and Anthropic server tools are not supported. Community text models are not yet listed on this endpoint.",
            ].join("\n"),
            responses: {
                200: {
                    description:
                        "Message JSON or Anthropic Messages SSE stream",
                    content: {
                        "application/json": {
                            schema: resolver(CreateMessageResponseSchema),
                        },
                        "text/event-stream": {
                            schema: resolver(
                                z.string().meta({
                                    description:
                                        "Anthropic Messages SSE events: message_start, content_block_start/delta/stop, message_delta, message_stop. Ends with an error event instead of message_stop when provider usage is missing.",
                                }),
                            ),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 429, 500, 502),
            },
        }),
        textBodyLimit,
        validator("json", CreateMessageRequestSchema),
        resolveModel("generate.text", { supportedEndpoint: "/v1/messages" }),
        track("generate.text"),
        textCache,
        generationAccess,
        deduplicateGeneration,
        apiKeyBudgetReservation,
        generateMessage,
    );

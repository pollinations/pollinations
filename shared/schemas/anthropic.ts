// Anthropic Messages API schemas, mirrored from the official API reference
// (https://platform.claude.com/docs/en/api/messages) so tools that speak the
// Messages wire — Claude Code and the Anthropic SDKs — can target
// gen.pollinations.ai directly.
//
// Only the surface the gateway translates is modelled here. Fields the quest
// lists as out of scope (count_tokens, batches, files, server tools) are not
// declared; suppliers that send them are handled at the request adapter.

import { z } from "zod";

const CacheControlSchema = z
    .object({ type: z.literal("ephemeral") })
    .describe(
        "Marks the end of a static prompt prefix to cache. Repeat requests bill the cached prefix at ~10% of the input rate.",
    );

const TextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema.optional(),
});

const ImageSourceSchema = z.object({
    type: z.enum(["base64", "url"]),
    media_type: z.string().optional(),
    data: z.string().optional(),
    url: z.string().optional(),
});

const ImageBlockSchema = z.object({
    type: z.literal("image"),
    source: ImageSourceSchema,
    cache_control: CacheControlSchema.optional(),
});

const ToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()),
});

const ToolResultBlockSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z
        .union([
            z.string(),
            z.array(z.object({ type: z.string() }).passthrough()),
        ])
        .optional(),
    is_error: z.boolean().optional(),
    cache_control: CacheControlSchema.optional(),
});

const ThinkingBlockSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string().optional(),
});

const RedactedThinkingBlockSchema = z.object({
    type: z.literal("redacted_thinking"),
    data: z.string(),
});

/** A content block as it appears in a request (assistant turns may carry tool_use/thinking). */
export const AnthropicContentBlockParamSchema = z
    .union([
        TextBlockSchema,
        ImageBlockSchema,
        ToolUseBlockSchema,
        ToolResultBlockSchema,
        ThinkingBlockSchema,
        RedactedThinkingBlockSchema,
        // Provider extensions and future block kinds pass through untouched.
        z
            .object({ type: z.string() })
            .passthrough(),
    ])
    .meta({ $id: "AnthropicContentBlockParam" });

/** A content block as it appears in a response (`thinking` carries a signature). */
export const AnthropicContentBlockSchema = z
    .union([
        TextBlockSchema,
        ToolUseBlockSchema,
        ThinkingBlockSchema,
        RedactedThinkingBlockSchema,
    ])
    .meta({ $id: "AnthropicContentBlock" });

export const AnthropicMessageParamSchema = z
    .object({
        role: z.enum(["user", "assistant"]),
        content: z.union([
            z.string(),
            z.array(AnthropicContentBlockParamSchema),
        ]),
    })
    .meta({ $id: "AnthropicMessageParam" });

export const AnthropicToolSchema = z
    .object({
        name: z.string(),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.any()),
        cache_control: CacheControlSchema.optional(),
    })
    .meta({ $id: "AnthropicTool" });

export const AnthropicToolChoiceSchema = z
    .object({
        type: z.enum(["auto", "any", "tool", "none"]),
        name: z.string().optional(),
        disable_parallel_tool_use: z.boolean().optional(),
    })
    .meta({ $id: "AnthropicToolChoice" });

export const AnthropicThinkingSchema = z
    .object({
        type: z.literal("enabled").optional(),
        budget_tokens: z.number().int().positive().optional(),
    })
    .passthrough()
    .meta({ $id: "AnthropicThinking" });

/**
 * `POST /v1/messages` request. Fields Claude Code sends by default
 * (`thinking`, `metadata`, `output_config`) are declared so they never 400,
 * and unknown fields are tolerated because the adapter ignores or forwards
 * them deliberately rather than rejecting the caller.
 */
export const CreateAnthropicMessageRequestSchema = z
    .object({
        model: z.string(),
        max_tokens: z.number().int().positive(),
        messages: z.array(AnthropicMessageParamSchema).min(1),
        system: z.union([z.string(), z.array(TextBlockSchema)]).optional(),
        stream: z.boolean().optional(),
        temperature: z.number().min(0).max(1).optional(),
        top_p: z.number().min(0).max(1).optional(),
        top_k: z.number().int().optional(),
        stop_sequences: z.array(z.string()).optional(),
        tools: z.array(AnthropicToolSchema).optional(),
        tool_choice: AnthropicToolChoiceSchema.optional(),
        thinking: AnthropicThinkingSchema.optional(),
        metadata: z
            .object({ user_id: z.string().optional() })
            .passthrough()
            .optional(),
        output_config: z.record(z.string(), z.any()).optional(),
        service_tier: z.string().optional(),
    })
    .passthrough()
    .meta({ $id: "CreateAnthropicMessageRequest" });

export const AnthropicUsageSchema = z
    .object({
        input_tokens: z.number().int(),
        output_tokens: z.number().int(),
        cache_creation_input_tokens: z.number().int().nullable().optional(),
        cache_read_input_tokens: z.number().int().nullable().optional(),
        service_tier: z.string().nullable().optional(),
    })
    .meta({ $id: "AnthropicUsage" });

export const AnthropicMessageResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        content: z.array(AnthropicContentBlockSchema),
        stop_reason: z
            .enum([
                "end_turn",
                "max_tokens",
                "stop_sequence",
                "tool_use",
                "pause_turn",
                "refusal",
            ])
            .nullable(),
        stop_sequence: z.string().nullable().optional(),
        usage: AnthropicUsageSchema,
    })
    .passthrough()
    .meta({ $id: "AnthropicMessageResponse" });

// --- Streaming events (standard Messages order) ---

const streamEventBase = { type: z.string(), sequence_number: z.number().int() };

export const AnthropicMessageStartEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("message_start"),
    message: AnthropicMessageResponseSchema,
});

export const AnthropicContentBlockStartEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("content_block_start"),
    index: z.number().int(),
    content_block: AnthropicContentBlockSchema,
});

export const AnthropicContentBlockDeltaEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("content_block_delta"),
    index: z.number().int(),
    delta: z.object({ type: z.string() }).passthrough(),
});

export const AnthropicContentBlockStopEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("content_block_stop"),
    index: z.number().int(),
});

export const AnthropicMessageDeltaEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("message_delta"),
    delta: z
        .object({
            stop_reason: z.string().nullable().optional(),
            stop_sequence: z.string().nullable().optional(),
        })
        .passthrough(),
    usage: z.object({ output_tokens: z.number().int() }).passthrough(),
});

export const AnthropicMessageStopEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("message_stop"),
});

export const AnthropicPingEventSchema = z.object({
    ...streamEventBase,
    type: z.literal("ping"),
});

export const AnthropicErrorEventSchema = z.object({
    type: z.literal("error"),
    error: z.object({ type: z.string(), message: z.string() }).passthrough(),
});

/** Anthropic error envelope: `{"type":"error","error":{"type":...,"message":...}}`. */
export const AnthropicErrorResponseSchema = z
    .object({
        type: z.literal("error"),
        error: z
            .object({
                type: z.string(),
                message: z.string(),
            })
            .passthrough(),
    })
    .meta({ $id: "AnthropicErrorResponse" });

export type CreateAnthropicMessageRequest = z.infer<
    typeof CreateAnthropicMessageRequestSchema
>;
export type AnthropicMessageParam = z.infer<typeof AnthropicMessageParamSchema>;
export type AnthropicContentBlockParam = z.infer<
    typeof AnthropicContentBlockParamSchema
>;
export type AnthropicContentBlock = z.infer<typeof AnthropicContentBlockSchema>;
export type AnthropicMessageResponse = z.infer<
    typeof AnthropicMessageResponseSchema
>;
export type AnthropicUsage = z.infer<typeof AnthropicUsageSchema>;
export type AnthropicErrorType =
    | "authentication_error"
    | "billing_error"
    | "invalid_request_error"
    | "not_found_error"
    | "rate_limit_error"
    | "overloaded_error"
    | "api_error";

import { z } from "zod";

const CacheControlSchema = z
    .object({
        type: z.literal("ephemeral"),
        ttl: z.enum(["5m", "1h"]).optional(),
    })
    .passthrough();

const TextBlockSchema = z
    .object({
        type: z.literal("text"),
        text: z.string(),
        cache_control: CacheControlSchema.optional(),
    })
    .passthrough();

const ImageSourceSchema = z.discriminatedUnion("type", [
    z
        .object({
            type: z.literal("base64"),
            media_type: z.string().min(1),
            data: z.string(),
        })
        .passthrough(),
    z
        .object({
            type: z.literal("url"),
            url: z.string().min(1),
        })
        .passthrough(),
]);

const ImageBlockSchema = z
    .object({
        type: z.literal("image"),
        source: ImageSourceSchema,
        cache_control: CacheControlSchema.optional(),
    })
    .passthrough();

const ToolUseBlockSchema = z
    .object({
        type: z.literal("tool_use"),
        id: z.string().min(1),
        name: z.string().min(1),
        input: z.unknown(),
        cache_control: CacheControlSchema.optional(),
    })
    .passthrough();

const ToolResultContentSchema = z.union([
    z.string(),
    z
        .array(
            z.union([
                TextBlockSchema,
                ImageBlockSchema,
                z.object({ type: z.string() }).passthrough(),
            ]),
        )
        .min(1),
]);

const ToolResultBlockSchema = z
    .object({
        type: z.literal("tool_result"),
        tool_use_id: z.string().min(1),
        content: ToolResultContentSchema.optional(),
        is_error: z.boolean().optional(),
        cache_control: CacheControlSchema.optional(),
    })
    .passthrough();

const ThinkingBlockSchema = z
    .object({
        type: z.literal("thinking"),
        thinking: z.string(),
        signature: z.string().optional(),
    })
    .passthrough();

const RedactedThinkingBlockSchema = z
    .object({
        type: z.literal("redacted_thinking"),
        data: z.string(),
    })
    .passthrough();

const MessageContentBlockSchema = z.union([
    TextBlockSchema,
    ImageBlockSchema,
    ToolUseBlockSchema,
    ToolResultBlockSchema,
    ThinkingBlockSchema,
    RedactedThinkingBlockSchema,
    z.object({ type: z.string() }).passthrough(),
]);

const SystemContentBlockSchema = z.union([
    TextBlockSchema,
    z.object({ type: z.string() }).passthrough(),
]);

const MessageSchema = z
    .object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([
            z.string(),
            z.array(MessageContentBlockSchema).min(1),
        ]),
    })
    .passthrough();

const ToolSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.unknown()),
        cache_control: CacheControlSchema.optional(),
        strict: z.boolean().optional(),
        type: z.string().optional(),
    })
    .passthrough();

const ToolChoiceSchema = z
    .object({
        type: z.enum(["auto", "any", "tool", "none"]),
        name: z.string().optional(),
        disable_parallel_tool_use: z.boolean().optional(),
    })
    .passthrough();

const ThinkingSchema = z
    .object({
        type: z.enum(["enabled", "disabled", "adaptive"]),
        budget_tokens: z.number().int().positive().optional(),
    })
    .passthrough();

const OutputFormatSchema = z
    .object({
        type: z.literal("json_schema"),
        schema: z.record(z.string(), z.unknown()),
    })
    .passthrough();

const OutputConfigSchema = z
    .object({
        effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
        format: OutputFormatSchema.optional(),
    })
    .passthrough();

export const AnthropicMessageRequestSchema = z
    .object({
        model: z.string().min(1),
        messages: z.array(MessageSchema).min(1),
        max_tokens: z.number().int().positive(),
        system: z
            .union([z.string(), z.array(SystemContentBlockSchema).min(1)])
            .optional(),
        stream: z.boolean().optional().default(false),
        stop_sequences: z.array(z.string()).max(4).optional(),
        temperature: z.number().min(0).max(1).optional(),
        top_p: z.number().min(0).max(1).optional(),
        top_k: z.number().int().positive().optional(),
        tools: z.array(ToolSchema).optional(),
        tool_choice: ToolChoiceSchema.optional(),
        thinking: ThinkingSchema.optional(),
        output_config: OutputConfigSchema.optional(),
        metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough()
    .meta({ $id: "AnthropicMessageRequest" });

export type AnthropicMessageRequest = z.infer<
    typeof AnthropicMessageRequestSchema
>;

const AnthropicUsageSchema = z
    .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        cache_creation_input_tokens: z.number().int().nonnegative(),
        cache_read_input_tokens: z.number().int().nonnegative(),
        cache_creation: z.null(),
        inference_geo: z.null(),
        output_tokens_details: z
            .object({
                thinking_tokens: z.number().int().nonnegative(),
            })
            .passthrough()
            .nullable(),
        server_tool_use: z.null(),
        service_tier: z.null(),
    })
    .passthrough()
    .meta({ $id: "AnthropicUsage" });

const AnthropicResponseContentBlockSchema = z.union([
    z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
    z
        .object({
            type: z.literal("thinking"),
            thinking: z.string(),
            signature: z.string(),
        })
        .passthrough(),
    RedactedThinkingBlockSchema,
    z
        .object({
            type: z.literal("tool_use"),
            id: z.string(),
            name: z.string(),
            input: z.unknown(),
        })
        .passthrough(),
]);

export const AnthropicMessageResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        container: z.null(),
        content: z.array(AnthropicResponseContentBlockSchema),
        stop_details: z.null(),
        stop_reason: z
            .enum([
                "end_turn",
                "max_tokens",
                "stop_sequence",
                "tool_use",
                "refusal",
            ])
            .nullable(),
        stop_sequence: z.string().nullable(),
        usage: AnthropicUsageSchema,
    })
    .passthrough()
    .meta({ $id: "AnthropicMessageResponse" });

export const AnthropicErrorResponseSchema = z
    .object({
        type: z.literal("error"),
        error: z.object({
            type: z.string(),
            message: z.string(),
        }),
        request_id: z.string().optional(),
    })
    .meta({ $id: "AnthropicErrorResponse" });

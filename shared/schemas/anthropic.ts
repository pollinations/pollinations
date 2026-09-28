// Anthropic Messages API request and response schemas for POST /v1/messages.
// The request schema is deliberately loose (passthrough): Claude Code and the
// Anthropic SDKs send fields this endpoint intentionally ignores (metadata,
// output_config, mcp_servers, beta headers, ...), and unknown fields must
// never fail a request that Chat Completions would accept.

import { z } from "zod";

const CacheControlSchema = z.object({
    type: z.enum(["ephemeral"]).optional(),
});

const SystemBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema.optional(),
});

export const AnthropicSystemSchema = z.union([
    z.string(),
    z.array(SystemBlockSchema),
]);

const TextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema.optional(),
});

const ImageSourceSchema = z.union([
    z.object({
        type: z.literal("base64"),
        media_type: z.string(),
        data: z.string(),
    }),
    z.object({
        type: z.literal("url"),
        url: z.string(),
    }),
]);

const ImageBlockSchema = z.object({
    type: z.literal("image"),
    source: ImageSourceSchema,
});

const DocumentSourceSchema = z.union([
    z.object({
        type: z.literal("base64"),
        media_type: z.string(),
        data: z.string(),
    }),
    z.object({
        type: z.literal("url"),
        url: z.string(),
    }),
]);

const DocumentBlockSchema = z.object({
    type: z.literal("document"),
    source: DocumentSourceSchema,
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

const ToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
});

const ToolResultBlockSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z
        .union([
            z.string(),
            z.array(z.union([TextBlockSchema, ImageBlockSchema])),
        ])
        .optional(),
    is_error: z.boolean().optional(),
    cache_control: CacheControlSchema.optional(),
});

// Known request blocks are typed; any other block type still parses so new
// Anthropic SDK fields degrade to ignored-content instead of a hard 400.
export const AnthropicContentBlockSchema = z.union([
    TextBlockSchema,
    ImageBlockSchema,
    DocumentBlockSchema,
    ThinkingBlockSchema,
    RedactedThinkingBlockSchema,
    ToolUseBlockSchema,
    ToolResultBlockSchema,
    // Unknown block types parse as loose objects so new Anthropic SDK fields
    // degrade to ignored-content instead of a hard 400; the translator rejects
    // block types it cannot express in a Chat request.
    z
        .object({ type: z.string() })
        .passthrough(),
]);

const RequestMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(AnthropicContentBlockSchema)]),
});

const ToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.string(), z.unknown()),
});

const ToolChoiceSchema = z.union([
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("any") }),
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("tool"), name: z.string() }),
]);

const ThinkingSchema = z.object({
    type: z.enum(["enabled", "disabled"]),
    budget_tokens: z.number().int().positive().optional(),
});

export const AnthropicMessagesRequestSchema = z
    .object({
        model: z.string().min(1),
        messages: z.array(RequestMessageSchema).min(1),
        system: AnthropicSystemSchema.optional(),
        max_tokens: z.number().int().positive(),
        stream: z.boolean().optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        stop_sequences: z.array(z.string()).optional(),
        tools: z.array(ToolSchema).optional(),
        tool_choice: ToolChoiceSchema.optional(),
        thinking: ThinkingSchema.optional(),
        // Accepted-and-ignored Anthropic fields are documented in the schema so
        // the OpenAPI spec shows them without special-casing the translator.
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
    .meta({ $id: "AnthropicMessagesRequest" });

export type AnthropicMessagesRequest = z.infer<
    typeof AnthropicMessagesRequestSchema
>;

// Response schemas — the endpoint always produces this exact shape, so the
// OpenAPI document gets a strict schema.
const ResponseTextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const ResponseThinkingBlockSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string(),
});

const ResponseToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
});

export const AnthropicUsageSchema = z.object({
    input_tokens: z.number().int().nonnegative(),
    cache_creation_input_tokens: z.number().int().nonnegative(),
    cache_read_input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
});

export const AnthropicMessagesResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        content: z.array(
            z.union([
                ResponseTextBlockSchema,
                ResponseThinkingBlockSchema,
                ResponseToolUseBlockSchema,
            ]),
        ),
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
    .meta({ $id: "AnthropicMessagesResponse" });

export type AnthropicMessagesResponse = z.infer<
    typeof AnthropicMessagesResponseSchema
>;

export type AnthropicContentBlock = z.infer<typeof AnthropicContentBlockSchema>;

export type AnthropicResponseBlock =
    AnthropicMessagesResponse["content"][number];
export type AnthropicUsage = z.infer<typeof AnthropicUsageSchema>;

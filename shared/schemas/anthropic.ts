import { z } from "zod";

/**
 * Anthropic Messages API schemas for POST /v1/messages.
 *
 * Independent of OpenAI schemas: translation to the Chat Completions
 * pipeline lives in gen.pollinations.ai/src/text/messages/.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/messages
 */

const CacheControlSchema = z
    .object({
        type: z.enum(["ephemeral"]),
    })
    .optional();

const TextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema,
});

const ImageSourceSchema = z.union([
    z.object({
        type: z.literal("base64"),
        media_type: z.enum([
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        ]),
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
    cache_control: CacheControlSchema,
});

const ToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
    cache_control: CacheControlSchema,
});

const ToolResultBlockSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([
        z.string(),
        z.array(z.union([TextBlockSchema, ImageBlockSchema])),
    ]),
    is_error: z.boolean().optional(),
    cache_control: CacheControlSchema,
});

const ThinkingBlockSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string().optional(),
    cache_control: CacheControlSchema,
});

const RedactedThinkingBlockSchema = z.object({
    type: z.literal("redacted_thinking"),
    data: z.string(),
    cache_control: CacheControlSchema,
});

export const ContentBlockSchema = z.union([
    TextBlockSchema,
    ImageBlockSchema,
    ToolUseBlockSchema,
    ToolResultBlockSchema,
    ThinkingBlockSchema,
    RedactedThinkingBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

const SystemPromptSchema = z.union([z.string(), z.array(TextBlockSchema)]);

const ToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.string(), z.any()),
    cache_control: CacheControlSchema,
});

const ToolChoiceSchema = z.union([
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("any") }),
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("tool"), name: z.string() }),
]);

const ThinkingConfigSchema = z.union([
    z.object({ type: z.literal("enabled"), budget_tokens: z.number().int() }),
    z.object({ type: z.literal("disabled") }),
]);

const MessageParamSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(ContentBlockSchema)]),
});

export const CreateMessageRequestSchema = z
    .object({
        model: z.string(),
        messages: z.array(MessageParamSchema).min(1),
        max_tokens: z.number().int().positive(),
        system: SystemPromptSchema.optional(),
        temperature: z.number().min(0).max(1).nullable().optional(),
        top_p: z.number().min(0).max(1).nullable().optional(),
        top_k: z.number().int().nullable().optional(),
        stream: z.boolean().nullable().optional().default(false),
        stop_sequences: z.array(z.string()).max(4).optional(),
        tools: z.array(ToolSchema).optional(),
        tool_choice: ToolChoiceSchema.optional(),
        thinking: ThinkingConfigSchema.optional(),
        metadata: z
            .object({ user_id: z.string().optional() })
            .nullish()
            .optional(),
    })
    .passthrough();

export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

/** Anthropic usage, in Anthropic's field names. */
export interface AnthropicUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
}

export interface UsageRecord {
    usage: AnthropicUsage;
}

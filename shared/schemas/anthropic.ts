// Anthropic Messages API request/response shapes.
// https://platform.claude.com/docs/en/api/messages

import { z } from "zod";
import { DEFAULT_TEXT_MODEL } from "../registry/text.ts";

const CacheControlSchema = z
    .object({
        type: z.literal("ephemeral"),
        ttl: z.enum(["5m", "1h"]).optional(),
    })
    .passthrough()
    .optional();

const MessageTextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema,
});

const MessageImageSourceSchema = z.union([
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

const MessageImageBlockSchema = z.object({
    type: z.literal("image"),
    source: MessageImageSourceSchema,
    cache_control: CacheControlSchema,
});

const MessageToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
    cache_control: CacheControlSchema,
});

const MessageToolResultContentSchema = z.union([
    z.string(),
    z.array(z.union([MessageTextBlockSchema, MessageImageBlockSchema])),
]);

const MessageToolResultBlockSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: MessageToolResultContentSchema.optional(),
    is_error: z.boolean().optional(),
    cache_control: CacheControlSchema,
});

const MessageThinkingBlockSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string().optional(),
});

const MessageRedactedThinkingBlockSchema = z.object({
    type: z.literal("redacted_thinking"),
    data: z.string(),
});

const MessageContentBlockSchema = z.union([
    MessageTextBlockSchema,
    MessageImageBlockSchema,
    MessageToolUseBlockSchema,
    MessageToolResultBlockSchema,
    MessageThinkingBlockSchema,
    MessageRedactedThinkingBlockSchema,
    // Server tool blocks (web_search, etc.) and other extensions we don't
    // translate. Kept out of the reply rather than rejected outright so
    // history replay of an untranslatable block doesn't break the turn.
    z
        .object({ type: z.string() })
        .passthrough(),
]);

export type MessageContentBlock = z.infer<typeof MessageContentBlockSchema>;

const InputMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(MessageContentBlockSchema)]),
});

export type InputMessage = z.infer<typeof InputMessageSchema>;

const SystemPromptSchema = z.union([
    z.string(),
    z.array(MessageTextBlockSchema),
]);

const ToolInputSchemaSchema = z
    .object({ type: z.literal("object") })
    .passthrough();

const ToolSchema = z
    .object({
        name: z.string(),
        description: z.string().optional(),
        input_schema: ToolInputSchemaSchema,
        cache_control: CacheControlSchema,
    })
    .passthrough();

const ToolChoiceSchema = z.union([
    z.object({
        type: z.literal("auto"),
        disable_parallel_tool_use: z.boolean().optional(),
    }),
    z.object({
        type: z.literal("any"),
        disable_parallel_tool_use: z.boolean().optional(),
    }),
    z.object({
        type: z.literal("tool"),
        name: z.string(),
        disable_parallel_tool_use: z.boolean().optional(),
    }),
    z.object({ type: z.literal("none") }),
]);

const ThinkingConfigSchema = z.union([
    z.object({
        type: z.literal("enabled"),
        budget_tokens: z.number().int().positive(),
    }),
    z.object({ type: z.literal("disabled") }),
]);

const MetadataSchema = z
    .object({ user_id: z.string().optional() })
    .passthrough();

/**
 * Anthropic's Messages API request. Kept permissive (`.passthrough()`) so
 * fields Claude Code sends that we don't act on — `output_config`,
 * `mcp_servers`, `container`, `service_tier`, `context_management` — never
 * fail validation; they're simply ignored.
 */
export const CreateMessageRequestSchema = z
    .object({
        model: z.string().optional().default(DEFAULT_TEXT_MODEL).meta({
            description:
                "AI model for text generation. See /v1/models for full list.",
        }),
        messages: z.array(InputMessageSchema).min(1),
        system: SystemPromptSchema.optional(),
        max_tokens: z.number().int().positive(),
        metadata: MetadataSchema.optional(),
        stop_sequences: z.array(z.string()).optional(),
        stream: z.boolean().optional().default(false),
        temperature: z.number().min(0).max(1).optional(),
        top_p: z.number().min(0).max(1).optional(),
        top_k: z.number().int().nonnegative().optional(),
        tools: z.array(ToolSchema).optional(),
        tool_choice: ToolChoiceSchema.optional(),
        thinking: ThinkingConfigSchema.optional(),
    })
    .passthrough();

export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

const MessageUsageSchema = z
    .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        cache_creation_input_tokens: z.number().int().nonnegative().nullish(),
        cache_read_input_tokens: z.number().int().nonnegative().nullish(),
    })
    .meta({ $id: "MessageUsage" });

export type MessageUsage = z.infer<typeof MessageUsageSchema>;

const ResponseTextBlockSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const ResponseToolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
});

const ResponseThinkingBlockSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string(),
});

const ResponseContentBlockSchema = z.union([
    ResponseTextBlockSchema,
    ResponseToolUseBlockSchema,
    ResponseThinkingBlockSchema,
    MessageRedactedThinkingBlockSchema,
]);

export type ResponseContentBlock = z.infer<typeof ResponseContentBlockSchema>;

export const CreateMessageResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        content: z.array(ResponseContentBlockSchema),
        stop_reason: z.enum([
            "end_turn",
            "max_tokens",
            "stop_sequence",
            "tool_use",
            "refusal",
        ]),
        stop_sequence: z.string().nullable(),
        usage: MessageUsageSchema,
    })
    .meta({ $id: "CreateMessageResponse" });

export type CreateMessageResponse = z.infer<typeof CreateMessageResponseSchema>;

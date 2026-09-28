import { z } from "zod";

// Anthropic Messages API request and response shapes. Objects pass unknown
// fields through: Claude Code sends new fields with each release, and a field
// this endpoint does not use must never fail the request.

const CacheControlSchema = z
    .object({ type: z.literal("ephemeral") })
    .passthrough()
    .optional();

const TextBlockSchema = z
    .object({
        type: z.literal("text"),
        text: z.string(),
        cache_control: CacheControlSchema,
    })
    .passthrough();

const ImageBlockSchema = z
    .object({
        type: z.literal("image"),
        source: z.union([
            z.object({
                type: z.literal("base64"),
                media_type: z.string(),
                data: z.string(),
            }),
            z.object({ type: z.literal("url"), url: z.string() }),
        ]),
        cache_control: CacheControlSchema,
    })
    .passthrough();

const ToolUseBlockSchema = z
    .object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
        cache_control: CacheControlSchema,
    })
    .passthrough();

const ToolResultBlockSchema = z
    .object({
        type: z.literal("tool_result"),
        tool_use_id: z.string(),
        content: z
            .union([
                z.string(),
                z.array(z.union([TextBlockSchema, ImageBlockSchema])),
            ])
            .optional(),
        is_error: z.boolean().optional(),
        cache_control: CacheControlSchema,
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
    .object({ type: z.literal("redacted_thinking"), data: z.string() })
    .passthrough();

export const MessagesContentBlockSchema = z.discriminatedUnion("type", [
    TextBlockSchema,
    ImageBlockSchema,
    ToolUseBlockSchema,
    ToolResultBlockSchema,
    ThinkingBlockSchema,
    RedactedThinkingBlockSchema,
]);

export type MessagesContentBlock = z.infer<typeof MessagesContentBlockSchema>;

const MessageSchema = z
    .object({
        // Claude Code appends `system` entries mid-conversation.
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([z.string(), z.array(MessagesContentBlockSchema)]),
    })
    .passthrough();

const ToolSchema = z
    .object({
        // Absent or "custom" for client tools; anything else is a server tool.
        type: z.string().optional(),
        name: z.string(),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough();

export const CreateMessageRequestSchema = z
    .object({
        model: z.string().meta({
            description:
                "Pollinations text model. Models that support this endpoint list `/v1/messages` in `supported_endpoints`.",
        }),
        max_tokens: z.number().int().min(1),
        messages: z.array(MessageSchema).min(1),
        system: z.union([z.string(), z.array(TextBlockSchema)]).optional(),
        stream: z.boolean().optional(),
        stop_sequences: z.array(z.string()).optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        tools: z.array(ToolSchema).optional(),
        tool_choice: z
            .object({
                type: z.enum(["auto", "any", "tool", "none"]),
                name: z.string().optional(),
                disable_parallel_tool_use: z.boolean().optional(),
            })
            .optional(),
        thinking: z
            .object({
                type: z.string(),
                budget_tokens: z.number().int().optional(),
            })
            .passthrough()
            .optional(),
        output_config: z
            .object({ effort: z.string().optional() })
            .passthrough()
            .optional(),
    })
    .passthrough()
    .meta({ $id: "CreateMessageRequest" });

export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

export const MessagesUsageSchema = z.object({
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
    cache_read_input_tokens: z.number().int(),
    cache_creation_input_tokens: z.number().int(),
});

export type MessagesUsage = z.infer<typeof MessagesUsageSchema>;

export const CreateMessageResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        content: z.array(
            z.discriminatedUnion("type", [
                TextBlockSchema,
                ToolUseBlockSchema,
                ThinkingBlockSchema,
                RedactedThinkingBlockSchema,
            ]),
        ),
        stop_reason: z.string().nullable(),
        stop_sequence: z.string().nullable(),
        usage: MessagesUsageSchema,
    })
    .meta({ $id: "CreateMessageResponse" });

export type CreateMessageResponse = z.infer<typeof CreateMessageResponseSchema>;

export const MessagesErrorSchema = z
    .object({
        type: z.literal("error"),
        error: z.object({ type: z.string(), message: z.string() }),
    })
    .meta({ $id: "MessagesError" });

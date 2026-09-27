// Anthropic Messages API schemas for POST /v1/messages.
//
// The request schema is deliberately permissive (.passthrough() everywhere):
// Claude Code and the official SDKs send fields such as `thinking`,
// `output_config`, `metadata`, `service_tier`, `context_management` and
// `container`, plus `anthropic-beta` headers. None of those may fail the
// request — unknown fields are accepted and ignored by translation.
import { z } from "zod";

const MessagesCacheControlSchema = z
    .object({ type: z.literal("ephemeral") })
    .passthrough()
    .optional()
    .meta({ $id: "MessagesCacheControl" });

const MessagesTextBlockSchema = z
    .object({
        type: z.literal("text"),
        text: z.string(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

const MessagesImageSourceSchema = z.union([
    z
        .object({
            type: z.literal("base64"),
            media_type: z.string(),
            data: z.string(),
        })
        .passthrough(),
    z.object({ type: z.literal("url"), url: z.string() }).passthrough(),
    // Files API and future source types validate but translate to nothing.
    z.object({ type: z.string() }).passthrough(),
]);

const MessagesImageBlockSchema = z
    .object({
        type: z.literal("image"),
        source: MessagesImageSourceSchema,
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

const MessagesToolUseBlockSchema = z
    .object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

const MessagesToolResultContentBlockSchema = z.union([
    MessagesTextBlockSchema,
    MessagesImageBlockSchema,
    z.object({ type: z.string() }).passthrough(),
]);

const MessagesToolResultBlockSchema = z
    .object({
        type: z.literal("tool_result"),
        tool_use_id: z.string(),
        content: z
            .union([
                z.string(),
                z.array(MessagesToolResultContentBlockSchema),
            ])
            .optional(),
        is_error: z.boolean().optional(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

const MessagesThinkingBlockSchema = z
    .object({
        type: z.literal("thinking"),
        thinking: z.string(),
        signature: z.string().optional(),
    })
    .passthrough();

const MessagesRedactedThinkingBlockSchema = z
    .object({ type: z.literal("redacted_thinking"), data: z.string() })
    .passthrough();

const MessagesDocumentBlockSchema = z
    .object({
        type: z.literal("document"),
        source: z.unknown(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

// Unknown future block types validate so they never 400; translation drops
// the ones it cannot represent.
const MessagesUnknownBlockSchema = z
    .object({ type: z.string() })
    .passthrough();

const MessagesContentBlockSchema = z.union([
    MessagesTextBlockSchema,
    MessagesImageBlockSchema,
    MessagesToolUseBlockSchema,
    MessagesToolResultBlockSchema,
    MessagesThinkingBlockSchema,
    MessagesRedactedThinkingBlockSchema,
    MessagesDocumentBlockSchema,
    MessagesUnknownBlockSchema,
]);

export type MessagesContentBlock = z.infer<typeof MessagesContentBlockSchema>;

const MessagesSystemBlockSchema = z
    .object({
        type: z.literal("text"),
        text: z.string(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

const MessagesMessageSchema = z
    .object({
        // Claude Code also sends a `system` role inside `messages`; it is
        // carried through as a system message rather than rejected.
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([z.string(), z.array(MessagesContentBlockSchema)]),
    })
    .passthrough();

export type MessagesMessage = z.infer<typeof MessagesMessageSchema>;

const MessagesToolSchema = z
    .object({
        name: z.string(),
        description: z.string().optional(),
        input_schema: z.record(z.string(), z.unknown()).optional(),
        cache_control: MessagesCacheControlSchema,
    })
    .passthrough();

export type MessagesTool = z.infer<typeof MessagesToolSchema>;

// `type` stays an open string: Claude Code sends modes such as `adaptive`
// that must never 400 on a new client version.
const MessagesThinkingConfigSchema = z
    .object({ type: z.string(), budget_tokens: z.number().int().optional() })
    .passthrough();

const MessagesToolChoiceSchema = z
    .object({ type: z.string(), name: z.string().optional() })
    .passthrough();

export const CreateMessagesRequestSchema = z
    .object({
        model: z.string().min(1),
        messages: z.array(MessagesMessageSchema).min(1),
        system: z
            .union([z.string(), z.array(MessagesSystemBlockSchema)])
            .optional(),
        max_tokens: z.number().int().positive(),
        stream: z.boolean().optional().default(false),
        tools: z.array(MessagesToolSchema).optional(),
        tool_choice: MessagesToolChoiceSchema.optional(),
        stop_sequences: z.array(z.string()).optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        top_k: z.number().optional(),
        thinking: MessagesThinkingConfigSchema.optional(),
        metadata: z
            .object({ user_id: z.string().optional() })
            .passthrough()
            .optional(),
    })
    .passthrough()
    .meta({ $id: "CreateMessagesRequest" });

export type CreateMessagesRequest = z.infer<
    typeof CreateMessagesRequestSchema
>;

export const MessagesUsageSchema = z
    .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        cache_creation_input_tokens: z.number().int().nonnegative().optional(),
        cache_read_input_tokens: z.number().int().nonnegative().optional(),
        service_tier: z.string().optional(),
    })
    .passthrough()
    .meta({ $id: "MessagesUsage" });

export type MessagesUsage = z.infer<typeof MessagesUsageSchema>;

export const CreateMessagesResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        content: z.array(
            z.object({ type: z.string() }).passthrough(),
        ),
        model: z.string(),
        stop_reason: z.string().nullable(),
        stop_sequence: z.string().nullable(),
        usage: MessagesUsageSchema,
    })
    .passthrough()
    .meta({ $id: "CreateMessagesResponse" });

export type CreateMessagesResponse = z.infer<
    typeof CreateMessagesResponseSchema
>;

export const MessagesErrorSchema = z
    .object({
        type: z.literal("error"),
        error: z.object({ type: z.string(), message: z.string() }),
    })
    .meta({ $id: "MessagesError" });

export type MessagesError = z.infer<typeof MessagesErrorSchema>;

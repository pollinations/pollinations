import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import { z } from "zod";

// Content blocks are open-ended: read the fields each type is known to have.
// biome-ignore lint/suspicious/noExplicitAny: see above
type Block = { type: string; [key: string]: any };

const BlockSchema = z.object({ type: z.string() }).passthrough();
const ContentSchema = z.union([z.string(), z.array(BlockSchema)]);

/**
 * Anthropic Messages request. Only the fields the translation reads are
 * validated; Claude Code adds new fields and headers with every release, so
 * anything else is accepted and ignored instead of rejected.
 */
export const CreateMessageRequestSchema = z
    .object({
        model: z.string(),
        max_tokens: z.number().int().positive(),
        messages: z
            .array(
                z
                    .object({
                        // Claude Code appends `system` entries mid-conversation.
                        role: z.enum(["user", "assistant", "system"]),
                        content: ContentSchema,
                    })
                    .passthrough(),
            )
            .min(1),
        system: ContentSchema.optional(),
        stream: z.boolean().optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        stop_sequences: z.array(z.string()).optional(),
        tools: z.array(BlockSchema.partial()).optional(),
        tool_choice: BlockSchema.optional(),
        thinking: BlockSchema.optional(),
        output_config: z
            .object({ effort: z.string().optional() })
            .passthrough()
            .optional(),
    })
    .passthrough();

export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

function part(block: Block) {
    if (block.type === "text") {
        return {
            type: "text",
            text: block.text,
            ...(block.cache_control && { cache_control: block.cache_control }),
        };
    }
    if (block.type === "image") {
        const { source } = block;
        return {
            type: "image_url",
            image_url: {
                url:
                    source.type === "base64"
                        ? `data:${source.media_type};base64,${source.data}`
                        : source.url,
            },
        };
    }
    return block;
}

/** Plain text stays a string: not every provider accepts content parts. */
function content(value: string | Block[]) {
    if (typeof value === "string") return value;
    const parts = value.map(part);
    return parts.every((p) => p.type === "text" && !p.cache_control)
        ? parts.map((p) => p.text).join("\n\n")
        : parts;
}

function toChatMessages({
    role,
    content: value,
}: {
    role: "user" | "assistant" | "system";
    content: string | Block[];
}): object[] {
    if (typeof value === "string" || role === "system") {
        return [{ role, content: content(value) }];
    }
    if (role === "user") {
        // tool_result blocks lead a user turn and become their own tool messages.
        const results = value.filter((b) => b.type === "tool_result");
        const rest = value.filter((b) => b.type !== "tool_result");
        return [
            ...results.map((b) => ({
                role: "tool",
                tool_call_id: b.tool_use_id,
                content: content(b.content ?? ""),
            })),
            ...(rest.length ? [{ role, content: content(rest) }] : []),
        ];
    }
    // Earlier thinking blocks are dropped: they carry no signature that another
    // provider could verify.
    const calls = value.filter((b) => b.type === "tool_use");
    const parts = value.filter(
        (b) =>
            b.type !== "tool_use" &&
            b.type !== "thinking" &&
            b.type !== "redacted_thinking",
    );
    return [
        {
            role,
            content: parts.length ? content(parts) : null,
            ...(calls.length && {
                tool_calls: calls.map((b) => ({
                    id: b.id,
                    type: "function",
                    function: {
                        name: b.name,
                        arguments: JSON.stringify(b.input),
                    },
                })),
            }),
        },
    ];
}

const TOOL_CHOICES: Record<string, string> = {
    auto: "auto",
    any: "required",
    none: "none",
};

// Models that bill cached prompt prefixes (Gemini, Claude, Nova) take
// `cache_control`; other providers reject the field. Claude Code sends it on
// every request, so it is dropped for models that cannot use it.
const PROMPT_CACHING_MODELS = /^(anthropic|google|amazon)\//;

const withoutCacheControl = (request: CreateMessageRequest) =>
    JSON.parse(
        JSON.stringify(request, (key, value) =>
            key === "cache_control" ? undefined : value,
        ),
    ) as CreateMessageRequest;

/**
 * Translate an Anthropic Messages request into a Chat Completions request for
 * the model that will serve it.
 */
export function messagesToChatRequest(
    original: CreateMessageRequest,
    servedModel: string,
): CreateChatCompletionRequest {
    const request = PROMPT_CACHING_MODELS.test(servedModel)
        ? original
        : withoutCacheControl(original);
    const { tool_choice: choice, thinking, output_config: config } = request;
    // Client-side tools only: Anthropic-hosted tools (web search, bash, ...) run
    // on Anthropic's servers and have no Chat Completions equivalent.
    const tools = request.tools?.filter(
        (t) => t.name && (!t.type || t.type === "custom"),
    );
    const reasoning =
        thinking?.type === "disabled"
            ? undefined
            : (config?.effort ??
              (thinking?.type === "enabled" ? "medium" : undefined));

    return {
        model: request.model,
        max_tokens: request.max_tokens,
        stream: request.stream ?? false,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: request.stop_sequences?.length
            ? request.stop_sequences
            : undefined,
        reasoning_effort: reasoning,
        tools: tools?.length
            ? tools.map((t) => ({
                  type: "function",
                  function: {
                      name: t.name,
                      description: t.description,
                      parameters: t.input_schema,
                  },
              }))
            : undefined,
        tool_choice:
            choice?.type === "tool"
                ? { type: "function", function: { name: choice.name } }
                : TOOL_CHOICES[choice?.type ?? ""],
        parallel_tool_calls: choice?.disable_parallel_tool_use
            ? false
            : undefined,
        messages: [
            ...(request.system
                ? [{ role: "system", content: content(request.system) }]
                : []),
            ...request.messages.flatMap(toChatMessages),
        ],
    } as CreateChatCompletionRequest;
}

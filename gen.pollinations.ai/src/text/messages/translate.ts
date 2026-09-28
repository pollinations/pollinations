import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import type {
    CompletionUsage,
    CreateChatCompletionRequest,
    CreateChatCompletionResponse,
} from "@shared/schemas/openai.ts";
import type {
    CreateMessageRequest,
    CreateMessageResponse,
    MessagesContentBlock,
    MessagesUsage,
} from "./schema.ts";

type ChatMessage = CreateChatCompletionRequest["messages"][number];
type ChatPart = Record<string, unknown>;

export class MessagesRequestError extends Error {
    override readonly name = "MessagesRequestError";
}

function cacheControl(block: { cache_control?: unknown }) {
    return block.cache_control ? { cache_control: { type: "ephemeral" } } : {};
}

function imagePart(block: Extract<MessagesContentBlock, { type: "image" }>) {
    const url =
        block.source.type === "base64"
            ? `data:${block.source.media_type};base64,${block.source.data}`
            : block.source.url;
    return { type: "image_url", image_url: { url }, ...cacheControl(block) };
}

function contentPart(block: MessagesContentBlock): ChatPart {
    if (block.type === "text") {
        return { type: "text", text: block.text, ...cacheControl(block) };
    }
    if (block.type === "image") return imagePart(block);
    throw new MessagesRequestError(
        `A ${block.type} block is not allowed in this message`,
    );
}

function userMessages(content: MessagesContentBlock[]): ChatMessage[] {
    // Chat carries each tool result as its own `tool` message; Anthropic puts
    // them at the start of the user turn, so they keep their order. Chat tool
    // messages carry text only, so a result's images open the user message.
    const toolMessages: ChatMessage[] = [];
    const toolImages: ChatPart[] = [];
    const parts: ChatPart[] = [];
    for (const block of content) {
        if (block.type !== "tool_result") {
            parts.push(contentPart(block));
            continue;
        }
        const result = block.content ?? "";
        const text =
            typeof result === "string"
                ? result
                : result
                      .filter((part) => part.type === "text")
                      .map(contentPart);
        if (typeof result !== "string") {
            toolImages.push(
                ...result.flatMap((part) =>
                    part.type === "image" ? [imagePart(part)] : [],
                ),
            );
        }
        toolMessages.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: text.length ? text : "",
            ...cacheControl(block),
        } as ChatMessage);
    }
    const userParts = [...toolImages, ...parts];
    return [
        ...toolMessages,
        ...(userParts.length
            ? [{ role: "user", content: userParts } as ChatMessage]
            : []),
    ];
}

function assistantMessage(content: MessagesContentBlock[]): ChatMessage {
    const parts: ChatPart[] = [];
    const toolCalls = [];
    for (const block of content) {
        if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id,
                type: "function" as const,
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input ?? {}),
                },
            });
        } else if (block.type === "thinking") {
            // Only Claude signs its thinking, and Claude needs signed blocks
            // replayed; other providers reject a thinking part.
            if (block.signature) {
                parts.push({
                    type: "thinking",
                    thinking: block.thinking,
                    signature: block.signature,
                });
            }
        } else if (block.type === "redacted_thinking") {
            parts.push({ type: "redacted_thinking", data: block.data });
        } else {
            parts.push(contentPart(block));
        }
    }
    // Plain text stays a string, which every provider accepts.
    const plain = parts.every(
        (part) => part.type === "text" && !part.cache_control,
    );
    return {
        role: "assistant",
        content: plain
            ? parts.map((part) => part.text).join("") || null
            : parts,
        ...(toolCalls.length && { tool_calls: toolCalls }),
    } as ChatMessage;
}

function chatMessages(
    message: CreateMessageRequest["messages"][number],
): ChatMessage[] {
    if (typeof message.content === "string") {
        return [
            { role: message.role, content: message.content } as ChatMessage,
        ];
    }
    if (message.role === "assistant")
        return [assistantMessage(message.content)];
    if (message.role === "system") {
        return [
            {
                role: "system",
                content: message.content.map(contentPart),
            } as ChatMessage,
        ];
    }
    return userMessages(message.content);
}

// Chat's reasoning_effort is normalized per model downstream, so a thinking
// request only needs to become the nearest effort level.
function reasoningEffort(
    request: CreateMessageRequest,
): CreateChatCompletionRequest["reasoning_effort"] {
    const { thinking, output_config } = request;
    if (!thinking) return undefined;
    if (thinking.type === "disabled") return "none";
    if (thinking.type === "enabled") {
        const budget = thinking.budget_tokens ?? 0;
        if (budget <= 1024) return "low";
        if (budget <= 2048) return "medium";
        if (budget <= 4096) return "high";
        return "xhigh";
    }
    const effort = output_config?.effort;
    return effort === "low" ||
        effort === "medium" ||
        effort === "high" ||
        effort === "xhigh" ||
        effort === "max"
        ? effort
        : undefined;
}

function toolChoice(choice: CreateMessageRequest["tool_choice"]) {
    if (!choice) return {};
    const parallel =
        choice.disable_parallel_tool_use === true
            ? { parallel_tool_calls: false }
            : {};
    if (choice.type === "any") return { tool_choice: "required", ...parallel };
    if (choice.type === "tool" && choice.name) {
        return {
            tool_choice: { type: "function", function: { name: choice.name } },
            ...parallel,
        };
    }
    return {
        tool_choice: choice.type === "none" ? "none" : "auto",
        ...parallel,
    };
}

function tools(request: CreateMessageRequest) {
    if (!request.tools?.length) return {};
    for (const tool of request.tools) {
        if (tool.type && tool.type !== "custom") {
            // Claude Code drops a server tool when the rejection names its tag.
            throw new MessagesRequestError(
                `Input tag '${tool.type}' found using 'type' does not match any of the expected tags: 'custom'`,
            );
        }
    }
    return {
        tools: request.tools.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                ...(tool.description && { description: tool.description }),
                parameters: tool.input_schema ?? { type: "object" },
            },
        })),
    };
}

/** Translate a Messages request into the Chat Completions request it runs as. */
export function messagesToChatRequest(
    request: CreateMessageRequest,
): CreateChatCompletionRequest {
    const system =
        request.system === undefined
            ? []
            : [
                  {
                      role: "system",
                      content:
                          typeof request.system === "string"
                              ? request.system
                              : request.system.map(contentPart),
                  } as ChatMessage,
              ];
    const effort = reasoningEffort(request);
    return {
        model: request.model,
        messages: [...system, ...request.messages.flatMap(chatMessages)],
        max_tokens: request.max_tokens,
        stream: request.stream ?? false,
        ...(request.stop_sequences?.length && {
            stop: request.stop_sequences,
        }),
        ...(request.temperature !== undefined && {
            temperature: request.temperature,
        }),
        ...(request.top_p !== undefined && { top_p: request.top_p }),
        ...(effort && { reasoning_effort: effort }),
        ...tools(request),
        ...toolChoice(request.tool_choice),
    } as CreateChatCompletionRequest;
}

/** Anthropic's usage split, from the same normalizer billing uses. */
export function messagesUsage(usage: CompletionUsage): MessagesUsage {
    const normalized = openaiUsageToUsage(usage);
    return {
        input_tokens:
            (normalized.promptTextTokens ?? 0) +
            (normalized.promptAudioTokens ?? 0) +
            (normalized.promptImageTokens ?? 0) +
            (normalized.promptVideoTokens ?? 0),
        output_tokens:
            (normalized.completionTextTokens ?? 0) +
            (normalized.completionReasoningTokens ?? 0) +
            (normalized.completionAudioTokens ?? 0) +
            (normalized.completionImageTokens ?? 0),
        cache_read_input_tokens: normalized.promptCachedTokens ?? 0,
        cache_creation_input_tokens: normalized.promptCacheWriteTokens ?? 0,
    };
}

export function stopReason(
    finishReason: string | null | undefined,
    hasToolUse: boolean,
): string {
    if (hasToolUse) return "tool_use";
    if (finishReason === "length") return "max_tokens";
    if (finishReason === "content_filter") return "refusal";
    return "end_turn";
}

export function toolUseInput(argumentsJson: string): unknown {
    try {
        return JSON.parse(argumentsJson || "{}");
    } catch {
        return {};
    }
}

/** Translate a Chat Completions response into a Messages response. */
export function chatToMessagesResponse(
    completion: CreateChatCompletionResponse,
    model: string,
): CreateMessageResponse {
    const choice = completion.choices[0];
    const message = choice?.message;
    const content: MessagesContentBlock[] = [];
    const providerThinking = (message?.content_blocks ?? []).filter(
        (block) =>
            block.type === "thinking" || block.type === "redacted_thinking",
    ) as MessagesContentBlock[];
    if (providerThinking.length) {
        content.push(...providerThinking);
    } else if (message?.reasoning_content) {
        content.push({
            type: "thinking",
            thinking: message.reasoning_content,
            signature: "",
        });
    }
    if (message?.content) content.push({ type: "text", text: message.content });
    for (const call of message?.tool_calls ?? []) {
        content.push({
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: toolUseInput(call.function.arguments),
        });
    }
    const hasToolUse = Boolean(message?.tool_calls?.length);
    return {
        id: completion.id,
        type: "message",
        role: "assistant",
        model,
        content,
        stop_reason: stopReason(choice?.finish_reason, hasToolUse),
        stop_sequence: null,
        usage: messagesUsage(completion.usage),
    };
}

const ERROR_TYPES: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    402: "billing_error",
    403: "permission_error",
    404: "not_found_error",
    413: "request_too_large",
    429: "rate_limit_error",
    503: "overloaded_error",
    504: "timeout_error",
    529: "overloaded_error",
};

export function messagesError(status: number, message: string) {
    return {
        type: "error" as const,
        error: {
            type:
                ERROR_TYPES[status] ??
                (status >= 500 ? "api_error" : "invalid_request_error"),
            message,
        },
    };
}

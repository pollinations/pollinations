// Translate a Chat Completions JSON response into an Anthropic Message.
//
// The chat pipeline guarantees provider usage on success
// (requireChatCompletionUsage); a response without it fails loudly here
// instead of returning an unbilled message.
import { CompletionUsageSchema } from "@shared/schemas/openai.ts";
import type {
    CreateMessagesResponse,
    MessagesUsage,
} from "@shared/schemas/anthropic.ts";

export class MessagesUsageError extends Error {
    override readonly name = "MessagesUsageError";
}

type ChatToolCall = {
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
};

type ChatMessage = {
    content?: unknown;
    content_blocks?: unknown;
    tool_calls?: unknown;
    reasoning_content?: unknown;
};

type ChatChoice = {
    message?: ChatMessage;
    finish_reason?: unknown;
};

export function chatUsageToMessagesUsage(usage: unknown): MessagesUsage {
    const parsed = CompletionUsageSchema.safeParse(usage);
    if (!parsed.success || !parsed.data) {
        throw new MessagesUsageError(
            "Chat Completions provider returned an invalid response or omitted usage",
        );
    }
    const data = parsed.data;
    return {
        input_tokens: data.prompt_tokens,
        output_tokens: data.completion_tokens,
        ...(data.prompt_tokens_details?.cache_write_tokens ||
        data.prompt_tokens_details?.cache_creation_input_tokens ||
        data.cache_creation_input_tokens
            ? {
                  cache_creation_input_tokens:
                      data.prompt_tokens_details?.cache_write_tokens ??
                      data.prompt_tokens_details
                          ?.cache_creation_input_tokens ??
                      data.cache_creation_input_tokens ??
                      0,
              }
            : {}),
        ...(data.prompt_tokens_details?.cached_tokens ||
        data.cached_input_tokens ||
        data.cache_read_input_tokens
            ? {
                  cache_read_input_tokens:
                      data.prompt_tokens_details?.cached_tokens ??
                      data.cached_input_tokens ??
                      data.cache_read_input_tokens ??
                      0,
              }
            : {}),
    };
}

function parseToolInput(raw: unknown): unknown {
    if (typeof raw !== "string" || !raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function stopReason(
    finishReason: unknown,
    hasToolCalls: boolean,
): string {
    if (hasToolCalls) return "tool_use";
    switch (finishReason) {
        case "tool_calls":
            return "tool_use";
        case "length":
            return "max_tokens";
        case "content_filter":
            return "refusal";
        case "stop":
        case null:
        case undefined:
            return "end_turn";
        default:
            return "end_turn";
    }
}

/**
 * Translate one chat completion choice into Anthropic content blocks.
 * Order follows the provider: reasoning first, then text, then tool calls.
 */
export function translateChatMessage(message: ChatMessage): {
    content: CreateMessagesResponse["content"];
    hasToolCalls: boolean;
} {
    const content: CreateMessagesResponse["content"] = [];
    if (typeof message.reasoning_content === "string" && message.reasoning_content) {
        content.push({ type: "thinking", thinking: message.reasoning_content });
    }
    if (Array.isArray(message.content_blocks)) {
        for (const block of message.content_blocks) {
            if (!block || typeof block !== "object") continue;
            const part = block as { type?: unknown; thinking?: unknown; text?: unknown };
            if (part.type === "thinking" && typeof part.thinking === "string") {
                content.push({ type: "thinking", thinking: part.thinking });
            } else if (part.type === "text" && typeof part.text === "string") {
                content.push({ type: "text", text: part.text });
            }
        }
    }
    if (typeof message.content === "string" && message.content) {
        content.push({ type: "text", text: message.content });
    }
    const toolCalls = Array.isArray(message.tool_calls)
        ? (message.tool_calls as ChatToolCall[])
        : [];
    for (const call of toolCalls) {
        if (typeof call?.id !== "string") continue;
        content.push({
            type: "tool_use",
            id: call.id,
            name:
                typeof call.function?.name === "string"
                    ? call.function.name
                    : "tool",
            input: parseToolInput(call.function?.arguments),
        });
    }
    return { content, hasToolCalls: toolCalls.length > 0 };
}

export function translateChatCompletion(
    completion: {
        id?: unknown;
        model?: unknown;
        choices?: ChatChoice[];
        usage?: unknown;
    },
    requestedModel: string,
): CreateMessagesResponse {
    const choice = completion.choices?.[0];
    if (!choice?.message) {
        throw new MessagesUsageError(
            "Chat Completions provider returned a response without choices",
        );
    }
    const usage = chatUsageToMessagesUsage(completion.usage);
    const { content, hasToolCalls } = translateChatMessage(choice.message);
    return {
        id:
            typeof completion.id === "string" && completion.id
                ? completion.id
                : `msg_${crypto.randomUUID().replaceAll("-", "")}`,
        type: "message",
        role: "assistant",
        content,
        model:
            typeof completion.model === "string" && completion.model
                ? completion.model
                : requestedModel,
        stop_reason: stopReason(choice.finish_reason, hasToolCalls),
        stop_sequence: null,
        usage,
    };
}

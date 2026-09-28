// OpenAI Chat Completions response → Anthropic Messages response translation.

import type {
    AnthropicMessagesResponse,
    AnthropicResponseBlock,
    AnthropicUsage,
} from "@shared/schemas/anthropic.ts";
import type { ChatCompletion } from "../types.js";

function int(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.trunc(value))
        : 0;
}

/**
 * Maps provider usage to Anthropic's fields. Cache-read hits map from the
 * OpenAI `cached_tokens` detail (Anthropic's native field name is kept as an
 * additional fallback for providers that report it directly).
 */
export function usageToAnthropic(
    usage: Record<string, unknown>,
): AnthropicUsage {
    const promptDetails = (usage.prompt_tokens_details ?? {}) as Record<
        string,
        unknown
    >;
    return {
        input_tokens: int(usage.prompt_tokens),
        cache_creation_input_tokens: int(
            promptDetails.cache_creation_input_tokens ??
                usage.cache_creation_input_tokens,
        ),
        cache_read_input_tokens: int(
            promptDetails.cached_tokens ?? usage.cache_read_input_tokens,
        ),
        output_tokens: int(usage.completion_tokens),
    };
}

function stopReason(
    finish: string | null | undefined,
): AnthropicMessagesResponse["stop_reason"] {
    switch (finish) {
        case "length":
            return "max_tokens";
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "content_filter":
            return "refusal";
        default:
            return "end_turn";
    }
}

/** Concatenates a content field that providers return as string or parts. */
function textContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part) =>
                part && typeof part === "object" && "text" in part
                    ? String((part as { text?: unknown }).text ?? "")
                    : "",
            )
            .join("");
    }
    return "";
}

function contentBlocks(completion: ChatCompletion): AnthropicResponseBlock[] {
    const message = completion.choices?.[0]?.message;
    if (!message) return [{ type: "text", text: "" }];

    const blocks: AnthropicResponseBlock[] = [];

    const reasoning = message.reasoning_content ?? message.reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
        blocks.push({ type: "thinking", thinking: reasoning, signature: "" });
    }

    const text = textContent(message.content);
    const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];

    if (text.length > 0 || toolCalls.length === 0) {
        blocks.push({ type: "text", text });
    }

    for (const call of toolCalls) {
        const toolCall = call as {
            id?: unknown;
            function?: { name?: unknown; arguments?: unknown };
        };
        let input: Record<string, unknown> = {};
        try {
            const parsed = toolCall.function?.arguments as unknown;
            if (typeof parsed === "string" && parsed.length > 0) {
                input = JSON.parse(parsed) as Record<string, unknown>;
            } else if (parsed && typeof parsed === "object") {
                input = parsed as Record<string, unknown>;
            }
        } catch {
            // A provider that streamed malformed JSON arguments keeps the
            // tool_use block with an empty input rather than failing the
            // whole message.
        }
        blocks.push({
            type: "tool_use",
            id: typeof toolCall.id === "string" ? toolCall.id : "",
            name:
                typeof toolCall.function?.name === "string"
                    ? toolCall.function.name
                    : "",
            input,
        });
    }

    return blocks;
}

/**
 * Builds the Anthropic Messages JSON response from a completed Chat
 * Completion. The caller has already validated that provider usage exists —
 * usage must never be invented here, because billing reads the same numbers.
 */
export function chatCompletionToAnthropicMessage(
    completion: ChatCompletion,
    servedModel: string,
): AnthropicMessagesResponse {
    const usage = usageToAnthropic(
        (completion.usage ?? {}) as Record<string, unknown>,
    );
    return {
        id: `msg_${completion.id ?? "unknown"}`,
        type: "message",
        role: "assistant",
        model: completion.model ?? servedModel,
        content: contentBlocks(completion),
        stop_reason: stopReason(completion.choices?.[0]?.finish_reason),
        stop_sequence: null,
        usage,
    };
}

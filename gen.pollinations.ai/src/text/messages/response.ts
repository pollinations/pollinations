import type { AnthropicUsage } from "@shared/schemas/anthropic.ts";
import type { ChatCompletion } from "../../types.js";
import { AnthropicApiError } from "./errors.js";

interface ToolCallLike {
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
    [key: string]: unknown;
}

function toAnthropicUsage(usage: Record<string, unknown>): AnthropicUsage {
    const read = (key: string): number | undefined => {
        const value = usage[key];
        return typeof value === "number" ? value : undefined;
    };
    const anthropic: AnthropicUsage = {
        input_tokens: read("prompt_tokens") ?? read("input_tokens") ?? 0,
        output_tokens: read("completion_tokens") ?? read("output_tokens") ?? 0,
    };
    const cacheRead =
        read("cache_read_input_tokens") ?? read("cached_input_tokens");
    if (cacheRead !== undefined) {
        anthropic.cache_read_input_tokens = cacheRead;
    }
    const cacheWrite = read("cache_creation_input_tokens");
    if (cacheWrite !== undefined) {
        anthropic.cache_creation_input_tokens = cacheWrite;
    }
    return anthropic;
}

function stopReasonFor(
    finishReason: string | null | undefined,
): "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null {
    switch (finishReason) {
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "length":
            return "max_tokens";
        case "stop":
        case "end_turn":
            return "end_turn";
        default:
            return finishReason ? "end_turn" : null;
    }
}

function contentBlocksFor(
    completion: ChatCompletion,
): Record<string, unknown>[] {
    const message = completion.choices?.[0]?.message;
    const blocks: Record<string, unknown>[] = [];
    const reasoning =
        typeof message?.reasoning_content === "string" &&
        message.reasoning_content
            ? message.reasoning_content
            : undefined;
    if (reasoning) {
        blocks.push({ type: "thinking", thinking: reasoning });
    }
    if (typeof message?.content === "string" && message.content) {
        blocks.push({ type: "text", text: message.content });
    } else if (Array.isArray(message?.content)) {
        for (const part of message.content as Record<string, unknown>[]) {
            if (part?.type === "text" && typeof part.text === "string") {
                blocks.push({ type: "text", text: part.text });
            }
        }
    }
    const toolCalls = (message?.tool_calls ?? []) as ToolCallLike[];
    for (const call of toolCalls) {
        let input: unknown = {};
        if (typeof call.function?.arguments === "string") {
            try {
                input = JSON.parse(call.function.arguments);
            } catch {
                input = {};
            }
        }
        blocks.push({
            type: "tool_use",
            id: call.id ?? `toolu_${crypto.randomUUID()}`,
            name: call.function?.name ?? "",
            input,
        });
    }
    return blocks;
}

/**
 * Translate a Chat Completions response into an Anthropic Messages
 * response. The spec requires failing unbilled responses: a completion
 * without provider usage throws instead of returning a message.
 */
export function chatCompletionToMessage(
    completion: ChatCompletion,
    requestedModel: string,
): Record<string, unknown> {
    if (completion.error) {
        const error = completion.error;
        const message =
            typeof error === "string"
                ? error
                : (error.message ?? "Text generation failed");
        throw new AnthropicApiError(502, message);
    }
    const usage = completion.usage;
    if (!usage || typeof usage !== "object") {
        // Missing provider usage would make the request unbilled: fail
        // instead of returning a message (issue #15490 billing rule).
        throw new AnthropicApiError(
            502,
            "Upstream response did not include usage; refusing to return an unbilled message",
        );
    }
    const choice = completion.choices?.[0];
    const blocks = contentBlocksFor(completion);
    return {
        id: `msg_${completion.id ?? crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        model: requestedModel,
        content: blocks,
        stop_reason: stopReasonFor(choice?.finish_reason),
        stop_sequence: null,
        usage: toAnthropicUsage(usage),
    };
}

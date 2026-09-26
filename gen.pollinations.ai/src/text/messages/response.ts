import { UpstreamError } from "@shared/error.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import type { ChatCompletion } from "../types.js";

type JsonObject = Record<string, unknown>;

export type AnthropicUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation: null;
    inference_geo: null;
    output_tokens_details: { thinking_tokens: number } | null;
    server_tool_use: null;
    service_tier: null;
};

function token(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : 0;
}

export function chatUsageToAnthropic(usage: unknown): AnthropicUsage {
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
        throw new UpstreamError(502, {
            message: "Chat Completions provider omitted valid usage",
            errorCode: "usage_missing",
        });
    }
    const normalized = openaiUsageToUsage(
        usage as Parameters<typeof openaiUsageToUsage>[0],
    );
    const inputTokens =
        token(normalized.promptTextTokens) +
        token(normalized.promptAudioTokens) +
        token(normalized.promptImageTokens) +
        token(normalized.promptVideoTokens);
    const thinkingTokens = token(normalized.completionReasoningTokens);
    const outputTokens =
        token(normalized.completionTextTokens) +
        thinkingTokens +
        token(normalized.completionAudioTokens) +
        token(normalized.completionImageTokens);
    const cacheRead = token(normalized.promptCachedTokens);
    const cacheWrite = token(normalized.promptCacheWriteTokens);

    return {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheWrite,
        cache_read_input_tokens: cacheRead,
        cache_creation: null,
        inference_geo: null,
        output_tokens_details:
            thinkingTokens > 0 ? { thinking_tokens: thinkingTokens } : null,
        server_tool_use: null,
        service_tier: null,
    };
}

function parseToolInput(value: unknown): unknown {
    if (typeof value !== "string") return value ?? {};
    try {
        return JSON.parse(value);
    } catch (cause) {
        throw new UpstreamError(502, {
            message: "Text model returned invalid tool call JSON",
            cause,
        });
    }
}

function responseContent(message: JsonObject): JsonObject[] {
    const result: JsonObject[] = [];
    let hasTextBlock = false;
    let hasThinkingBlock = false;
    const blocks = Array.isArray(message.content_blocks)
        ? message.content_blocks
        : [];

    for (const raw of blocks) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const block = raw as JsonObject;
        if (block.type === "thinking" && typeof block.thinking === "string") {
            hasThinkingBlock = true;
            result.push({
                type: "thinking",
                thinking: block.thinking,
                signature:
                    typeof block.signature === "string"
                        ? block.signature
                        : "pollinations",
            });
            continue;
        }
        if (
            block.type === "redacted_thinking" &&
            typeof block.data === "string"
        ) {
            hasThinkingBlock = true;
            result.push({ type: "redacted_thinking", data: block.data });
            continue;
        }
        if (block.type === "text" && typeof block.text === "string") {
            hasTextBlock = true;
            result.push({ type: "text", text: block.text });
            continue;
        }
        if (
            block.type === "tool_use" &&
            typeof block.id === "string" &&
            typeof block.name === "string"
        ) {
            result.push({
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input ?? {},
            });
        }
    }

    if (
        !hasThinkingBlock &&
        typeof message.reasoning_content === "string" &&
        message.reasoning_content
    ) {
        result.push({
            type: "thinking",
            thinking: message.reasoning_content,
            signature: "pollinations",
        });
    }

    if (
        !hasTextBlock &&
        typeof message.content === "string" &&
        message.content
    ) {
        result.push({ type: "text", text: message.content });
    }

    if (Array.isArray(message.tool_calls)) {
        for (const raw of message.tool_calls) {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
            const call = raw as JsonObject;
            const fn =
                call.function &&
                typeof call.function === "object" &&
                !Array.isArray(call.function)
                    ? (call.function as JsonObject)
                    : undefined;
            if (
                typeof call.id !== "string" ||
                !fn ||
                typeof fn.name !== "string"
            ) {
                continue;
            }
            result.push({
                type: "tool_use",
                id: call.id,
                name: fn.name,
                input: parseToolInput(fn.arguments),
            });
        }
    }

    return result;
}

export function chatFinishReasonToAnthropic(
    value: unknown,
): "end_turn" | "max_tokens" | "tool_use" | "refusal" {
    if (value === "tool_calls" || value === "function_call") return "tool_use";
    if (value === "length" || value === "max_tokens") return "max_tokens";
    if (value === "content_filter") return "refusal";
    return "end_turn";
}

export function chatCompletionToAnthropic(
    completion: ChatCompletion,
    model: string,
): JsonObject {
    const choice = completion.choices?.[0];
    const message =
        choice?.message && typeof choice.message === "object"
            ? (choice.message as JsonObject)
            : undefined;
    if (!choice || !message) {
        throw new UpstreamError(502, {
            message: "Text model returned an invalid Chat Completions response",
        });
    }

    const stopSequence =
        typeof choice.stop_sequence === "string" ? choice.stop_sequence : null;

    return {
        id:
            typeof completion.id === "string" && completion.id
                ? completion.id
                : `msg_${crypto.randomUUID().replaceAll("-", "")}`,
        type: "message",
        role: "assistant",
        model,
        container: null,
        content: responseContent(message),
        stop_details: null,
        stop_reason: stopSequence
            ? "stop_sequence"
            : chatFinishReasonToAnthropic(choice.finish_reason),
        stop_sequence: stopSequence,
        usage: chatUsageToAnthropic(completion.usage),
    };
}

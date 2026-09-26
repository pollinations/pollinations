import type {
    CreateMessageResponse,
    MessageUsage,
    ResponseContentBlock,
} from "@shared/schemas/anthropic.ts";
import type { ChatCompletion, CompletionChoice } from "../types.js";

type JsonObject = Record<string, unknown>;

function toMessageId(id: string | undefined): string {
    if (!id) return `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    return id.startsWith("msg_") ? id : `msg_${id.replace(/^pllns_/, "")}`;
}

function stopReason(
    finishReason: string | null | undefined,
): CreateMessageResponse["stop_reason"] {
    switch (finishReason) {
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

function contentBlocks(
    message: JsonObject | undefined,
): ResponseContentBlock[] {
    if (!message) return [];
    const blocks: ResponseContentBlock[] = [];

    const providerBlocks = message.content_blocks;
    if (Array.isArray(providerBlocks)) {
        for (const raw of providerBlocks) {
            const block = raw as JsonObject;
            if (
                block.type === "thinking" &&
                typeof block.thinking === "string"
            ) {
                blocks.push({
                    type: "thinking",
                    thinking: block.thinking,
                    signature: "",
                });
            } else if (
                block.type === "redacted_thinking" &&
                typeof block.data === "string"
            ) {
                blocks.push({ type: "redacted_thinking", data: block.data });
            }
        }
    }
    if (!blocks.length && typeof message.reasoning_content === "string") {
        blocks.push({
            type: "thinking",
            thinking: message.reasoning_content,
            signature: "",
        });
    }

    if (typeof message.content === "string" && message.content) {
        blocks.push({ type: "text", text: message.content });
    }

    if (Array.isArray(message.tool_calls)) {
        for (const raw of message.tool_calls) {
            const call = raw as JsonObject;
            const fn = call.function as JsonObject | undefined;
            if (typeof fn?.name !== "string") continue;
            let input: Record<string, unknown> = {};
            try {
                input =
                    typeof fn.arguments === "string" && fn.arguments
                        ? JSON.parse(fn.arguments)
                        : {};
            } catch {
                input = {};
            }
            blocks.push({
                type: "tool_use",
                id: typeof call.id === "string" ? call.id : crypto.randomUUID(),
                name: fn.name,
                input,
            });
        }
    }

    return blocks;
}

function usage(completion: ChatCompletion): MessageUsage {
    const raw = (completion.usage ?? {}) as JsonObject;
    const details = (raw.prompt_tokens_details ?? {}) as JsonObject;
    const cacheCreation =
        raw.cache_creation_input_tokens ??
        details.cache_write_tokens ??
        details.cache_creation_input_tokens;
    const cacheRead =
        raw.cache_read_input_tokens ??
        raw.cached_input_tokens ??
        details.cached_tokens;

    return {
        input_tokens: Number(raw.prompt_tokens ?? 0),
        output_tokens: Number(raw.completion_tokens ?? 0),
        ...(typeof cacheCreation === "number"
            ? { cache_creation_input_tokens: cacheCreation }
            : {}),
        ...(typeof cacheRead === "number"
            ? { cache_read_input_tokens: cacheRead }
            : {}),
    };
}

export function chatCompletionToMessage(
    completion: ChatCompletion,
    model: string,
): CreateMessageResponse {
    const choice: CompletionChoice | undefined = completion.choices?.[0];

    return {
        id: toMessageId(completion.id),
        type: "message",
        role: "assistant",
        model,
        content: contentBlocks(choice?.message as JsonObject | undefined),
        stop_reason: stopReason(choice?.finish_reason),
        stop_sequence: null,
        usage: usage(completion),
    };
}

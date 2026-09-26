import type { Usage } from "@shared/registry/registry.ts";
import { openaiUsageToUsage } from "@shared/registry/usage-headers.ts";
import type {
    CompletionUsage,
    CreateChatCompletionResponse,
} from "@shared/schemas/openai.ts";
import { z } from "zod";

export const MessageResponseSchema = z
    .object({
        id: z.string(),
        type: z.literal("message"),
        role: z.literal("assistant"),
        model: z.string(),
        content: z.array(z.object({ type: z.string() }).passthrough()),
        stop_reason: z.string().nullable(),
        stop_sequence: z.string().nullable(),
        usage: z.object({
            input_tokens: z.number().int(),
            output_tokens: z.number().int(),
            cache_creation_input_tokens: z.number().int(),
            cache_read_input_tokens: z.number().int(),
        }),
    })
    .meta({ $id: "Message" });

const STOP_REASONS: Record<string, string> = {
    length: "max_tokens",
    tool_calls: "tool_use",
    function_call: "tool_use",
    content_filter: "refusal",
};

export const stopReason = (
    finishReason: string | null | undefined,
    hasToolCalls: boolean,
) =>
    STOP_REASONS[finishReason ?? ""] ??
    (hasToolCalls ? "tool_use" : "end_turn");

export const messageId = () => `msg_${crypto.randomUUID().replaceAll("-", "")}`;

const sum = (usage: Usage, keys: (keyof Usage)[]) =>
    keys.reduce((total, key) => total + (usage[key] ?? 0), 0);

/**
 * Anthropic counts cache reads and writes apart from `input_tokens`; Chat
 * Completions includes them in `prompt_tokens`. The shared normalization
 * already separates them, so both APIs report the same billed tokens.
 */
export function messageUsage(chatUsage: CompletionUsage) {
    const usage = openaiUsageToUsage(chatUsage);
    return {
        input_tokens: sum(usage, [
            "promptTextTokens",
            "promptAudioTokens",
            "promptImageTokens",
            "promptVideoTokens",
        ]),
        output_tokens: sum(usage, [
            "completionTextTokens",
            "completionAudioTokens",
            "completionImageTokens",
            "completionReasoningTokens",
        ]),
        cache_creation_input_tokens: usage.promptCacheWriteTokens ?? 0,
        cache_read_input_tokens: usage.promptCachedTokens ?? 0,
    };
}

/** Provider reasoning: `reasoning_content`, or thinking blocks for Claude. */
function reasoningOf(
    message?: CreateChatCompletionResponse["choices"][0]["message"],
) {
    return (
        message?.reasoning_content ||
        message?.content_blocks
            ?.map((block) => (block.type === "thinking" ? block.thinking : ""))
            .join("")
    );
}

function toolInput(args: string) {
    try {
        return JSON.parse(args);
    } catch {
        return {};
    }
}

/** Translate a Chat Completions response into an Anthropic Message. */
export function chatToMessage(
    completion: CreateChatCompletionResponse,
    model: string,
) {
    const [choice] = completion.choices;
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];
    const reasoning = reasoningOf(message);
    return {
        id: messageId(),
        type: "message",
        role: "assistant",
        model,
        content: [
            ...(reasoning
                ? [{ type: "thinking", thinking: reasoning, signature: "" }]
                : []),
            ...(message?.content
                ? [{ type: "text", text: message.content }]
                : []),
            ...toolCalls.map((call) => ({
                type: "tool_use",
                id: call.id,
                name: call.function.name,
                input: toolInput(call.function.arguments),
            })),
        ],
        stop_reason: stopReason(choice?.finish_reason, toolCalls.length > 0),
        stop_sequence: null,
        usage: messageUsage(completion.usage),
    };
}

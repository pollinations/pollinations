// Anthropic Messages <-> internal Chat Completions translation.
//
// The gateway's text pipeline speaks OpenAI-shaped Chat Completions. Rather
// than adding a second provider path (which the quest forbids), the Messages
// endpoint adapts requests into that shape, calls the shared chat pipeline,
// and adapts the result back. Keep these two directions pure and total so
// they are cheap to test.

import type {
    AnthropicContentBlock,
    AnthropicContentBlockParam,
    AnthropicMessageParam,
    AnthropicMessageResponse,
    AnthropicUsage,
    CreateAnthropicMessageRequest,
} from "@shared/schemas/anthropic.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { ChatCompletion, ChatMessage } from "@/text/types.ts";

type ContentPart = Record<string, unknown>;

/** Anthropic `system` may be a string or text blocks; both flatten to one string. */
function systemToText(
    system: CreateAnthropicMessageRequest["system"],
): string | undefined {
    if (system === undefined) return undefined;
    if (typeof system === "string") return system;
    const text = system
        .map((block) => block.text)
        .filter((value): value is string => typeof value === "string")
        .join("\n");
    return text.length > 0 ? text : undefined;
}

/** Convert one Anthropic content block into an OpenAI-style content part. */
function blockToPart(block: AnthropicContentBlockParam): ContentPart | null {
    switch (block.type) {
        case "text":
            return { type: "text", text: block.text };
        case "image": {
            const source = block.source as {
                type?: string;
                media_type?: string;
                data?: string;
                url?: string;
            };
            const url =
                source.type === "base64"
                    ? `data:${source.media_type ?? "image/png"};base64,${source.data ?? ""}`
                    : (source.url ?? "");
            return { type: "image_url", image_url: { url } };
        }
        case "tool_use":
            return {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input,
            };
        case "tool_result":
            return {
                type: "tool_result",
                tool_use_id: block.tool_use_id,
                content: block.content,
                is_error: block.is_error,
            };
        case "thinking":
            return { type: "thinking", thinking: block.thinking };
        default:
            // Unknown block kinds pass through so provider extensions survive.
            return { type: block.type };
    }
}

/** Normalize an Anthropic message's content into an array of parts. */
function contentToParts(
    content: AnthropicMessageParam["content"],
): ContentPart[] {
    if (typeof content === "string") return [{ type: "text", text: content }];
    return content
        .map(blockToPart)
        .filter((part): part is ContentPart => part !== null);
}

/**
 * Adapt an Anthropic Messages request into the Chat Completions request the
 * shared pipeline expects. Tool calls and results keep their shape; the
 * pipeline's existing transforms understand the OpenAI equivalents, so tool
 * blocks are parked in the same slots the chat adapter already produces.
 */
export function anthropicToChatRequest(
    request: CreateAnthropicMessageRequest,
): CreateChatCompletionRequest {
    const messages: ChatMessage[] = [];

    const system = systemToText(request.system);
    if (system) messages.push({ role: "system", content: system });

    for (const message of request.messages) {
        const parts = contentToParts(message.content);

        if (message.role === "assistant") {
            const toolUses = parts.filter((part) => part.type === "tool_use");
            const text = parts
                .filter((part) => part.type === "text")
                .map((part) => String(part.text ?? ""))
                .join("");
            // Preserve thinking blocks on replay: Anthropic requires the
            // assistant's thinking to round-trip when tool use is involved.
            // The chat pipeline carries reasoning in `reasoning_content`.
            const thinking = parts
                .filter((part) => part.type === "thinking")
                .map((part) => String(part.thinking ?? ""))
                .join("");
            messages.push({
                role: "assistant",
                content: text.length > 0 ? text : null,
                ...(thinking.length > 0 ? { reasoning_content: thinking } : {}),
                ...(toolUses.length > 0
                    ? {
                          tool_calls: toolUses.map((part) => ({
                              id: part.id,
                              type: "function",
                              function: {
                                  name: part.name,
                                  arguments: JSON.stringify(part.input ?? {}),
                              },
                          })),
                      }
                    : {}),
            });
            continue;
        }

        // user turn: tool_result blocks become `tool` messages, the rest
        // stays as multimodal content.
        const toolResults = parts.filter((part) => part.type === "tool_result");
        const remaining = parts.filter((part) => part.type !== "tool_result");

        for (const result of toolResults) {
            const content = result.content;
            messages.push({
                role: "tool",
                tool_call_id: String(result.tool_use_id ?? ""),
                content:
                    typeof content === "string"
                        ? content
                        : JSON.stringify(content ?? ""),
            });
        }

        if (remaining.length > 0) {
            messages.push({
                role: "user",
                content:
                    remaining.length === 1 && remaining[0].type === "text"
                        ? String(remaining[0].text ?? "")
                        : remaining,
            });
        }
    }

    const body = {
        model: request.model,
        messages:
            messages as unknown as CreateChatCompletionRequest["messages"],
        max_tokens: request.max_tokens,
        stream: request.stream ?? false,
    } as CreateChatCompletionRequest;

    if (request.temperature !== undefined)
        body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.stop_sequences !== undefined) {
        body.stop = request.stop_sequences;
    }
    if (request.tools !== undefined) {
        body.tools = request.tools.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        })) as CreateChatCompletionRequest["tools"];
    }
    if (request.tool_choice !== undefined) {
        body.tool_choice = anthropicToolChoiceToOpenAI(
            request.tool_choice,
        ) as CreateChatCompletionRequest["tool_choice"];
    }

    return body;
}

const anthropicToolChoiceToOpenAI = (
    choice: NonNullable<CreateAnthropicMessageRequest["tool_choice"]>,
): unknown => {
    switch (choice.type) {
        case "any":
            return "required";
        case "none":
            return "none";
        case "tool":
            return choice.name
                ? { type: "function", function: { name: choice.name } }
                : "required";
        default:
            return "auto";
    }
};

/**
 * Anthropic usage directions differ from OpenAI's inclusive totals: native
 * Anthropic `input_tokens` EXCLUDES cache reads/writes. The shared billing
 * mapper treats cache tokens as inclusive, so reconstruct the inclusive
 * totals here — otherwise cache-heavy requests under-bill.
 */
export function anthropicUsageToOpenAI(
    usage: Partial<AnthropicUsage> & Record<string, unknown>,
): Record<string, unknown> {
    const input = Number(usage.input_tokens ?? 0);
    const output = Number(usage.output_tokens ?? 0);
    const cacheRead = Number(usage.cache_read_input_tokens ?? 0) || 0;
    const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0) || 0;
    const promptTokens = input + cacheRead + cacheWrite;

    const result: Record<string, unknown> = {
        prompt_tokens: promptTokens,
        completion_tokens: output,
        total_tokens: promptTokens + output,
    };
    if (cacheRead || cacheWrite) {
        result.prompt_tokens_details = {
            cached_tokens: cacheRead,
            cache_write_tokens: cacheWrite,
        };
    }
    const reasoning = Number(
        (usage as { reasoning_tokens?: number }).reasoning_tokens ?? 0,
    );
    if (reasoning) {
        result.completion_tokens_details = { reasoning_tokens: reasoning };
    }
    return result;
}

/** Map an OpenAI stop reason to Anthropic's vocabulary. */
function mapStopReason(reason: unknown): string | null {
    switch (reason) {
        case "stop":
            return "end_turn";
        case "length":
            return "max_tokens";
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "content_filter":
            return "refusal";
        default:
            return reason ? String(reason) : null;
    }
}

const toAnthropicUsage = (raw: unknown): AnthropicUsage => {
    const usage = (raw ?? {}) as Record<string, unknown>;
    const details = (usage.prompt_tokens_details ?? {}) as Record<
        string,
        unknown
    >;
    const prompt = Number(usage.prompt_tokens ?? 0);
    const cacheRead = Number(details.cached_tokens ?? 0) || 0;
    const cacheWrite = Number(details.cache_write_tokens ?? 0) || 0;
    return {
        input_tokens: Math.max(0, prompt - cacheRead - cacheWrite),
        output_tokens: Number(usage.completion_tokens ?? 0),
        ...(cacheRead ? { cache_read_input_tokens: cacheRead } : {}),
        ...(cacheWrite ? { cache_creation_input_tokens: cacheWrite } : {}),
    };
};

/**
 * Convert a Chat Completions result into an Anthropic Messages response.
 * Tool calls become `tool_use` blocks; provider reasoning becomes `thinking`
 * so Claude Code renders it the same way it renders Anthropic's own.
 */
export function chatToAnthropicResponse(
    completion: ChatCompletion,
    fallbackModel: string,
): AnthropicMessageResponse {
    const choice = completion.choices?.[0] ?? {};
    const message = (choice.message ?? {}) as ChatMessage;
    const content: AnthropicContentBlock[] = [];

    const reasoning =
        (message.reasoning_content as string | undefined) ??
        ((message as { reasoning?: string }).reasoning as string | undefined);
    if (reasoning) {
        content.push({ type: "thinking", thinking: reasoning });
    }

    const text =
        typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                    .map((part) =>
                        part && typeof part === "object" && "text" in part
                            ? String((part as { text?: unknown }).text ?? "")
                            : "",
                    )
                    .join("")
              : "";
    if (text.length > 0) content.push({ type: "text", text });

    const toolCalls = (message.tool_calls ?? []) as Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
    }>;
    for (const call of toolCalls) {
        let input: Record<string, unknown> = {};
        try {
            input = JSON.parse(call.function?.arguments ?? "{}");
        } catch {
            input = {};
        }
        content.push({
            type: "tool_use",
            id: call.id ?? `toolu_${Math.random().toString(36).slice(2)}`,
            name: call.function?.name ?? "tool",
            input,
        });
    }

    if (content.length === 0) content.push({ type: "text", text: "" });

    return {
        id:
            (completion.id as string) ??
            `msg_${Math.random().toString(36).slice(2)}`,
        type: "message",
        role: "assistant",
        model: (completion.model as string) ?? fallbackModel,
        content,
        stop_reason: mapStopReason(
            choice.finish_reason,
        ) as AnthropicMessageResponse["stop_reason"],
        stop_sequence: null,
        usage: toAnthropicUsage(completion.usage),
    };
}

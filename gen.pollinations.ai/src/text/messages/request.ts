// Anthropic Messages request → OpenAI Chat Completions request translation.
//
// Everything that Chat Completions supports maps 1:1 (messages, tools, tool
// choice, sampling, stop sequences, vision, prompt-cache markers). Fields with
// no Chat equivalent are dropped deliberately and silently — thinking blocks
// (their signatures are provider-verified and cannot survive a round-trip),
// top_k, and Anthropic request metadata.

import type {
    AnthropicContentBlock,
    AnthropicMessagesRequest,
} from "@shared/schemas/anthropic.ts";
import {
    type CreateChatCompletionRequest,
    CreateChatCompletionRequestSchema,
    type MessageContentPart,
} from "@shared/schemas/openai.ts";

type ContentBlock = AnthropicContentBlock;
type ChatContentPart = MessageContentPart;
type ChatRequestMessage = CreateChatCompletionRequest["messages"][number];

export class UnsupportedContentError extends Error {
    override readonly name = "UnsupportedContentError";
}

function cacheControl(block: unknown): Record<string, unknown> | undefined {
    const marker = (block as { cache_control?: unknown } | undefined)
        ?.cache_control;
    return marker && typeof marker === "object"
        ? { cache_control: marker }
        : undefined;
}

function textPart(block: {
    type?: unknown;
    text?: unknown;
    cache_control?: unknown;
}): ChatContentPart {
    if (typeof block.text !== "string") {
        throw new UnsupportedContentError(
            "text content block is missing a string 'text' field",
        );
    }
    return {
        type: "text",
        text: block.text,
        ...cacheControl(block),
    } as ChatContentPart;
}

function imagePart(block: {
    type?: unknown;
    source?: unknown;
}): ChatContentPart {
    const source = block.source as
        | {
              type?: unknown;
              media_type?: unknown;
              data?: unknown;
              url?: unknown;
          }
        | undefined;
    if (!source) {
        throw new UnsupportedContentError(
            "image content block is missing a 'source' field",
        );
    }
    if (
        source.type === "base64" &&
        typeof source.media_type === "string" &&
        typeof source.data === "string"
    ) {
        return {
            type: "image_url",
            image_url: {
                url: `data:${source.media_type};base64,${source.data}`,
            },
        } as ChatContentPart;
    }
    if (source.type === "url" && typeof source.url === "string") {
        return {
            type: "image_url",
            image_url: { url: source.url },
        } as ChatContentPart;
    }
    throw new UnsupportedContentError(
        "image source must be a base64 or url source",
    );
}

function documentPart(block: {
    type?: unknown;
    source?: unknown;
}): ChatContentPart {
    const source = block.source as
        | {
              type?: unknown;
              media_type?: unknown;
              data?: unknown;
              url?: unknown;
          }
        | undefined;
    if (!source) {
        throw new UnsupportedContentError(
            "document content block is missing a 'source' field",
        );
    }
    if (
        source.type === "base64" &&
        typeof source.media_type === "string" &&
        typeof source.data === "string"
    ) {
        return {
            type: "file",
            file: {
                file_data: `data:${source.media_type};base64,${source.data}`,
                file_name: "document",
                mime_type: source.media_type,
            },
        } as ChatContentPart;
    }
    if (source.type === "url" && typeof source.url === "string") {
        return {
            type: "file",
            file: { file_url: source.url, file_name: "document" },
        } as ChatContentPart;
    }
    throw new UnsupportedContentError(
        "document source must be a base64 or url source",
    );
}

function toolResultContent(content: unknown): string | ChatContentPart[] {
    if (typeof content === "string") return content;
    if (content === undefined || content === null) return "";
    if (!Array.isArray(content)) {
        throw new UnsupportedContentError(
            "tool_result content must be a string or an array of content blocks",
        );
    }
    return content.map((block) => {
        const typed = block as { type?: unknown };
        if (typed.type === "text") return textPart(block);
        if (typed.type === "image") return imagePart(block);
        throw new UnsupportedContentError(
            `tool_result content blocks of type '${String(typed.type)}' are not supported`,
        );
    });
}

/**
 * A user turn maps to Chat `tool` messages for its tool_result blocks (they
 * must directly follow the assistant tool_use turn) followed by one user
 * message holding the remaining parts.
 */
function userMessagesFromBlocks(blocks: ContentBlock[]): ChatRequestMessage[] {
    const toolMessages: ChatRequestMessage[] = [];
    const parts: ChatContentPart[] = [];

    for (const block of blocks) {
        const typed = block as { type?: unknown };
        if (typed.type === "text") {
            parts.push(textPart(block));
        } else if (typed.type === "image") {
            parts.push(imagePart(block));
        } else if (typed.type === "document") {
            parts.push(documentPart(block));
        } else if (typed.type === "tool_result") {
            const toolResult = block as {
                tool_use_id?: unknown;
                content?: unknown;
            };
            if (typeof toolResult.tool_use_id !== "string") {
                throw new UnsupportedContentError(
                    "tool_result block is missing a string 'tool_use_id' field",
                );
            }
            toolMessages.push({
                role: "tool",
                tool_call_id: toolResult.tool_use_id,
                content: toolResultContent(toolResult.content),
                ...cacheControl(block),
            } as ChatRequestMessage);
        } else {
            throw new UnsupportedContentError(
                `content block type '${String(typed.type)}' is not supported in user messages`,
            );
        }
    }

    const messages: ChatRequestMessage[] = [...toolMessages];
    if (parts.length > 0) {
        messages.push({ role: "user", content: parts } as ChatRequestMessage);
    }
    // A user turn that carried only tool results is fully expressed by the
    // tool messages above.
    return messages;
}

/** Assistant thinking history cannot be replayed through a Chat provider. */
function assistantMessageFromBlocks(
    blocks: ContentBlock[],
): ChatRequestMessage[] {
    const texts: string[] = [];
    const toolCalls: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
    }[] = [];

    for (const block of blocks) {
        const typed = block as {
            type?: unknown;
            text?: unknown;
            id?: unknown;
            name?: unknown;
            input?: unknown;
        };
        if (typed.type === "text" && typeof typed.text === "string") {
            texts.push(typed.text);
        } else if (typed.type === "tool_use") {
            if (
                typeof typed.id !== "string" ||
                typeof typed.name !== "string"
            ) {
                throw new UnsupportedContentError(
                    "tool_use block is missing 'id' or 'name'",
                );
            }
            toolCalls.push({
                id: typed.id,
                type: "function",
                function: {
                    name: typed.name,
                    arguments: JSON.stringify(typed.input ?? {}),
                },
            });
        } else if (
            typed.type === "thinking" ||
            typed.type === "redacted_thinking" ||
            typed.type === "server_tool_use" ||
            typed.type === "web_search_tool_result" ||
            typed.type === "code_execution_tool_result"
        ) {
            // Reasoning history and managed-tool transcripts are not replayable
            // on a Chat provider; every Messages↔Chat gateway drops them.
        } else {
            throw new UnsupportedContentError(
                `content block type '${String(typed.type)}' is not supported in assistant messages`,
            );
        }
    }

    return [
        {
            role: "assistant",
            ...(texts.length > 0 ? { content: texts.join("\n") } : {}),
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        } as ChatRequestMessage,
    ];
}

function systemMessages(
    system: AnthropicMessagesRequest["system"],
): ChatRequestMessage[] {
    if (typeof system === "string") {
        return [{ role: "system", content: system }];
    }
    if (!Array.isArray(system) || system.length === 0) return [];
    return [
        {
            role: "system",
            content: system.map((block) => textPart(block)),
        } as ChatRequestMessage,
    ];
}

function reasoningEffort(
    thinking: AnthropicMessagesRequest["thinking"],
): "low" | "medium" | "high" | undefined {
    if (!thinking || thinking.type !== "enabled") return undefined;
    const budget = thinking.budget_tokens;
    if (budget === undefined) return "medium";
    if (budget >= 8192) return "high";
    if (budget >= 2048) return "medium";
    return "low";
}

function toolChoice(
    choice: AnthropicMessagesRequest["tool_choice"],
): CreateChatCompletionRequest["tool_choice"] {
    if (!choice) return undefined;
    if (choice.type === "auto") return "auto";
    if (choice.type === "any") return "required";
    if (choice.type === "none") return "none";
    return { type: "function", function: { name: choice.name } };
}

/**
 * Translates an Anthropic Messages request into the Chat Completions request
 * the generation pipeline already validates, sanitizes, and bills.
 */
export function anthropicToChatRequest(
    request: AnthropicMessagesRequest,
    resolvedModel: string,
): CreateChatCompletionRequest {
    const messages: ChatRequestMessage[] = [...systemMessages(request.system)];

    for (const message of request.messages) {
        if (typeof message.content === "string") {
            messages.push({
                role: message.role,
                content: message.content,
            } as ChatRequestMessage);
            continue;
        }
        if (message.role === "assistant") {
            messages.push(...assistantMessageFromBlocks(message.content));
        } else {
            messages.push(...userMessagesFromBlocks(message.content));
        }
    }

    const effort = reasoningEffort(request.thinking);
    const choice = toolChoice(request.tool_choice);

    // Parse through the Chat Completions schema exactly like a direct Chat
    // request body: defaults are applied and provider-level validation runs
    // once, here, instead of inventing Chat fields by hand.
    return CreateChatCompletionRequestSchema.parse({
        model: resolvedModel,
        messages,
        max_tokens: request.max_tokens,
        ...(request.stream !== undefined && { stream: request.stream }),
        ...(request.temperature !== undefined && {
            temperature: request.temperature,
        }),
        ...(request.top_p !== undefined && { top_p: request.top_p }),
        ...(request.stop_sequences && { stop: request.stop_sequences }),
        ...(request.tools && {
            tools: request.tools.map((tool) => ({
                type: "function" as const,
                function: {
                    name: tool.name,
                    ...(tool.description !== undefined && {
                        description: tool.description,
                    }),
                    parameters: tool.input_schema,
                },
            })),
        }),
        ...(choice !== undefined && { tool_choice: choice }),
        ...(effort !== undefined && { reasoning_effort: effort }),
    });
}

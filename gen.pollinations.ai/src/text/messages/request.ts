import type {
    ContentBlock,
    CreateMessageRequest,
} from "@shared/schemas/anthropic.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import { AnthropicApiError } from "./errors.js";

type ChatMessage = CreateChatCompletionRequest["messages"][number];

function textOfBlocks(blocks: ContentBlock[]): string {
    return blocks
        .filter(
            (block): block is Extract<ContentBlock, { type: "text" }> =>
                block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
}

function toolResultBlocksToParts(
    blocks: Extract<ContentBlock, { type: "tool_result" }>[],
): ChatMessage[] {
    return blocks.map((block) => {
        const text =
            typeof block.content === "string"
                ? block.content
                : textOfBlocks(block.content);
        return {
            role: "tool" as const,
            content: text,
            tool_call_id: block.tool_use_id,
        };
    });
}

function imageToContentPart(
    block: Extract<ContentBlock, { type: "image" }>,
): Record<string, unknown> {
    if (block.source.type === "url") {
        return { type: "image_url", image_url: { url: block.source.url } };
    }
    return {
        type: "image_url",
        image_url: {
            url: `data:${block.source.media_type};base64,${block.source.data}`,
        },
    };
}

/**
 * Translate an Anthropic Messages request into a Chat Completions request.
 * Returns the request body plus a flag whether streaming was requested.
 */
export function messagesToChatRequest(
    request: CreateMessageRequest,
): CreateChatCompletionRequest {
    const chatMessages: ChatMessage[] = [];

    if (request.system !== undefined) {
        const text =
            typeof request.system === "string"
                ? request.system
                : textOfBlocks(request.system);
        if (text) chatMessages.push({ role: "system", content: text });
    }

    for (const message of request.messages) {
        const content = message.content;
        if (typeof content === "string") {
            chatMessages.push({ role: message.role, content });
            continue;
        }
        const texts: string[] = [];
        const images: Record<string, unknown>[] = [];
        const toolUse: Record<string, unknown>[] = [];
        const toolResults: Extract<ContentBlock, { type: "tool_result" }>[] =
            [];
        const thinking: string[] = [];
        for (const block of content) {
            if (block.type === "text") texts.push(block.text);
            else if (block.type === "image")
                images.push(imageToContentPart(block));
            else if (block.type === "tool_use") {
                toolUse.push({
                    id: block.id,
                    type: "function",
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input ?? {}),
                    },
                });
            } else if (block.type === "tool_result") toolResults.push(block);
            else if (block.type === "thinking") thinking.push(block.thinking);
            // redacted_thinking has no translatable content; skip.
        }
        if (toolResults.length > 0) {
            chatMessages.push(...toolResultBlocksToParts(toolResults));
            if (texts.length > 0 || images.length > 0) {
                const parts: Record<string, unknown>[] = [];
                if (texts.length > 0) {
                    parts.push({ type: "text", text: texts.join("\n") });
                }
                parts.push(...images);
                chatMessages.push({
                    role: message.role,
                    content: parts,
                } as ChatMessage);
            }
            continue;
        }
        if (toolUse.length > 0) {
            chatMessages.push({
                role: "assistant",
                content: texts.join("\n") || null,
                ...(thinking.length > 0
                    ? { reasoning_content: thinking.join("\n") }
                    : {}),
                tool_calls: toolUse,
            } as ChatMessage);
            continue;
        }
        if (images.length > 0) {
            const parts: Record<string, unknown>[] = [];
            if (texts.length > 0) {
                parts.push({ type: "text", text: texts.join("\n") });
            }
            parts.push(...images);
            chatMessages.push({
                role: message.role,
                content: parts,
            } as ChatMessage);
            continue;
        }
        chatMessages.push({
            role: message.role,
            content: texts.join("\n"),
        } as ChatMessage);
    }

    const chatRequest: CreateChatCompletionRequest = {
        messages: chatMessages,
        model: request.model,
        max_tokens: request.max_tokens,
        stream: request.stream ?? false,
        stream_options: request.stream ? { include_usage: true } : undefined,
    };
    if (request.temperature !== undefined && request.temperature !== null) {
        chatRequest.temperature = request.temperature;
    }
    if (request.top_p !== undefined && request.top_p !== null) {
        chatRequest.top_p = request.top_p;
    }
    if (request.stop_sequences && request.stop_sequences.length > 0) {
        chatRequest.stop = request.stop_sequences;
    }
    if (request.tools && request.tools.length > 0) {
        chatRequest.tools = request.tools.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                ...(tool.description ? { description: tool.description } : {}),
                parameters: tool.input_schema,
            },
        }));
    }
    if (request.tool_choice) {
        const choice = request.tool_choice;
        if (choice.type === "auto") chatRequest.tool_choice = "auto";
        else if (choice.type === "any") chatRequest.tool_choice = "required";
        else if (choice.type === "none") chatRequest.tool_choice = "none";
        else
            chatRequest.tool_choice = {
                type: "function",
                function: { name: choice.name },
            };
    }
    if (request.thinking?.type === "enabled") {
        chatRequest.reasoning_effort = "high";
    }
    if (request.metadata?.user_id) chatRequest.user = request.metadata.user_id;
    return chatRequest;
}

export function assertMaxTokens(request: CreateMessageRequest): void {
    if (!Number.isInteger(request.max_tokens) || request.max_tokens <= 0) {
        throw new AnthropicApiError(
            400,
            "max_tokens: must be a positive integer",
        );
    }
}

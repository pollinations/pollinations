import { UpstreamError } from "@shared/error.ts";
import type { AnthropicMessageRequest } from "@shared/schemas/anthropic.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";

type JsonObject = Record<string, unknown>;
type ChatRequest = CreateChatCompletionRequest & Record<string, unknown>;

function invalidRequest(message: string): never {
    throw new UpstreamError(400, { message });
}

function asObject(value: unknown): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalidRequest("Expected an object");
    }
    return value as JsonObject;
}

function cacheControl(block: JsonObject): JsonObject {
    const value = block.cache_control;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    if ((value as JsonObject).type !== "ephemeral") return {};
    return { cache_control: { type: "ephemeral" } };
}

function imagePart(block: JsonObject): JsonObject {
    const source = asObject(block.source);
    if (source.type === "base64") {
        if (
            typeof source.media_type !== "string" ||
            typeof source.data !== "string"
        ) {
            invalidRequest("Anthropic base64 image source is invalid");
        }
        return {
            type: "image_url",
            image_url: {
                url: `data:${source.media_type};base64,${source.data}`,
            },
            ...cacheControl(block),
        };
    }
    if (source.type === "url" && typeof source.url === "string") {
        return {
            type: "image_url",
            image_url: { url: source.url },
            ...cacheControl(block),
        };
    }
    return invalidRequest("Unsupported Anthropic image source");
}

function inputContentPart(block: JsonObject): JsonObject {
    if (block.type === "text" && typeof block.text === "string") {
        return {
            type: "text",
            text: block.text,
            ...cacheControl(block),
        };
    }
    if (block.type === "image") {
        return imagePart(block);
    }
    return invalidRequest(
        `Unsupported Anthropic input content block: ${String(block.type)}`,
    );
}

function toolResultContent(block: JsonObject): string | JsonObject[] {
    const content = block.content;
    if (content === undefined) return "";
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) {
        invalidRequest(
            "Anthropic tool_result content must be text or an array",
        );
    }
    return content.map((raw) => inputContentPart(asObject(raw)));
}

function userMessages(content: unknown): JsonObject[] {
    if (typeof content === "string") {
        return [{ role: "user", content }];
    }
    if (!Array.isArray(content)) {
        invalidRequest(
            "Anthropic user message content must be text or an array",
        );
    }

    const result: JsonObject[] = [];
    let pending: JsonObject[] = [];
    const flush = () => {
        if (!pending.length) return;
        result.push({ role: "user", content: pending });
        pending = [];
    };

    for (const raw of content) {
        const block = asObject(raw);
        if (block.type === "tool_result") {
            flush();
            if (typeof block.tool_use_id !== "string") {
                invalidRequest("Anthropic tool_result requires tool_use_id");
            }
            result.push({
                role: "tool",
                tool_call_id: block.tool_use_id,
                content: toolResultContent(block),
                ...cacheControl(block),
            });
            continue;
        }
        pending.push(inputContentPart(block));
    }
    flush();
    return result;
}

function assistantMessage(
    content: unknown,
    preserveThinkingBlocks: boolean,
): JsonObject {
    if (typeof content === "string") {
        return { role: "assistant", content };
    }
    if (!Array.isArray(content)) {
        invalidRequest(
            "Anthropic assistant message content must be text or an array",
        );
    }

    const contentParts: JsonObject[] = [];
    const toolCalls: JsonObject[] = [];
    const reasoning: string[] = [];
    for (const raw of content) {
        const block = asObject(raw);
        if (block.type === "text" && typeof block.text === "string") {
            contentParts.push({
                type: "text",
                text: block.text,
                ...cacheControl(block),
            });
            continue;
        }
        if (
            block.type === "tool_use" &&
            typeof block.id === "string" &&
            typeof block.name === "string"
        ) {
            toolCalls.push({
                id: block.id,
                type: "function",
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input ?? {}),
                },
            });
            continue;
        }
        if (block.type === "thinking" && typeof block.thinking === "string") {
            const signature =
                typeof block.signature === "string" ? block.signature : "";
            if (
                preserveThinkingBlocks &&
                signature &&
                signature !== "pollinations"
            ) {
                contentParts.push({
                    type: "thinking",
                    thinking: block.thinking,
                    signature,
                });
            } else {
                reasoning.push(block.thinking);
            }
            continue;
        }
        if (
            block.type === "redacted_thinking" &&
            typeof block.data === "string"
        ) {
            if (preserveThinkingBlocks) {
                contentParts.push({
                    type: "redacted_thinking",
                    data: block.data,
                });
            }
            continue;
        }
        invalidRequest(
            `Unsupported Anthropic assistant content block: ${String(block.type)}`,
        );
    }

    return {
        role: "assistant",
        content: contentParts.length
            ? contentParts
            : toolCalls.length
              ? null
              : "",
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        ...(reasoning.length
            ? { reasoning_content: reasoning.join("\n") }
            : {}),
    };
}

function systemMessageContent(content: unknown): JsonObject {
    if (typeof content === "string") {
        return { role: "system", content };
    }
    if (!Array.isArray(content)) {
        invalidRequest(
            "Anthropic system message content must be text or an array",
        );
    }
    const parts = content.map((raw) => {
        const block = asObject(raw);
        if (block.type !== "text" || typeof block.text !== "string") {
            invalidRequest(
                "Only text blocks are supported in Anthropic system messages",
            );
        }
        return {
            type: "text",
            text: block.text,
            ...cacheControl(block),
        };
    });
    return { role: "system", content: parts };
}

function systemMessages(system: unknown): JsonObject[] {
    if (system === undefined) return [];
    if (typeof system === "string") {
        return system ? [{ role: "system", content: system }] : [];
    }
    if (!Array.isArray(system)) {
        invalidRequest("Anthropic system prompt must be text or an array");
    }
    const content = system.map((raw) => {
        const block = asObject(raw);
        if (block.type !== "text" || typeof block.text !== "string") {
            invalidRequest(
                "Only text blocks are supported in Anthropic system",
            );
        }
        return {
            type: "text",
            text: block.text,
            ...cacheControl(block),
        };
    });
    return content.length ? [{ role: "system", content }] : [];
}

function tools(toolsValue: unknown): JsonObject[] | undefined {
    if (!Array.isArray(toolsValue) || !toolsValue.length) return undefined;
    return toolsValue.map((raw) => {
        const tool = asObject(raw);
        if (
            typeof tool.type === "string" &&
            tool.type !== "custom" &&
            tool.type !== "function"
        ) {
            invalidRequest(
                `Anthropic server tool ${tool.type} is not supported on /v1/messages`,
            );
        }
        if (typeof tool.name !== "string") {
            invalidRequest("Anthropic tool requires a name");
        }
        return {
            type: "function",
            function: {
                name: tool.name,
                ...(typeof tool.description === "string"
                    ? { description: tool.description }
                    : {}),
                parameters:
                    tool.input_schema &&
                    typeof tool.input_schema === "object" &&
                    !Array.isArray(tool.input_schema)
                        ? tool.input_schema
                        : {},
                ...(tool.strict === true ? { strict: true } : {}),
            },
        };
    });
}

function toolChoice(value: unknown): {
    choice?: unknown;
    parallel?: boolean;
} {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const choice = value as JsonObject;
    const parallel =
        typeof choice.disable_parallel_tool_use === "boolean"
            ? !choice.disable_parallel_tool_use
            : undefined;
    if (choice.type === "auto") return { choice: "auto", parallel };
    if (choice.type === "any") return { choice: "required", parallel };
    if (choice.type === "none") return { choice: "none", parallel };
    if (choice.type === "tool" && typeof choice.name === "string") {
        return {
            choice: {
                type: "function",
                function: { name: choice.name },
            },
            parallel,
        };
    }
    return invalidRequest("Unsupported Anthropic tool_choice");
}

function reasoningEffort(request: AnthropicMessageRequest): string | undefined {
    if (request.thinking?.type === "disabled") return "none";
    if (request.output_config?.effort) return request.output_config.effort;
    if (!request.thinking) return undefined;
    const budget = request.thinking.budget_tokens;
    if (typeof budget !== "number") return "medium";
    if (budget >= 8192) return "xhigh";
    if (budget >= 4096) return "high";
    if (budget >= 2048) return "medium";
    return "low";
}

function responseFormat(request: AnthropicMessageRequest): unknown {
    const format = request.output_config?.format;
    if (!format) return undefined;
    return {
        type: "json_schema",
        json_schema: {
            name: "anthropic_output",
            schema: format.schema,
            strict: true,
        },
    };
}

function metadata(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const entries = Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return entries.length ? Object.fromEntries(entries) : undefined;
}

export type AnthropicToChatOptions = {
    preserveThinkingBlocks?: boolean;
};

export function anthropicToChatRequest(
    request: AnthropicMessageRequest,
    options: AnthropicToChatOptions = {},
): ChatRequest {
    const messages: JsonObject[] = [
        ...systemMessages(request.system),
        ...request.messages.flatMap((message) => {
            if (message.role === "assistant") {
                return [
                    assistantMessage(
                        message.content,
                        options.preserveThinkingBlocks === true,
                    ),
                ];
            }
            if (message.role === "system") {
                return [systemMessageContent(message.content)];
            }
            return userMessages(message.content);
        }),
    ];
    const mappedTools = tools(request.tools);
    const mappedChoice = toolChoice(request.tool_choice);
    const effort = reasoningEffort(request);
    const format = responseFormat(request);
    const mappedMetadata = metadata(request.metadata);

    return {
        model: request.model,
        messages,
        max_tokens: request.max_tokens,
        stream: request.stream === true,
        ...(request.stream ? { stream_options: { include_usage: true } } : {}),
        ...(request.stop_sequences?.length
            ? { stop: request.stop_sequences }
            : {}),
        ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
        ...(request.top_p !== undefined ? { top_p: request.top_p } : {}),
        ...(request.top_k !== undefined ? { top_k: request.top_k } : {}),
        ...(mappedTools ? { tools: mappedTools } : {}),
        ...(mappedChoice.choice !== undefined
            ? { tool_choice: mappedChoice.choice }
            : {}),
        ...(mappedChoice.parallel !== undefined
            ? { parallel_tool_calls: mappedChoice.parallel }
            : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(format ? { response_format: format } : {}),
        ...(mappedMetadata ? { metadata: mappedMetadata } : {}),
    } as ChatRequest;
}

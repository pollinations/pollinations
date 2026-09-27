// Translate an Anthropic Messages request into the Chat Completions shape
// the existing text pipeline already serves (auth, balance, rate limits,
// model allowlists, caching, billing all apply unchanged).
import type {
    CreateChatCompletionRequest,
    MessageContentPart,
} from "@shared/schemas/openai.ts";
import type {
    CreateMessagesRequest,
    MessagesContentBlock,
} from "@shared/schemas/anthropic.ts";

type JsonRecord = Record<string, unknown>;
type ChatMessages = CreateChatCompletionRequest["messages"];
type ChatMessage = ChatMessages[number];

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
    return isRecord(value) ? value : {};
}

function cacheControlOf(block: unknown) {
    const cacheControl = asRecord(block).cache_control;
    return isRecord(cacheControl) && cacheControl.type === "ephemeral"
        ? { cache_control: { type: "ephemeral" as const } }
        : {};
}

function hasCacheControl(block: unknown): boolean {
    return "cache_control" in asRecord(block);
}

function textFromBlocks(blocks: MessagesContentBlock[]): string {
    return blocks
        .map((block) => asRecord(block))
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("");
}

function imagePartToOpenAI(block: MessagesContentBlock): MessageContentPart | undefined {
    const source = asRecord(block).source;
    if (!isRecord(source)) return undefined;
    if (source.type === "base64") {
        if (
            typeof source.media_type !== "string" ||
            typeof source.data !== "string"
        )
            return undefined;
        return {
            type: "image_url",
            image_url: {
                url: `data:${source.media_type};base64,${source.data}`,
            },
        };
    }
    if (source.type === "url" && typeof source.url === "string") {
        return { type: "image_url", image_url: { url: source.url } };
    }
    return undefined;
}

function documentText(block: MessagesContentBlock): string | undefined {
    const source = asRecord(block).source;
    if (!isRecord(source)) return undefined;
    // Plain-text documents carry their content inline.
    if (source.type === "text" && typeof source.data === "string")
        return source.data;
    if (typeof source.text === "string") return source.text;
    return undefined;
}

type TranslatedContent = {
    content: string | MessageContentPart[];
    toolCalls: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
    }[];
};

/** Content blocks of one user/assistant/system message become chat parts. */
function translateContentBlocks(
    blocks: MessagesContentBlock[],
): TranslatedContent {
    const parts: MessageContentPart[] = [];
    const toolCalls: TranslatedContent["toolCalls"] = [];
    let explicitParts = false;

    for (const block of blocks) {
        const record = asRecord(block);
        switch (record.type) {
            case "text":
                if (typeof record.text === "string") {
                    parts.push({
                        type: "text",
                        text: record.text,
                        ...cacheControlOf(block),
                    });
                    explicitParts = explicitParts || hasCacheControl(block);
                }
                break;
            case "image": {
                const part = imagePartToOpenAI(block);
                if (part) parts.push(part);
                else explicitParts = true;
                break;
            }
            case "tool_use":
                if (typeof record.id === "string") {
                    toolCalls.push({
                        id: record.id,
                        type: "function",
                        function: {
                            name:
                                typeof record.name === "string"
                                    ? record.name
                                    : "tool",
                            arguments: JSON.stringify(record.input ?? {}),
                        },
                    });
                }
                break;
            case "tool_result":
                // Tool results become their own `tool` message below; a
                // placeholder here keeps block order visible to the model.
                break;
            case "thinking":
            case "redacted_thinking":
                // Prior-turn reasoning is not replayed: providers accept
                // reasoning only on fresh assistant turns.
                break;
            case "document": {
                const text = documentText(block);
                if (text !== undefined) parts.push({ type: "text", text });
                break;
            }
            default: {
                // Future block types with inline text survive; anything else
                // is dropped rather than failing the request.
                if (typeof record.text === "string") {
                    parts.push({ type: "text", text: record.text });
                }
                break;
            }
        }
    }

    if (
        !explicitParts &&
        toolCalls.length === 0 &&
        parts.every((part) => part.type === "text" && !("cache_control" in part))
    ) {
        return {
            content: parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join(""),
            toolCalls,
        };
    }
    return { content: parts.length ? parts : "", toolCalls };
}

function toolResultToToolMessage(block: MessagesContentBlock): ChatMessage {
    const record = asRecord(block);
    const content = record.content;
    let text: string | MessageContentPart[];
    if (content === undefined) {
        text = "";
    } else if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        const parts: MessageContentPart[] = [];
        for (const item of content) {
            const itemRecord = asRecord(item);
            if (
                itemRecord.type === "text" &&
                typeof itemRecord.text === "string"
            ) {
                parts.push({
                    type: "text",
                    text: itemRecord.text,
                    ...cacheControlOf(item),
                });
            } else if (itemRecord.type === "image") {
                const part = imagePartToOpenAI(item as MessagesContentBlock);
                if (part) parts.push(part);
            }
        }
        text =
            parts.length &&
            parts.every(
                (part) => part.type === "text" && !("cache_control" in part),
            )
                ? parts
                      .map((part) => (part.type === "text" ? part.text : ""))
                      .join("")
                : parts;
    } else {
        text = "";
    }
    return {
        role: "tool",
        content: text,
        tool_call_id: typeof record.tool_use_id === "string" ? record.tool_use_id : "",
    } as ChatMessage;
}

/** Anthropic roles map 1:1 except `system`, which becomes a system message. */
function translateMessage(
    message: CreateMessagesRequest["messages"][number],
): ChatMessage[] {
    if (typeof message.content === "string") {
        return [{ role: message.role, content: message.content } as ChatMessage];
    }
    const { content, toolCalls } = translateContentBlocks(message.content);
    const translated: ChatMessage[] = [];
    if (message.role === "assistant") {
        if (toolCalls.length || content !== "") {
            translated.push({
                role: "assistant",
                content: content === "" ? null : content,
                ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
            } as ChatMessage);
        }
    } else {
        const hasToolResult = message.content.some(
            (block) => asRecord(block).type === "tool_result",
        );
        const isEmptyContent =
            content === "" ||
            (Array.isArray(content) && content.length === 0);
        // A message carrying only tool_result blocks becomes tool message(s);
        // emitting an empty user placeholder breaks tool_call_id pairing.
        if (!isEmptyContent || !hasToolResult) {
            translated.push({ role: message.role, content } as ChatMessage);
        }
    }
    for (const block of message.content) {
        if (asRecord(block).type === "tool_result") {
            translated.push(toolResultToToolMessage(block));
        }
    }
    return translated;
}

function translateSystem(
    system: CreateMessagesRequest["system"],
): ChatMessage | undefined {
    if (system === undefined) return undefined;
    if (typeof system === "string") {
        return system ? ({ role: "system", content: system } as ChatMessage) : undefined;
    }
    const blocks = system
        .map((block) => asRecord(block))
        .filter((block) => block.type === "text" && typeof block.text === "string");
    if (!blocks.length) return undefined;
    if (!blocks.some((block) => hasCacheControl(block))) {
        return {
            role: "system",
            content: blocks.map((block) => block.text as string).join(""),
        } as ChatMessage;
    }
    return {
        role: "system",
        content: blocks.map((block) => ({
            type: "text" as const,
            text: block.text as string,
            ...cacheControlOf(block),
        })),
    } as ChatMessage;
}

function translateTools(tools: CreateMessagesRequest["tools"]) {
    if (!tools?.length) return {};
    return {
        tools: tools.map((tool) => ({
            type: "function" as const,
            function: {
                ...(tool.description !== undefined
                    ? { description: tool.description }
                    : {}),
                name: tool.name,
                ...(tool.input_schema !== undefined
                    ? { parameters: tool.input_schema }
                    : {}),
            },
        })),
    };
}

function translateToolChoice(toolChoice: CreateMessagesRequest["tool_choice"]) {
    if (!toolChoice) return {};
    switch (toolChoice.type) {
        case "auto":
            return { tool_choice: "auto" as const };
        case "any":
            return { tool_choice: "required" as const };
        case "none":
            return { tool_choice: "none" as const };
        case "tool":
            return toolChoice.name
                ? {
                      tool_choice: {
                          type: "function" as const,
                          function: { name: toolChoice.name },
                      },
                  }
                : { tool_choice: "auto" as const };
        default:
            return { tool_choice: "auto" as const };
    }
}

const REASONING_EFFORTS = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

function isReasoningEffort(value: unknown): value is ReasoningEffort {
    return (
        typeof value === "string" &&
        (REASONING_EFFORTS as readonly string[]).includes(value)
    );
}

function translateThinking(
    thinking: CreateMessagesRequest["thinking"],
    outputConfig: unknown,
): { reasoning_effort?: ReasoningEffort } {
    if (!thinking || thinking.type === "disabled") return {};
    // Claude Code may request an explicit effort via output_config; honor it
    // when it names a supported reasoning depth.
    const effort = asRecord(outputConfig).effort;
    if (isReasoningEffort(effort)) return { reasoning_effort: effort };
    // `enabled` is the standard mode; anything else (e.g. `adaptive`) asks
    // for deeper reasoning than the default.
    return {
        reasoning_effort: thinking.type === "enabled" ? "medium" : "high",
    };
}

// Models whose providers reject prompt-caching directives (GLM, DeepSeek,
// community models, ...) fail the request when cache_control is present.
// Only providers with native prompt caching keep it.
const CACHE_CONTROL_MODELS = /^(anthropic|google|amazon)\//;

function stripCacheControl(messages: ChatMessages): void {
    for (const message of messages) {
        const content = asRecord(message).content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            if (isRecord(part)) delete part.cache_control;
        }
    }
}

/**
 * Translate a validated Messages request to Chat Completions. Unknown
 * top-level fields (output_config, service_tier, container, ...) are dropped
 * here after passing schema validation, so they never fail the request.
 */
export function translateMessagesRequest(
    body: CreateMessagesRequest,
): CreateChatCompletionRequest {
    const system = translateSystem(body.system);
    const messages: ChatMessage[] = [
        ...(system ? [system] : []),
        ...body.messages.flatMap(translateMessage),
    ];
    if (!CACHE_CONTROL_MODELS.test(body.model)) stripCacheControl(messages);
    return {
        messages,
        model: body.model,
        max_tokens: body.max_tokens,
        stream: body.stream ?? false,
        // Defaults the chat schema applies; kept explicit for the output type.
        logit_bias: null,
        safe: undefined,
        ...(body.stream ? { stream_options: { include_usage: true } } : {}),
        ...(body.temperature !== undefined
            ? { temperature: body.temperature }
            : {}),
        ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
        // top_k has no chat-schema slot but the gateway transforms read it.
        ...(body.top_k !== undefined
            ? { top_k: body.top_k } as { top_k: number }
            : {}),
        ...(body.stop_sequences !== undefined
            ? { stop: body.stop_sequences }
            : {}),
        ...(body.metadata?.user_id !== undefined
            ? { user: body.metadata.user_id }
            : {}),
        ...translateTools(body.tools),
        ...translateToolChoice(body.tool_choice),
        ...translateThinking(
            body.thinking,
            (body as unknown as JsonRecord).output_config,
        ),
    };
}

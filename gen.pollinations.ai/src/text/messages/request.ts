import type {
    CreateMessageRequest,
    InputMessage,
} from "@shared/schemas/anthropic.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { ChatMessage } from "../types.js";

type JsonObject = Record<string, unknown>;

// The zod-inferred content-block union includes a passthrough fallback for
// extension block types, which turns off TypeScript's discriminated-union
// narrowing on `type`. Content blocks are read as plain JSON here instead.
type Block = JsonObject & { type: string };

// Mirrors the budget_tokens Bedrock's Claude thinking transform requests per
// reasoning_effort, so the same effort level produces a comparable thinking
// depth regardless of which model actually serves the request.
const BUDGET_TO_EFFORT: Array<[number, string]> = [
    [1024, "low"],
    [2048, "medium"],
    [4096, "high"],
    [8192, "xhigh"],
];

function reasoningEffortFromBudget(budgetTokens: number): string {
    for (const [budget, effort] of BUDGET_TO_EFFORT) {
        if (budgetTokens <= budget) return effort;
    }
    return "xhigh";
}

function imageContentPart(block: Block) {
    const source = block.source as JsonObject;
    const url =
        source.type === "base64"
            ? `data:${source.media_type};base64,${source.data}`
            : (source.url as string);
    return { type: "image_url" as const, image_url: { url } };
}

function textPart(text: string, cache_control?: unknown) {
    return cache_control
        ? { type: "text" as const, text, cache_control }
        : { type: "text" as const, text };
}

/** Anthropic tool results live inline in a user message; Chat sends them as their own `tool` messages. */
function userMessageItems(message: InputMessage): ChatMessage[] {
    if (typeof message.content === "string") {
        return message.content
            ? [{ role: "user", content: message.content }]
            : [];
    }

    const toolMessages: ChatMessage[] = [];
    const otherParts: JsonObject[] = [];
    for (const raw of message.content) {
        const block = raw as Block;
        if (block.type === "tool_result") {
            const content = block.content;
            const text =
                typeof content === "string"
                    ? content
                    : Array.isArray(content)
                      ? content
                            .filter((part: Block) => part.type === "text")
                            .map((part: Block) => part.text as string)
                            .join("")
                      : "";
            toolMessages.push({
                role: "tool",
                tool_call_id: block.tool_use_id as string,
                content: block.is_error ? `Error: ${text}` : text,
            });
        } else if (block.type === "text") {
            otherParts.push(
                textPart(block.text as string, block.cache_control),
            );
        } else if (block.type === "image") {
            otherParts.push({
                ...imageContentPart(block),
                ...(block.cache_control
                    ? { cache_control: block.cache_control }
                    : {}),
            });
        }
        // Unrecognized block types (server tool results, etc.) carry no
        // translatable content and are dropped rather than rejected, so a
        // replayed conversation with an untranslatable block still proceeds.
    }

    return [
        ...toolMessages,
        ...(otherParts.length
            ? [{ role: "user", content: otherParts } as ChatMessage]
            : []),
    ];
}

function assistantMessageItem(message: InputMessage): ChatMessage | null {
    if (typeof message.content === "string") {
        return message.content
            ? { role: "assistant", content: message.content }
            : null;
    }

    const textParts: JsonObject[] = [];
    const toolCalls: JsonObject[] = [];
    for (const raw of message.content) {
        const block = raw as Block;
        if (block.type === "text") {
            textParts.push(textPart(block.text as string, block.cache_control));
        } else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id,
                type: "function",
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input ?? {}),
                },
            });
        }
        // Thinking/redacted_thinking blocks are the provider's own prior
        // reasoning. Providers regenerate reasoning per turn, and replaying a
        // foreign provider's thinking (or verifying Anthropic's signature)
        // has no equivalent here, so history replay drops these blocks.
    }

    if (!textParts.length && !toolCalls.length) return null;
    return {
        role: "assistant",
        ...(textParts.length ? { content: textParts } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
}

function messageItems(message: InputMessage): ChatMessage[] {
    if (message.role === "user") return userMessageItems(message);
    const item = assistantMessageItem(message);
    return item ? [item] : [];
}

function systemMessage(
    system: CreateMessageRequest["system"],
): ChatMessage | null {
    if (!system) return null;
    if (typeof system === "string") return { role: "system", content: system };
    const content = system.map((block) =>
        textPart(block.text, block.cache_control),
    );
    return content.length ? { role: "system", content } : null;
}

function tools(
    request: CreateMessageRequest,
): CreateChatCompletionRequest["tools"] {
    if (!request.tools?.length) return undefined;
    return request.tools.map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            parameters: tool.input_schema,
        },
    }));
}

function toolChoice(
    choice: CreateMessageRequest["tool_choice"],
): CreateChatCompletionRequest["tool_choice"] {
    if (!choice) return undefined;
    if (choice.type === "auto") return "auto";
    if (choice.type === "none") return "none";
    if (choice.type === "any") return "required";
    return { type: "function", function: { name: choice.name } };
}

function reasoningEffort(
    thinking: CreateMessageRequest["thinking"],
): string | undefined {
    if (!thinking) return undefined;
    if (thinking.type === "disabled") return "none";
    return reasoningEffortFromBudget(thinking.budget_tokens);
}

export function messagesToChatRequest(
    request: CreateMessageRequest,
    model: string,
): CreateChatCompletionRequest & Record<string, unknown> {
    const system = systemMessage(request.system);
    const messages = [
        ...(system ? [system] : []),
        ...request.messages.flatMap(messageItems),
    ];

    const effort = reasoningEffort(request.thinking);
    const parallelToolCalls = (
        request.tool_choice as
            | { disable_parallel_tool_use?: boolean }
            | undefined
    )?.disable_parallel_tool_use
        ? false
        : undefined;

    const body = {
        model,
        messages,
        max_tokens: request.max_tokens,
        stream: request.stream,
        ...(request.stop_sequences?.length
            ? { stop: request.stop_sequences }
            : {}),
        ...(request.temperature != null
            ? { temperature: request.temperature }
            : {}),
        ...(request.top_p != null ? { top_p: request.top_p } : {}),
        ...(tools(request) ? { tools: tools(request) } : {}),
        ...(request.tool_choice
            ? { tool_choice: toolChoice(request.tool_choice) }
            : {}),
        ...(parallelToolCalls !== undefined
            ? { parallel_tool_calls: parallelToolCalls }
            : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(request.metadata?.user_id
            ? { user: request.metadata.user_id }
            : {}),
    };
    return body as unknown as CreateChatCompletionRequest &
        Record<string, unknown>;
}

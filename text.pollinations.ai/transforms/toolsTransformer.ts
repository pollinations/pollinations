/**
 * Tool format translator for cross-provider compatibility.
 *
 * Problem: OpenAI, Gemini, and Claude all have different formats for function calling.
 * Solution: Accept OpenAI format as the standard, translate to/from other providers.
 *
 * Gemini uses: { tools: [{ functionDeclarations: [...] }] }
 * Claude uses: { tools: [{ name, input_schema }] }
 * OpenAI uses: { tools: [{ type: "function", function: {...} }] }
 */

import debug from "debug";

const log = debug("pollinations:tools-transform");

// -- Helpers --

function safeJsonParse(str: string | undefined, fallback: unknown = {}): unknown {
    if (!str) return fallback;
    try {
        return JSON.parse(str);
    } catch {
        log("Failed to parse JSON: %s", str?.slice(0, 100));
        return fallback;
    }
}

function generateCallId(): string {
    // crypto.randomUUID not available everywhere, fallback to timestamp + random
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return `call_${crypto.randomUUID()}`;
    }
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// -- Types --

interface OpenAITool {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

interface OpenAIToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

interface Message {
    role: string;
    content?: string | unknown[];
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
}

interface TransformOptions {
    tools?: unknown[];
    tool_choice?: unknown;
    model?: string;
    modelConfig?: { provider?: string };
    [key: string]: unknown;
}

type Provider = "gemini" | "claude" | "openai";

// -- Provider Detection --

function getProvider(options: TransformOptions): Provider {
    const provider = options.modelConfig?.provider;

    if (provider === "vertex-ai") return "gemini";

    // bedrock can be Claude or other models
    if (provider === "bedrock") {
        const model = (options.model || "") as string;
        if (model.includes("anthropic") || model.includes("claude")) {
            return "claude";
        }
    }

    return "openai";
}

// -- Gemini Conversion --

// Gemini built-in tools (code_execution, google_search, etc) should pass through
function isGeminiBuiltin(tool: unknown): boolean {
    if (!tool || typeof tool !== "object") return false;
    const t = tool as Record<string, unknown>;
    return "type" in t && ["code_execution", "google_search", "url_context"].includes(t.type as string);
}

function toGeminiTools(tools: OpenAITool[]) {
    const declarations: Array<{ name: string; description?: string; parameters?: unknown }> = [];
    const builtins: unknown[] = [];

    for (const tool of tools) {
        if (isGeminiBuiltin(tool)) {
            builtins.push(tool);
            continue;
        }
        if (tool.type === "function" && tool.function) {
            declarations.push({
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
            });
        }
    }

    const result = [...builtins];
    if (declarations.length > 0) {
        result.push({ functionDeclarations: declarations });
    }
    return result;
}

function fromGeminiFunctionCalls(calls: Array<{ name: string; args: unknown }>): OpenAIToolCall[] {
    return calls.map((call) => ({
        id: generateCallId(),
        type: "function" as const,
        function: {
            name: call.name,
            arguments: JSON.stringify(call.args || {}),
        },
    }));
}

function toGeminiFunctionCalls(calls: OpenAIToolCall[]) {
    return calls.map(c => ({
        name: c.function.name,
        args: safeJsonParse(c.function.arguments, {}),
    }));
}

function toGeminiToolChoice(choice: unknown) {
    if (!choice) return undefined;

    if (choice === "auto") return { functionCallingConfig: { mode: "AUTO" } };
    if (choice === "none") return { functionCallingConfig: { mode: "NONE" } };
    if (choice === "required") return { functionCallingConfig: { mode: "ANY" } };

    // Specific function requested
    if (typeof choice === "object" && choice !== null) {
        const c = choice as Record<string, unknown>;
        if (c.type === "function" && c.function) {
            const fn = c.function as Record<string, unknown>;
            return {
                functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fn.name] },
            };
        }
    }
    return undefined;
}

function convertMessagesForGemini(messages: Message[]): Message[] {
    return messages.map(msg => {
        const out = { ...msg } as Message & Record<string, unknown>;

        // Assistant with tool_calls -> add Gemini's functionCalls format
        if (msg.role === "assistant" && msg.tool_calls?.length) {
            out.functionCalls = toGeminiFunctionCalls(msg.tool_calls);
        }

        // Tool response -> Gemini uses "function" role
        if (msg.role === "tool" && msg.tool_call_id) {
            out.role = "function";
            out.name = msg.name;
        }

        return out;
    });
}

// -- Claude Conversion --

function toClaudeTools(tools: OpenAITool[]) {
    return tools
        .filter(t => t.type === "function" && t.function)
        .map(t => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters || { type: "object", properties: {} },
        }));
}

function fromClaudeToolUse(block: { id: string; name: string; input: unknown }): OpenAIToolCall {
    return {
        id: block.id,
        type: "function",
        function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
        },
    };
}

function toClaudeToolUse(call: OpenAIToolCall) {
    return {
        type: "tool_use",
        id: call.id || generateCallId(),
        name: call.function.name,
        input: safeJsonParse(call.function.arguments, {}),
    };
}

function toClaudeToolChoice(choice: unknown) {
    if (!choice) return undefined;

    if (choice === "auto") return { type: "auto" };
    if (choice === "none") return { type: "none" };
    if (choice === "required") return { type: "any" };

    if (typeof choice === "object" && choice !== null) {
        const c = choice as Record<string, unknown>;
        if (c.type === "function" && c.function) {
            return { type: "tool", name: (c.function as Record<string, unknown>).name };
        }
    }
    return undefined;
}

function convertMessagesForClaude(messages: Message[]): Message[] {
    const result: Message[] = [];

    for (const msg of messages) {
        // Assistant with tool_calls -> Claude content blocks
        if (msg.role === "assistant" && msg.tool_calls?.length) {
            const blocks: unknown[] = [];

            if (msg.content && typeof msg.content === "string" && msg.content.trim()) {
                blocks.push({ type: "text", text: msg.content });
            }
            for (const call of msg.tool_calls) {
                blocks.push(toClaudeToolUse(call));
            }

            result.push({ role: "assistant", content: blocks as unknown as string });
            continue;
        }

        // Tool response -> Claude tool_result in user message
        if (msg.role === "tool" && msg.tool_call_id) {
            const toolResult = {
                type: "tool_result",
                tool_use_id: msg.tool_call_id,
                content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            };

            // Merge consecutive tool results into one user message
            const last = result[result.length - 1];
            if (last?.role === "user" && Array.isArray(last.content)) {
                (last.content as unknown[]).push(toolResult);
            } else {
                result.push({ role: "user", content: [toolResult] as unknown as string });
            }
            continue;
        }

        result.push({ ...msg });
    }

    return result;
}

// -- Main Transform --

export function createToolsTransformer() {
    return (messages: Message[], options: TransformOptions) => {
        const provider = getProvider(options);
        log("Transforming for provider: %s", provider);

        // OpenAI-compatible? No transform needed
        if (provider === "openai") {
            return { messages, options };
        }

        // Check if there's anything to transform
        const hasTools = options.tools?.length;
        const hasToolCalls = messages.some(m => m.tool_calls || m.role === "tool");
        if (!hasTools && !hasToolCalls) {
            return { messages, options };
        }

        try {
            const opts = { ...options };
            let msgs = messages;

            if (provider === "gemini") {
                // Convert tools (skip if already Gemini format)
                if (hasTools) {
                    const first = options.tools![0] as Record<string, unknown>;
                    if (!("functionDeclarations" in first)) {
                        opts.tools = toGeminiTools(options.tools as OpenAITool[]);
                        log("Converted %d tools to Gemini format", options.tools!.length);
                    }
                }

                if (options.tool_choice) {
                    (opts as Record<string, unknown>).toolConfig = toGeminiToolChoice(options.tool_choice);
                    delete opts.tool_choice;
                }

                msgs = convertMessagesForGemini(messages);
            }

            if (provider === "claude") {
                // Convert tools (skip if already Claude format)
                if (hasTools) {
                    const first = options.tools![0] as Record<string, unknown>;
                    if (!("input_schema" in first)) {
                        opts.tools = toClaudeTools(options.tools as OpenAITool[]);
                        log("Converted %d tools to Claude format", options.tools!.length);
                    }
                }

                if (options.tool_choice) {
                    opts.tool_choice = toClaudeToolChoice(options.tool_choice);
                }

                msgs = convertMessagesForClaude(messages);
            }

            return { messages: msgs, options: opts };
        } catch (err) {
            log("Transform failed, passing through: %O", err);
            return { messages, options };
        }
    };
}

// -- Response Transform --

export function createToolsResponseTransformer(options: TransformOptions) {
    const provider = getProvider(options);

    return (response: Record<string, unknown>) => {
        if (provider === "openai") return response;

        try {
            const out = deepClone(response);
            const choices = out.choices as Array<Record<string, unknown>> | undefined;
            if (!choices?.length) return out;

            for (const choice of choices) {
                const message = choice.message as Record<string, unknown> | undefined;
                if (!message) continue;

                // Gemini: functionCalls -> tool_calls
                if (provider === "gemini") {
                    const fnCalls = message.functionCalls as Array<{ name: string; args: unknown }>;
                    if (fnCalls?.length) {
                        message.tool_calls = fromGeminiFunctionCalls(fnCalls);
                        delete message.functionCalls;
                        log("Converted %d Gemini function calls to OpenAI format", fnCalls.length);
                    }
                }

                // Claude: content blocks with tool_use -> tool_calls
                if (provider === "claude" && Array.isArray(message.content)) {
                    const blocks = message.content as Array<Record<string, unknown>>;
                    const toolBlocks = blocks.filter(b => b.type === "tool_use");

                    if (toolBlocks.length) {
                        message.tool_calls = toolBlocks.map(b =>
                            fromClaudeToolUse(b as { id: string; name: string; input: unknown })
                        );

                        const textBlocks = blocks.filter(b => b.type === "text");
                        message.content = textBlocks.length
                            ? textBlocks.map(b => b.text).join("")
                            : null;
                        log("Converted %d Claude tool_use blocks to OpenAI format", toolBlocks.length);
                    }
                }
            }

            return out;
        } catch (err) {
            log("Response transform failed, returning original: %O", err);
            return response;
        }
    };
}

export { getProvider as detectProvider, type Provider as ProviderType };

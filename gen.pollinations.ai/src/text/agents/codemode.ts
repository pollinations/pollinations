import { WorkerEntrypoint } from "cloudflare:workers";
import { DynamicWorkerExecutor, type ToolProvider } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { asSchema, jsonSchema, tool } from "ai";

const CODE_TOOL_DESCRIPTION = `Run JavaScript that calls your tools. Use it to chain tool calls, run independent calls in parallel with Promise.all, and return only what you need.

Available:
{{types}}

Write an async arrow function in plain JavaScript (no TypeScript) and return the result. A tool function returns the tool's structured content, or its text (parsed when it is JSON), and throws when the tool fails. console.log output is returned with the result. The code has no network access.

Example: async () => { const [a, b] = await Promise.all([server.search({ query: "a" }), server.search({ query: "b" })]); return { a, b }; }`;

// Follows @cloudflare/codemode's own (unexported) MCP unwrapping: tool errors
// throw, structured content wins, and text is parsed when it is JSON.
// Results that are not MCP-shaped pass through unchanged.
export function codeValue(result: unknown): unknown {
    const output = result as {
        content?: { type?: string; text?: string }[];
        structuredContent?: unknown;
        isError?: boolean;
    } | null;
    if (!Array.isArray(output?.content)) return result;
    const text = output.content.every((part) => part?.type === "text")
        ? output.content.map((part) => part.text).join("\n")
        : undefined;
    if (output.isError) throw new Error(text || "Tool call failed");
    if (output.structuredContent != null) return output.structuredContent;
    if (text === undefined) return result;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// One tool that runs model-written JavaScript in a Dynamic Worker with no
// network access. Each provider is a namespace in the sandbox; its tool
// calls come back here and run as ordinary tool calls.
export function createCodemodeTool(
    loader: WorkerLoader,
    providers: ToolProvider[],
) {
    const sandbox = new DynamicWorkerExecutor({ loader, globalOutbound: null });
    return createCodeTool({
        tools: providers,
        executor: {
            // codemode 0.5.3 keeps the `;` of `async () => {...};`, which
            // then fails to parse when the sandbox calls the function.
            execute: (source, providerList, options) =>
                sandbox.execute(
                    source.replace(/;\s*$/, ""),
                    providerList,
                    options,
                ),
        },
        description: CODE_TOOL_DESCRIPTION,
    });
}

type CodeAgentTool = {
    description?: string;
    inputSchema: Parameters<typeof jsonSchema>[0];
    execute: (input: unknown) => Promise<unknown>;
};

/**
 * Code agents get this through dispatch props, so their bundle needs no
 * code-execution runtime. Their tools stay in the agent: each `execute` is
 * an RPC stub back into the agent's request.
 */
export class CodeMode extends WorkerEntrypoint<CloudflareBindings> {
    async tool(tools: Record<string, CodeAgentTool>) {
        const code = createCodemodeTool(this.env.LOADER, [
            {
                tools: Object.fromEntries(
                    Object.entries(tools).map(([name, agentTool]) => [
                        name,
                        tool({
                            description: agentTool.description,
                            inputSchema: jsonSchema(agentTool.inputSchema),
                            execute: async (input) =>
                                codeValue(await agentTool.execute(input)),
                        }),
                    ]),
                ),
            },
        ]);
        return {
            description: code.description ?? "",
            inputSchema: await asSchema(code.inputSchema).jsonSchema,
            execute: (input: unknown) =>
                code.execute?.(input as { code: string }, {
                    toolCallId: crypto.randomUUID(),
                    messages: [],
                    context: undefined,
                }),
        };
    }
}

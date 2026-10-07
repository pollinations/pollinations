import { WorkerEntrypoint } from "cloudflare:workers";
import { DynamicWorkerExecutor, type ToolProvider } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { asSchema, jsonSchema, tool } from "ai";

const CODE_TOOL_DESCRIPTION = `Run JavaScript that calls your tools. Use it to chain tool calls, run independent calls in parallel with Promise.all, and return only what you need.

Available:
{{types}}

Write an async arrow function in plain JavaScript (no TypeScript) and return the result. A tool function returns the tool's text, or its structured JSON when the tool provides it, and throws when the tool fails. console.log output is returned with the result. The code has no network access.

Example: async () => { const pages = await Promise.all(["a", "b"].map((query) => server.search({ query }))); return pages.map((page) => page.slice(0, 1000)); }`;

// Code receives what a reader would: structured content when an MCP server
// sends it, otherwise the text. Tool errors throw so the code can catch them.
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
    return output.structuredContent ?? text ?? output.content;
}

// One tool that runs model-written JavaScript in a Dynamic Worker with no
// network access. Each provider is a namespace in the sandbox; its tool
// calls come back here and run as ordinary tool calls.
export function createCodemodeTool(
    loader: WorkerLoader,
    providers: ToolProvider[],
) {
    return createCodeTool({
        tools: providers,
        executor: new DynamicWorkerExecutor({ loader, globalOutbound: null }),
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

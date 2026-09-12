import type { WorkspaceClient } from "@cloudflare/computer";
import { createAITools } from "@cloudflare/computer/tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "ai";
import type { ZodRawShape } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent computer. Files under /workspace survive between " +
    "runs. Read /workspace/README.md first; it explains the memory layout. " +
    "The shell has no network access and cannot run Node, Python, or npm.";

const WORKER_SHELL_DESCRIPTION =
    "bash (just-bash) in an isolated Worker. Coreutils, grep, sed, awk, jq " +
    "and sqlite3 are available. No outbound network, no Node, no Python.";

// Tools that survive from createAITools: plain file and shell tools only.
const EXPOSED_TOOLS = ["read", "write", "edit", "ls", "find", "grep", "exec"];

export function createComputerMcpServer(workspace: WorkspaceClient): McpServer {
    const server = new McpServer(
        { name: "computer", version: "0.1.0" },
        { instructions: SERVER_INSTRUCTIONS },
    );
    const tools = createAITools({
        workspace,
        assets: false,
        shell: {
            backends: {
                "worker-shell": { description: WORKER_SHELL_DESCRIPTION },
            },
            defaultBackend: "worker-shell",
        },
    });
    for (const name of EXPOSED_TOOLS) {
        const tool = tools[name];
        if (!tool) throw new Error(`Missing computer tool: ${name}`);
        registerComputerTool(server, name, tool);
    }
    return server;
}

function registerComputerTool(server: McpServer, name: string, tool: Tool) {
    const execute = tool.execute;
    if (!execute) throw new Error(`Computer tool ${name} has no execute`);
    server.registerTool(
        name,
        {
            description:
                typeof tool.description === "string"
                    ? tool.description
                    : undefined,
            inputSchema: tool.inputSchema as unknown as ZodRawShape,
        },
        async (args, context) => {
            try {
                const execution = await execute(args, {
                    toolCallId: `mcp:${name}`,
                    messages: [],
                    abortSignal: context.signal,
                    context: undefined,
                });
                const value = await finalToolValue(execution);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(value) ?? "undefined",
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    ],
                };
            }
        },
    );
}

// AI SDK tools may stream partial results as an async iterable; keep the last.
async function finalToolValue(execution: unknown): Promise<unknown> {
    if (
        execution !== null &&
        typeof execution === "object" &&
        Symbol.asyncIterator in execution
    ) {
        let last: unknown;
        for await (const chunk of execution as AsyncIterable<unknown>) {
            last = chunk;
        }
        return last;
    }
    return execution;
}

import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import type {
    AgentContext,
    ContentBlock,
    McpServer,
    PromptResponse,
    SessionConfigOption,
    SessionUpdate,
    StopReason,
} from "@agentclientprotocol/sdk";
import type { CallToolResult, Client } from "@modelcontextprotocol/client";
import { Command } from "commander";
import pkg from "../../package.json";
import { ApiError, gen, genResponse } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printWarn } from "../lib/output.js";
import { sseEvents } from "../lib/stream.js";
import { loginWithDeviceFlow } from "./auth.js";

// Each round is one /v1/responses call; editor tool calls start the next one.
const MAX_ROUNDS = 20;
const LOGIN_METHOD = "pollinations-login";

/** A Responses item. Output items go back to gen unchanged as history. */
type Item = { type?: string; [key: string]: unknown };

interface FunctionCall {
    type: "function_call";
    call_id: string;
    name: string;
    arguments: string;
}

interface AgentModel {
    id: string;
    title?: string;
    description?: string;
    agent?: boolean;
}

/** An MCP tool from the editor, offered to the agent as a function. */
interface EditorTool {
    client: Client;
    name: string;
    definition: {
        type: "function";
        name: string;
        description?: string;
        parameters: unknown;
    };
}

interface Session {
    id: string;
    agent: string;
    agents: AgentModel[];
    history: Item[];
    tools: Map<string, EditorTool>;
    clients: Client[];
    alwaysAllowed: Set<string>;
    cancel?: AbortController;
}

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const textUpdate = (text: string) => [
    { type: "content" as const, content: { type: "text" as const, text } },
];

/** Turns an ACP prompt into a Responses user message. */
export const userMessage = (prompt: ContentBlock[]): Item => ({
    role: "user",
    content: prompt.flatMap((block): Item[] => {
        if (block.type === "text") {
            return [{ type: "input_text", text: block.text }];
        }
        if (block.type === "image") {
            return [
                {
                    type: "input_image",
                    image_url: `data:${block.mimeType};base64,${block.data}`,
                },
            ];
        }
        if (block.type === "resource_link") {
            return [
                { type: "input_text", text: `${block.name}: ${block.uri}` },
            ];
        }
        if (block.type === "resource") {
            const { resource } = block;
            if ("text" in resource) {
                return [
                    {
                        type: "input_text",
                        text: `File ${resource.uri}:\n${resource.text}`,
                    },
                ];
            }
            if (resource.mimeType?.startsWith("image/")) {
                return [
                    {
                        type: "input_image",
                        image_url: `data:${resource.mimeType};base64,${resource.blob}`,
                    },
                ];
            }
        }
        // Audio is not advertised, so editors don't send it.
        return [];
    }),
});

/** Gen sends a hosted tool's MCP result as JSON text. */
const hostedResult = (output: unknown) => {
    const text = Array.isArray(output)
        ? output.map((part) => String(part?.text ?? "")).join("")
        : String(output ?? "");
    const result = parseJson(text) as Partial<CallToolResult> | string;
    if (typeof result !== "object" || !Array.isArray(result?.content)) {
        return { text, failed: false };
    }
    return { text: resultText(result), failed: result.isError === true };
};

const resultText = (result: Partial<CallToolResult>) => {
    const parts = (result.content ?? []).flatMap((part) =>
        part.type === "text" ? [part.text] : [],
    );
    return parts.length ? parts.join("\n") : JSON.stringify(result);
};

/** Shows the agent's tool calls in the editor as they finish. */
const itemUpdate = (
    item: Item,
    editorTools: Map<string, EditorTool>,
): SessionUpdate | undefined => {
    if (item.type === "function_call") {
        const call = item as unknown as FunctionCall;
        return {
            sessionUpdate: "tool_call",
            toolCallId: call.call_id,
            title: call.name,
            kind: "other",
            // Editor tools wait for the editor; hosted tools are running.
            status: editorTools.has(call.name) ? "pending" : "in_progress",
            rawInput: parseJson(call.arguments),
        };
    }
    if (item.type === "function_call_output") {
        const { text, failed } = hostedResult(item.output);
        return {
            sessionUpdate: "tool_call_update",
            toolCallId: String(item.call_id),
            status: failed ? "failed" : "completed",
            content: textUpdate(text),
        };
    }
    return undefined;
};

const listAgents = async () =>
    (await gen<{ data: AgentModel[] }>("/v1/models")).data.filter(
        (model) => model.agent,
    );

const agentOption = (session: Session): SessionConfigOption => ({
    id: "agent",
    name: "Agent",
    category: "model",
    type: "select",
    currentValue: session.agent,
    options: session.agents.map((agent) => ({
        value: agent.id,
        name: agent.title || agent.id,
        description: agent.description || null,
    })),
});

/** Function names gen accepts for caller tools. */
const toolName = (
    taken: Map<string, EditorTool>,
    server: string,
    tool: string,
) =>
    [tool, `${server}_${tool}`]
        .map((name) => name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64))
        .find((name) => !taken.has(name) && !name.startsWith("mcp__"));

/** Connects the MCP servers the editor passes in session/new. */
const connectServers = async (servers: McpServer[], cwd: string) => {
    const { Client, StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/client"
    );
    const { StdioClientTransport, getDefaultEnvironment } = await import(
        "@modelcontextprotocol/client/stdio"
    );
    const tools = new Map<string, EditorTool>();
    const clients: Client[] = [];
    for (const server of servers) {
        const client = new Client({ name: "polli", version: pkg.version });
        try {
            if ("type" in server && server.type === "sse") {
                throw new Error("SSE transport is not supported");
            }
            await client.connect(
                "type" in server && server.type === "http"
                    ? new StreamableHTTPClientTransport(new URL(server.url), {
                          requestInit: {
                              headers: Object.fromEntries(
                                  server.headers.map((h) => [h.name, h.value]),
                              ),
                          },
                      })
                    : new StdioClientTransport({
                          command: server.command,
                          args: server.args,
                          cwd,
                          // Not process.env: it can hold the Pollinations key.
                          env: {
                              ...getDefaultEnvironment(),
                              ...Object.fromEntries(
                                  server.env.map((v) => [v.name, v.value]),
                              ),
                          },
                      }),
            );
            clients.push(client);
            let cursor: string | undefined;
            do {
                const page = await client.listTools(
                    cursor ? { cursor } : undefined,
                );
                for (const tool of page.tools) {
                    const name = toolName(tools, server.name, tool.name);
                    if (!name) {
                        printWarn(
                            `Skipping MCP tool ${server.name}/${tool.name}`,
                        );
                        continue;
                    }
                    tools.set(name, {
                        client,
                        name: tool.name,
                        definition: {
                            type: "function",
                            name,
                            description: tool.description,
                            parameters: tool.inputSchema,
                        },
                    });
                }
                cursor = page.nextCursor;
            } while (cursor);
        } catch (error) {
            printWarn(
                `MCP server ${server.name} failed: ${errorMessage(error)}`,
            );
            await client.close().catch(() => undefined);
        }
    }
    return { tools, clients };
};

/** One /v1/responses call; streams its text and tool calls to the editor. */
const respond = async (
    session: Session,
    input: Item[],
    signal: AbortSignal,
    update: (update: SessionUpdate) => Promise<void>,
): Promise<{ output: Item[]; stop?: StopReason }> => {
    const tools = [...session.tools.values()].map((tool) => tool.definition);
    const response = await genResponse("/v1/responses", {
        method: "POST",
        body: {
            model: session.agent,
            input,
            stream: true,
            ...(tools.length ? { tools } : {}),
        },
        signal,
    });
    const output: Item[] = [];
    for await (const event of sseEvents(response)) {
        if (event.type === "response.output_text.delta") {
            await update({
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: String(event.delta) },
            });
        } else if (event.type === "response.output_item.done") {
            const item = event.item as Item;
            output.push(item);
            const itemEvent = itemUpdate(item, session.tools);
            if (itemEvent) await update(itemEvent);
        } else if (event.type === "response.completed") {
            return { output };
        } else if (event.type === "response.incomplete") {
            const response = event.response as {
                incomplete_details?: { reason?: string };
            };
            const filtered =
                response.incomplete_details?.reason === "content_filter";
            return { output, stop: filtered ? "refusal" : "max_tokens" };
        } else if (event.type === "response.failed") {
            const response = event.response as { error?: { message?: string } };
            throw new Error(response.error?.message ?? "The agent run failed");
        } else if (event.type === "error") {
            throw new Error(String(event.message ?? "The agent run failed"));
        }
    }
    throw new Error("The agent's stream ended early");
};

/** Runs one editor MCP tool after the user allows it. Returns the function
 * output for gen, or undefined when the prompt was cancelled. */
const runEditorTool = async (
    session: Session,
    call: FunctionCall,
    client: AgentContext,
    signal: AbortSignal,
    update: (update: SessionUpdate) => Promise<void>,
): Promise<string | undefined> => {
    const tool = session.tools.get(call.name) as EditorTool;
    if (!session.alwaysAllowed.has(call.name)) {
        const { outcome } = await client.request("session/request_permission", {
            sessionId: session.id,
            toolCall: { toolCallId: call.call_id },
            options: [
                { optionId: "allow", name: "Allow", kind: "allow_once" },
                {
                    optionId: "always",
                    name: "Always allow",
                    kind: "allow_always",
                },
                { optionId: "reject", name: "Reject", kind: "reject_once" },
            ],
        });
        if (outcome.outcome === "cancelled") return undefined;
        if (outcome.optionId === "always") session.alwaysAllowed.add(call.name);
        if (outcome.optionId === "reject") {
            const text = "The user rejected this tool call.";
            await update({
                sessionUpdate: "tool_call_update",
                toolCallId: call.call_id,
                status: "failed",
                content: textUpdate(text),
            });
            return JSON.stringify({
                isError: true,
                content: [{ type: "text", text }],
            });
        }
    }
    await update({
        sessionUpdate: "tool_call_update",
        toolCallId: call.call_id,
        status: "in_progress",
    });
    let result: Partial<CallToolResult>;
    try {
        result = await tool.client.callTool(
            {
                name: tool.name,
                arguments: parseJson(call.arguments) as Record<string, unknown>,
            },
            { signal },
        );
    } catch (error) {
        if (signal.aborted) return undefined;
        result = {
            isError: true,
            content: [{ type: "text", text: errorMessage(error) }],
        };
    }
    await update({
        sessionUpdate: "tool_call_update",
        toolCallId: call.call_id,
        status: result.isError ? "failed" : "completed",
        content: textUpdate(resultText(result)),
    });
    // Gen reads MCP results, including isError, from this JSON.
    return JSON.stringify(result);
};

/** Runs one prompt turn. History is kept only when the turn finishes. */
const prompt = async (
    session: Session,
    blocks: ContentBlock[],
    client: AgentContext,
    requestSignal: AbortSignal,
): Promise<PromptResponse> => {
    const cancel = new AbortController();
    session.cancel = cancel;
    requestSignal.addEventListener("abort", () => cancel.abort(), {
        once: true,
    });
    const { signal } = cancel;
    const update = (update: SessionUpdate) =>
        client.notify("session/update", { sessionId: session.id, update });
    const input = [...session.history, userMessage(blocks)];
    try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
            const { output, stop } = await respond(
                session,
                input,
                signal,
                update,
            );
            input.push(...output);
            const answered = new Set(
                output
                    .filter((item) => item.type === "function_call_output")
                    .map((item) => item.call_id),
            );
            const calls = output.filter(
                (item): item is Item & FunctionCall =>
                    item.type === "function_call" &&
                    !answered.has(item.call_id) &&
                    session.tools.has(String(item.name)),
            );
            if (stop || !calls.length) {
                session.history = input;
                return { stopReason: stop ?? "end_turn" };
            }
            for (const call of calls) {
                const output = await runEditorTool(
                    session,
                    call,
                    client,
                    signal,
                    update,
                );
                if (output === undefined) return { stopReason: "cancelled" };
                input.push({
                    type: "function_call_output",
                    call_id: call.call_id,
                    output,
                });
            }
        }
        session.history = input;
        return { stopReason: "max_turn_requests" };
    } catch (error) {
        if (signal.aborted) return { stopReason: "cancelled" };
        if (error instanceof ApiError && error.status === 401) {
            const { RequestError } = await import("@agentclientprotocol/sdk");
            throw RequestError.authRequired();
        }
        throw error;
    }
};

/** The ACP agent: one session per editor thread, each calling a hosted agent. */
export const acpAgent = async (defaultAgent?: string) => {
    const acp = await import("@agentclientprotocol/sdk");
    const { RequestError } = acp;
    const sessions = new Map<string, Session>();
    const session = (id: string) => {
        const found = sessions.get(id);
        if (!found) throw RequestError.sessionNotFound(id);
        return found;
    };
    const app = acp
        .agent({ name: "polli" })
        .onRequest("initialize", () => ({
            protocolVersion: acp.PROTOCOL_VERSION,
            agentCapabilities: {
                promptCapabilities: { image: true, embeddedContext: true },
                mcpCapabilities: { http: true },
            },
            authMethods: [
                {
                    id: LOGIN_METHOD,
                    name: "Sign in to Pollinations",
                    description:
                        "Approve a key in your browser, or set POLLINATIONS_API_KEY.",
                },
            ],
            agentInfo: {
                name: "polli",
                title: "Pollinations",
                version: pkg.version,
            },
        }))
        .onRequest("authenticate", async () => {
            try {
                await loginWithDeviceFlow();
            } catch (error) {
                throw RequestError.internalError(
                    undefined,
                    errorMessage(error),
                );
            }
            return {};
        })
        .onRequest("session/new", async ({ params }) => {
            if (!resolveApiKey()) throw RequestError.authRequired();
            const agents = await listAgents();
            const agent = defaultAgent ?? agents[0]?.id;
            if (!agent) throw new Error("No agents found");
            const created: Session = {
                id: randomUUID(),
                agent,
                agents: agents.some((listed) => listed.id === agent)
                    ? agents
                    : [{ id: agent }, ...agents],
                history: [],
                alwaysAllowed: new Set(),
                ...(await connectServers(params.mcpServers, params.cwd)),
            };
            sessions.set(created.id, created);
            return {
                sessionId: created.id,
                configOptions: [agentOption(created)],
            };
        })
        .onRequest("session/set_config_option", ({ params }) => {
            const found = session(params.sessionId);
            if (
                params.configId !== "agent" ||
                typeof params.value !== "string"
            ) {
                throw RequestError.invalidParams(undefined, "Unknown option");
            }
            found.agent = params.value;
            return { configOptions: [agentOption(found)] };
        })
        .onRequest("session/prompt", ({ params, client, signal }) =>
            prompt(session(params.sessionId), params.prompt, client, signal),
        )
        .onNotification("session/cancel", ({ params }) => {
            sessions.get(params.sessionId)?.cancel?.abort();
        });
    const close = () =>
        Promise.all(
            [...sessions.values()].flatMap((found) =>
                found.clients.map((client) => client.close()),
            ),
        );
    return { app, close };
};

const serve = async (agent?: string) => {
    const { ndJsonStream } = await import("@agentclientprotocol/sdk");
    const { app, close } = await acpAgent(agent);
    // stdout carries the protocol; polli's messages already go to stderr.
    const connection = app.connect(
        ndJsonStream(
            Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
            Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
        ),
    );
    await connection.closed;
    await close();
};

export const acpCommand = new Command("acp")
    .description(
        "Serve Pollinations agents to editors over the Agent Client Protocol",
    )
    .argument(
        "[agent]",
        "Agent to start with, e.g. community/<owner>/<name>; the editor can switch",
    )
    .addHelpText(
        "after",
        `
Editors start this command themselves. Zed (settings.json):
  "agent_servers": {
    "Pollinations": {
      "type": "custom",
      "command": "npx",
      "args": ["-y", "@pollinations/cli", "acp"]
    }
  }

The agent runs on Pollinations. MCP servers the editor passes are connected
here and offered to the agent as tools; each call asks for your permission.
`,
    )
    .action((agent?: string) => serve(agent));

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
import { resolveApiKey, setKeyOverride } from "../lib/config.js";
import { printWarn } from "../lib/output.js";
import { sseEvents } from "../lib/stream.js";
import { loginWithDeviceFlow } from "./auth.js";

// Each round is one /v1/responses call; editor tool calls start the next one.
const MAX_ROUNDS = 20;

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
const hostedResult = (output: { text?: string }[]) => {
    const text = output.map((part) => part.text ?? "").join("");
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
        const { text, failed } = hostedResult(
            item.output as { text?: string }[],
        );
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
    (await gen<{ data: AgentModel[] }>("/v1/models?agent=true")).data;

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
    const { StdioClientTransport } = await import(
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
                          // The SDK adds a safe default env (PATH, HOME…),
                          // never process.env, which can hold the key.
                          env: Object.fromEntries(
                              server.env.map((v) => [v.name, v.value]),
                          ),
                      }),
            );
            clients.push(client);
            // Without a cursor, listTools returns every page.
            for (const tool of (await client.listTools()).tools) {
                const name = toolName(tools, server.name, tool.name);
                if (!name) {
                    printWarn(`Skipping MCP tool ${server.name}/${tool.name}`);
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
        const { optionId } = outcome;
        if (optionId === "always") session.alwaysAllowed.add(call.name);
        if (optionId !== "allow" && optionId !== "always") {
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
    // Gen gives the model tool results as text, so base64 would cost tokens.
    result = {
        ...result,
        content: (result.content ?? []).map((part) =>
            part.type === "text" ||
            part.type === "resource_link" ||
            (part.type === "resource" && "text" in part.resource)
                ? part
                : { type: "text", text: `[${part.type} output omitted]` },
        ),
    };
    await update({
        sessionUpdate: "tool_call_update",
        toolCallId: call.call_id,
        status: result.isError ? "failed" : "completed",
        content: textUpdate(resultText(result)),
    });
    // Gen reads MCP results, including isError, from this JSON.
    return JSON.stringify(result);
};

/** The call_ids that already have a result. */
const resultIds = (items: Item[]) =>
    new Set(
        items
            .filter((item) => item.type === "function_call_output")
            .map((item) => item.call_id),
    );

/** Drops function calls without a result; gen rejects them in history. */
const answered = (items: Item[]) => {
    const done = resultIds(items);
    return items.filter(
        (item) => item.type !== "function_call" || done.has(item.call_id),
    );
};

/** Runs one prompt turn and adds what finished to the session's history. */
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
            if (stop === "refusal") {
                // ACP leaves a refused turn out of later prompts.
                input.length = session.history.length;
                return { stopReason: stop };
            }
            input.push(...output);
            // Gen runs hosted tools and returns their results, even when a
            // code agent's own tool shares an editor tool's name. Calls to
            // editor tools come back without one.
            const done = resultIds(output);
            const calls = output.filter(
                (item): item is Item & FunctionCall =>
                    item.type === "function_call" &&
                    !done.has(item.call_id) &&
                    session.tools.has(String(item.name)),
            );
            if (stop || !calls.length) {
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
        return { stopReason: "max_turn_requests" };
    } catch (error) {
        if (signal.aborted) return { stopReason: "cancelled" };
        // The editor may resend this prompt (say, after sign-in), so keep a
        // failed turn only when tools already ran in it.
        if (!resultIds(input.slice(session.history.length)).size) {
            input.length = session.history.length;
        }
        throw error;
    } finally {
        // Also after a cancel or error, so tools that already ran stay known.
        session.history = answered(input);
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
                sessionCapabilities: { close: {} },
            },
            authMethods: [
                {
                    id: "pollinations-login",
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
                // Beats a stale POLLINATIONS_API_KEY from the editor's env.
                setKeyOverride(await loginWithDeviceFlow());
            } catch {
                // The reason is already in the agent's log (stderr).
                throw RequestError.internalError(
                    undefined,
                    "Sign-in failed. Run polli auth login in a terminal, or set POLLINATIONS_API_KEY.",
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
            if (found.agent !== params.value) {
                found.agent = params.value;
                // "Always allow" was granted to the previous agent's author.
                found.alwaysAllowed.clear();
            }
            return { configOptions: [agentOption(found)] };
        })
        .onRequest("session/prompt", async ({ params, client, signal }) => {
            const found = session(params.sessionId);
            try {
                return await prompt(found, params.prompt, client, signal);
            } catch (error) {
                if (error instanceof ApiError && error.status === 401) {
                    throw RequestError.authRequired();
                }
                // Otherwise the editor shows only "Internal error".
                throw RequestError.internalError(
                    undefined,
                    errorMessage(error),
                );
            }
        })
        .onNotification("session/cancel", ({ params }) => {
            sessions.get(params.sessionId)?.cancel?.abort();
        })
        .onRequest("session/close", async ({ params }) => {
            const found = session(params.sessionId);
            found.cancel?.abort();
            sessions.delete(found.id);
            await Promise.all(found.clients.map((client) => client.close()));
            return {};
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
    // stdout carries the protocol. polli prints to stderr, but libraries log
    // with console (the MCP client's listTools does), so send that there too.
    console.log = console.info = console.debug = console.error;
    const connection = app.connect(
        ndJsonStream(
            Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
            Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
        ),
    );
    try {
        await connection.closed;
    } finally {
        await close();
    }
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

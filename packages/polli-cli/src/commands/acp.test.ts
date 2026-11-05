import { client, type SessionUpdate } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acpAgent } from "./acp.js";

const sse = (events: Record<string, unknown>[]) =>
    new Response(
        `${events
            .map(
                (event) =>
                    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            )
            .join("")}data: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
    );

const user = (text: string) => ({
    role: "user",
    content: [{ type: "input_text", text }],
});

const hostedCall = {
    type: "function_call",
    id: "fc_1",
    call_id: "call_1",
    name: "mcp__search__web",
    arguments: '{"query":"bees"}',
    status: "completed",
};
const hostedOutput = {
    type: "function_call_output",
    id: "fco_1",
    call_id: "call_1",
    output: [
        {
            type: "input_text",
            text: JSON.stringify({
                isError: true,
                content: [{ type: "text", text: "Search is down" }],
            }),
        },
    ],
};
const message = {
    type: "message",
    id: "msg_1",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Hi", annotations: [] }],
};

const noteSchema = {
    type: "object",
    properties: { title: { type: "string" } },
};

/** Answers gen with `responses` in order, and http://mcp.test as an MCP
 * server with one `read_note` tool. */
const stubFetch = (responses: Response[]) => {
    const bodies: { model: string; input: Record<string, unknown>[] }[] = [];
    const toolCalls: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
        const href = String(url);
        if (href.endsWith("/v1/models?agent=true")) {
            return Response.json({
                data: [{ id: "community/ada/helper", title: "Helper" }],
            });
        }
        if (href.startsWith("http://mcp.test/")) {
            if (init.method !== "POST")
                return new Response(null, { status: 405 });
            const request = JSON.parse(String(init.body));
            if (request.id === undefined)
                return new Response(null, { status: 202 });
            if (request.method === "tools/call") toolCalls.push(request.params);
            const results: Record<string, unknown> = {
                initialize: {
                    protocolVersion: request.params?.protocolVersion,
                    capabilities: { tools: {} },
                    serverInfo: { name: "notes", version: "1.0.0" },
                },
                "tools/list": {
                    tools: [{ name: "read_note", inputSchema: noteSchema }],
                },
                "tools/call": {
                    content: [
                        { type: "text", text: "buy apples" },
                        { type: "image", data: "aGk=", mimeType: "image/png" },
                    ],
                },
            };
            return Response.json({
                jsonrpc: "2.0",
                id: request.id,
                result: results[request.method],
            });
        }
        bodies.push(JSON.parse(String(init.body)));
        return responses.shift() as Response;
    });
    return { bodies, toolCalls };
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("polli acp", () => {
    it("streams a hosted agent's turn and replays it as history", async () => {
        vi.stubEnv("POLLINATIONS_API_KEY", "sk_test");
        const { bodies } = stubFetch([
            sse([
                { type: "response.output_item.done", item: hostedCall },
                { type: "response.output_item.done", item: hostedOutput },
                { type: "response.output_text.delta", delta: "Hi" },
                { type: "response.output_item.done", item: message },
                { type: "response.completed" },
            ]),
            sse([
                {
                    type: "response.incomplete",
                    response: {
                        incomplete_details: { reason: "content_filter" },
                    },
                },
            ]),
            Response.json(
                { error: { message: "Invalid API key" } },
                { status: 401 },
            ),
            sse([{ type: "response.completed" }]),
        ]);

        const updates: SessionUpdate[] = [];
        const { app } = await acpAgent();
        await client({ name: "test" })
            .onNotification("session/update", ({ params }) => {
                updates.push(params.update);
            })
            .connectWith(app, async (ctx) => {
                await ctx.request("initialize", {
                    protocolVersion: 1,
                    clientCapabilities: {},
                });
                const session = await ctx.request("session/new", {
                    cwd: "/tmp",
                    mcpServers: [],
                });
                expect(session.configOptions?.[0]).toMatchObject({
                    category: "model",
                    currentValue: "community/ada/helper",
                    options: [
                        { value: "community/ada/helper", name: "Helper" },
                    ],
                });

                const turn = (text: string) =>
                    ctx.request("session/prompt", {
                        sessionId: session.sessionId,
                        prompt: [{ type: "text", text }],
                    });
                expect((await turn("Find bees")).stopReason).toBe("end_turn");
                expect((await turn("Again")).stopReason).toBe("refusal");
                await expect(turn("Unauthorized")).rejects.toMatchObject({
                    code: -32000,
                });
                expect((await turn("Third")).stopReason).toBe("end_turn");
            });

        expect(updates).toEqual([
            {
                sessionUpdate: "tool_call",
                toolCallId: "call_1",
                title: "mcp__search__web",
                kind: "other",
                status: "in_progress",
                rawInput: { query: "bees" },
            },
            {
                sessionUpdate: "tool_call_update",
                toolCallId: "call_1",
                status: "failed",
                content: [
                    {
                        type: "content",
                        content: { type: "text", text: "Search is down" },
                    },
                ],
            },
            {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "Hi" },
            },
        ]);
        const firstTurn = [
            user("Find bees"),
            hostedCall,
            hostedOutput,
            message,
        ];
        expect(bodies[1]).toMatchObject({
            model: "community/ada/helper",
            input: [...firstTurn, user("Again")],
        });
        // ACP leaves the refused turn out of later prompts, and polli the
        // failed one, which the editor may resend.
        expect(bodies[3].input).toEqual([...firstTurn, user("Third")]);
    });

    it("runs editor MCP tools only when the user allows them", async () => {
        vi.stubEnv("POLLINATIONS_API_KEY", "sk_test");
        const noteCall = (id: string) => ({
            type: "function_call",
            id: `fc_${id}`,
            call_id: id,
            name: "read_note",
            arguments: '{"title":"groceries"}',
            status: "completed",
        });
        // A code agent's own read_note already ran on the server.
        const serverNoteOutput = {
            type: "function_call_output",
            call_id: "call_server",
            output: [{ type: "input_text", text: "milk" }],
        };
        const { bodies, toolCalls } = stubFetch([
            sse([
                {
                    type: "response.output_item.done",
                    item: noteCall("call_server"),
                },
                { type: "response.output_item.done", item: serverNoteOutput },
                { type: "response.output_item.done", item: noteCall("call_a") },
                { type: "response.completed" },
            ]),
            sse([
                { type: "response.output_item.done", item: message },
                { type: "response.completed" },
            ]),
            sse([
                { type: "response.output_item.done", item: noteCall("call_b") },
                { type: "response.completed" },
            ]),
            sse([{ type: "response.completed" }]),
        ]);

        // The editor answers the first permission request with Allow and the
        // second with an option the bridge never offered.
        const answers = ["allow", "unknown"];
        const { app, close } = await acpAgent();
        await client({ name: "test" })
            .onNotification("session/update", () => undefined)
            .onRequest("session/request_permission", () => ({
                outcome: {
                    outcome: "selected",
                    optionId: answers.shift() as string,
                },
            }))
            .connectWith(app, async (ctx) => {
                await ctx.request("initialize", {
                    protocolVersion: 1,
                    clientCapabilities: {},
                });
                const { sessionId } = await ctx.request("session/new", {
                    cwd: "/tmp",
                    mcpServers: [
                        {
                            type: "http",
                            name: "notes",
                            url: "http://mcp.test/mcp",
                            headers: [],
                        },
                    ],
                });
                for (const text of ["Read groceries", "Read it again"]) {
                    const { stopReason } = await ctx.request("session/prompt", {
                        sessionId,
                        prompt: [{ type: "text", text }],
                    });
                    expect(stopReason).toBe("end_turn");
                }
            });
        await close();

        expect(bodies[0]).toMatchObject({
            tools: [
                { type: "function", name: "read_note", parameters: noteSchema },
            ],
        });
        expect(toolCalls).toMatchObject([
            { name: "read_note", arguments: { title: "groceries" } },
        ]);
        expect(
            bodies[3].input.filter(
                (item) => item.type === "function_call_output",
            ),
        ).toEqual([
            serverNoteOutput,
            {
                type: "function_call_output",
                call_id: "call_a",
                output: JSON.stringify({
                    content: [
                        { type: "text", text: "buy apples" },
                        { type: "text", text: "[image output omitted]" },
                    ],
                }),
            },
            {
                type: "function_call_output",
                call_id: "call_b",
                output: JSON.stringify({
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "The user rejected this tool call.",
                        },
                    ],
                }),
            },
        ]);
    });
});

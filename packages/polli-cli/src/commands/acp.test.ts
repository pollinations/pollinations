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

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("polli acp", () => {
    it("streams a hosted agent's turn and replays it as history", async () => {
        vi.stubEnv("POLLINATIONS_API_KEY", "sk_test");
        const responses = [
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
        ];
        const bodies: { model: string; input: unknown[] }[] = [];
        vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
            if (url.endsWith("/v1/models")) {
                return Response.json({
                    data: [
                        { id: "openai", agent: false },
                        {
                            id: "community/ada/helper",
                            title: "Helper",
                            agent: true,
                        },
                    ],
                });
            }
            bodies.push(JSON.parse(String(init.body)));
            return responses.shift() as Response;
        });

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

                const first = await ctx.request("session/prompt", {
                    sessionId: session.sessionId,
                    prompt: [{ type: "text", text: "Find bees" }],
                });
                expect(first.stopReason).toBe("end_turn");
                const second = await ctx.request("session/prompt", {
                    sessionId: session.sessionId,
                    prompt: [{ type: "text", text: "Again" }],
                });
                expect(second.stopReason).toBe("refusal");
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
        expect(bodies[1]).toMatchObject({
            model: "community/ada/helper",
            input: [
                {
                    role: "user",
                    content: [{ type: "input_text", text: "Find bees" }],
                },
                hostedCall,
                hostedOutput,
                message,
                {
                    role: "user",
                    content: [{ type: "input_text", text: "Again" }],
                },
            ],
        });
    });
});

import type { CodeAgentCommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { Context } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { createCodeAgentResponsesClient } from "../src/text/agents/code-client.ts";
import { callChatViaResponses } from "../src/text/responses/chatClient.ts";

const endpoint = {
    id: "agent-id",
    baseUrl: "https://code-agent-runtime.invalid/v1/responses",
    type: "code_agent",
} as CodeAgentCommunityEndpointRuntime;

describe("code agent Responses client", () => {
    it.each([
        "init",
        "Request",
    ])("keeps %s credentials outside the user Worker", async (input) => {
        const workerFetch = vi.fn(async (_request: Request) =>
            Response.json({ ok: true }),
        );
        const get = vi.fn(() => ({ fetch: workerFetch }));
        const c = {
            env: { CODE_AGENTS: { get } },
            req: { url: "https://gen.pollinations.ai/v1/responses" },
        } as unknown as Context<Env>;

        const client = createCodeAgentResponsesClient(c, endpoint, "ag_run");
        const controller = new AbortController();
        const init = {
            method: "POST",
            headers: {
                ...client.target.headers,
                authorization: "Bearer ag_run",
                cookie: "session=caller",
                "api-key": "caller-key",
            },
            body: "{}",
            redirect: "manual" as const,
            signal: controller.signal,
        };
        if (input === "Request") {
            await client.fetcher(new Request(client.target.endpoint, init));
        } else {
            await client.fetcher(client.target.endpoint, init);
        }

        expect(get).toHaveBeenCalledWith(
            "agent-id",
            {},
            {
                limits: { cpuMs: 5_000, subRequests: 64 },
                outbound: {
                    CODE_AGENT_CONTEXT: {
                        authorization: "Bearer ag_run",
                        origin: "https://gen.pollinations.ai",
                    },
                },
            },
        );
        const request = workerFetch.mock.calls[0][0] as Request;
        expect([...request.headers]).toEqual([
            ["content-type", "application/json"],
        ]);
        expect(request.url).toBe(client.target.endpoint);
        expect(request.method).toBe("POST");
        expect(request.redirect).toBe("manual");
        expect(await request.text()).toBe("{}");
        controller.abort();
        expect(request.signal.aborted).toBe(true);
    });

    it("removes the run token reconstructed by the Chat adapter", async () => {
        const workerFetch = vi.fn(async (_request: Request) =>
            Response.json({
                id: "response-id",
                object: "response",
                created_at: 1,
                status: "completed",
                model: endpoint.id,
                output: [
                    {
                        id: "message-id",
                        type: "message",
                        role: "assistant",
                        status: "completed",
                        content: [
                            {
                                type: "output_text",
                                text: "Hello!",
                                annotations: [],
                            },
                        ],
                    },
                ],
                usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            }),
        );
        const c = {
            env: { CODE_AGENTS: { get: () => ({ fetch: workerFetch }) } },
            req: { url: "https://gen.pollinations.ai/v1/chat/completions" },
        } as unknown as Context<Env>;
        const client = createCodeAgentResponsesClient(c, endpoint, "ag_run");
        const result = await callChatViaResponses(
            [{ role: "user", content: "Hello" }],
            {
                model: endpoint.id,
                modelConfig: {
                    authKey: "ag_run",
                    responsesEndpoint: client.target.endpoint,
                },
            },
            client.fetcher,
        );
        expect(result).toMatchObject({
            choices: [{ message: { content: "Hello!" } }],
        });
        const request = workerFetch.mock.calls[0][0];
        expect([...request.headers]).toEqual([
            ["content-type", "application/json"],
        ]);
        expect(await request.json()).toMatchObject({ model: endpoint.id });
    });

    it("fails closed without a dispatch namespace", () => {
        const c = { env: {} } as Context<Env>;
        expect(() =>
            createCodeAgentResponsesClient(c, endpoint, "ag_run"),
        ).toThrow("Code agent runtime is not configured");
    });
});

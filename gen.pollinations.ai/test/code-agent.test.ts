import type { CodeAgentCommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { Context } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { createCodeAgentResponsesClient } from "../src/text/agents/code-client.ts";

const endpoint = {
    id: "agent-id",
    baseUrl: "https://code-agent-runtime.invalid/v1/responses",
    type: "code_agent",
} as CodeAgentCommunityEndpointRuntime;

describe("code agent Responses client", () => {
    it("dispatches the agent with fixed limits and its run token", async () => {
        const workerFetch = vi.fn(async (_request: Request) =>
            Response.json({ ok: true }),
        );
        const get = vi.fn(() => ({ fetch: workerFetch }));
        const c = {
            env: { CODE_AGENTS: { get } },
            req: { url: "https://gen.pollinations.ai/v1/responses" },
        } as unknown as Context<Env>;

        const client = createCodeAgentResponsesClient(c, endpoint, "ag_run");
        await client.fetcher(client.target.endpoint, {
            method: "POST",
            headers: client.target.headers,
            body: "{}",
        });

        expect(get).toHaveBeenCalledWith(
            "agent-id",
            {},
            {
                limits: { cpuMs: 1_000, subRequests: 32 },
                outbound: {
                    CODE_AGENT_CONTEXT: {
                        authorization: "Bearer ag_run",
                        origin: "https://gen.pollinations.ai",
                    },
                },
            },
        );
        const request = workerFetch.mock.calls[0][0] as Request;
        expect(request.headers.get("authorization")).toBeNull();
        expect(await request.text()).toBe("{}");
    });

    it("fails closed without a dispatch namespace", () => {
        const c = { env: {} } as Context<Env>;
        expect(() =>
            createCodeAgentResponsesClient(c, endpoint, "ag_run"),
        ).toThrow("Code agent runtime is not configured");
    });
});

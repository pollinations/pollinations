import type { CodeAgentCommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type { DirectResponsesTarget } from "../responses/client.ts";

type CodeAgentResponsesClient = {
    fetcher: typeof fetch;
    target: DirectResponsesTarget;
};

/** Invoke one isolated user Worker through the Responses client contract. */
export function createCodeAgentResponsesClient(
    c: Context<Env>,
    endpoint: CodeAgentCommunityEndpointRuntime,
    apiKey: string,
): CodeAgentResponsesClient {
    const namespace = c.env.CODE_AGENTS;
    if (!namespace) {
        const error = new Error(
            "Code agent runtime is not configured",
        ) as Error & { status?: number };
        error.status = 503;
        throw error;
    }
    const worker = namespace.get(
        endpoint.id,
        {},
        {
            limits: { cpuMs: 1_000, subRequests: 32 },
            outbound: {
                CODE_AGENT_CONTEXT: {
                    authorization: `Bearer ${apiKey}`,
                    origin: new URL(c.req.url).origin,
                },
            },
        },
    );
    const target: DirectResponsesTarget = {
        authConfigured: true,
        endpoint: endpoint.baseUrl,
        headers: {},
        model: endpoint.id,
        defaults: {},
    };
    // Credentials belong only in the trusted outbound context, never the user
    // isolate. Both Chat and Responses dispatch a JSON request here.
    const fetcher: typeof fetch = (input, init) =>
        worker.fetch(
            new Request(input, {
                ...init,
                headers: { "Content-Type": "application/json" },
            }),
        );
    return { fetcher, target };
}

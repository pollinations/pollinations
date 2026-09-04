import {
    type PromptAgentCommunityEndpointRuntime,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type { DirectResponsesTarget } from "../responses/client.ts";
import {
    handlePromptAgentResponsesRequest,
    PromptAgentResponsesRequestSchema,
} from "./responses.ts";
import type { PromptAgentRuntime } from "./runtime.ts";

type PromptAgentResponsesClient = {
    fetcher: typeof fetch;
    target: DirectResponsesTarget;
};

async function loadPromptAgentRuntime(
    c: Context<Env>,
    endpoint: PromptAgentCommunityEndpointRuntime,
    apiKey: string,
): Promise<PromptAgentRuntime> {
    const db = drizzle(c.env.DB, { schema });
    const row = await db.query.communityEndpoint.findFirst({
        columns: { payload: true },
        where: and(
            eq(schema.communityEndpoint.id, endpoint.id),
            eq(schema.communityEndpoint.type, "prompt_agent"),
        ),
    });
    if (!row) throw new Error(`Agent ${endpoint.id} was not found`);

    const config = parseListingPayload("prompt_agent", row.payload);
    if (!config)
        throw new Error(`Agent ${endpoint.id} has invalid configuration`);

    return {
        config,
        apiKey,
        genBaseUrl: new URL(c.req.url).origin,
        fetcher: fetch,
    };
}

/** Execute a managed prompt agent locally while retaining the Responses client contract. */
export async function createPromptAgentResponsesClient(
    c: Context<Env>,
    endpoint: PromptAgentCommunityEndpointRuntime,
    apiKey: string,
): Promise<PromptAgentResponsesClient> {
    const runtime = await loadPromptAgentRuntime(c, endpoint, apiKey);
    const target: DirectResponsesTarget = {
        authConfigured: true,
        endpoint: `${new URL(c.req.url).origin}/v1/responses`,
        headers: { Authorization: `Bearer ${apiKey}` },
        model: endpoint.id,
        defaults: {},
    };
    const fetcher: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        const body = await request.json().catch(() => null);
        const parsed = PromptAgentResponsesRequestSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                {
                    error: {
                        message: "Managed agent request contract is invalid",
                    },
                },
                { status: 400 },
            );
        }
        return handlePromptAgentResponsesRequest(
            parsed.data,
            c.req.raw.signal,
            runtime,
        );
    };
    return { fetcher, target };
}

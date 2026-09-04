import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import type { Env } from "../env.ts";
import { type AuthVariables, auth } from "../middleware/auth.ts";
import { parsePromptAgentConfig } from "../services/prompt-agent.ts";
import {
    handlePromptAgentResponsesRequest,
    PromptAgentResponsesRequestSchema,
} from "../services/prompt-agent-responses.ts";
import {
    handlePromptAgentRequest,
    type PromptAgentRuntime,
    PromptAgentRuntimeRequestSchema,
} from "../services/prompt-agent-runtime.ts";

function genBaseUrl(env: Env["Bindings"]): string {
    return (
        (env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
        "https://gen.pollinations.ai"
    );
}

function validateRuntimeRequest(result: { success: boolean; error?: unknown }) {
    if (!result.success) {
        throw new HTTPException(400, {
            message: "Managed agent request contract is invalid",
            cause: result.error,
        });
    }
}

async function promptAgentRuntime(
    env: Env["Bindings"],
    requestAuth: AuthVariables["auth"],
    model: string,
): Promise<PromptAgentRuntime> {
    await requestAuth.requireAuthorization();
    if (requestAuth.agentRun?.managedAgentId !== model) {
        throw new HTTPException(403, {
            message: "Agent run token is not valid for this agent",
        });
    }
    const apiKey = requestAuth.rawApiKey;
    if (!apiKey) {
        throw new HTTPException(401, { message: "Unauthorized" });
    }

    const db = drizzle(env.DB, { schema });
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, model),
            eq(schema.communityEndpoint.type, "prompt_agent"),
        ),
    });
    if (!row) {
        throw new HTTPException(404, { message: "Agent not found" });
    }
    const config = parsePromptAgentConfig(row.payload);
    if (!config) {
        throw new Error(`Agent ${row.id} has invalid configuration`);
    }
    return { config, apiKey, genBaseUrl: genBaseUrl(env) };
}

export const agentRuntimeRoutes = new Hono<Env>()
    .use("*", auth({ allowSessionCookie: false, allowApiKey: true }))
    .post(
        "/v1/chat/completions",
        validator(
            "json",
            PromptAgentRuntimeRequestSchema,
            validateRuntimeRequest,
        ),
        async (c) => {
            const body = c.req.valid("json");
            return await handlePromptAgentRequest(
                body,
                c.req.raw.signal,
                await promptAgentRuntime(c.env, c.var.auth, body.model),
            );
        },
    )
    .post(
        "/v1/responses",
        validator(
            "json",
            PromptAgentResponsesRequestSchema,
            validateRuntimeRequest,
        ),
        async (c) => {
            const body = c.req.valid("json");
            return await handlePromptAgentResponsesRequest(
                body,
                c.req.raw.signal,
                await promptAgentRuntime(c.env, c.var.auth, body.model),
            );
        },
    );

import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { parsePromptAgentConfig } from "../services/prompt-agent.ts";
import {
    handlePromptAgentRequest,
    type PromptAgentRequest,
} from "../services/prompt-agent-runtime.ts";

type RuntimeRequest = PromptAgentRequest & { model?: unknown };

function genBaseUrl(env: Env["Bindings"]): string {
    return (
        (env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
        "https://gen.pollinations.ai"
    );
}

function pollinationsMcpUrl(env: Env["Bindings"]): string {
    return (
        (env as { POLLINATIONS_MCP_URL?: string }).POLLINATIONS_MCP_URL ??
        "https://mcp.pollinations.ai/mcp"
    );
}

export const agentRuntimeRoutes = new Hono<Env>()
    .use("*", auth({ allowSessionCookie: false, allowApiKey: true }))
    .post("/v1/chat/completions", async (c) => {
        await c.var.auth.requireAuthorization();
        let body: RuntimeRequest;
        try {
            body = await c.req.json<RuntimeRequest>();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }
        if (typeof body.model !== "string") {
            throw new HTTPException(400, { message: "Agent ID is required" });
        }
        if (c.var.auth.agentRun?.managedAgentId !== body.model) {
            throw new HTTPException(403, {
                message: "Agent run token is not valid for this agent",
            });
        }
        const apiKey = c.var.auth.rawApiKey;
        if (!apiKey) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const db = drizzle(c.env.DB, { schema });
        const row = await db.query.agent.findFirst({
            where: eq(schema.agent.id, body.model),
        });
        if (!row) {
            throw new HTTPException(404, { message: "Agent not found" });
        }
        const config = parsePromptAgentConfig(row.config);
        if (!config) {
            throw new Error(`Agent ${row.id} has invalid configuration`);
        }
        return await handlePromptAgentRequest(body, c.req.raw.signal, {
            config,
            apiKey,
            genBaseUrl: genBaseUrl(c.env),
            pollinationsMcpUrl: pollinationsMcpUrl(c.env),
        });
    });

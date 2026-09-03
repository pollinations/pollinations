import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { parsePromptAgentConfig } from "../services/prompt-agent.ts";
import {
    AgentResponsesRequestSchema,
    handleAgentResponsesRequest,
    handlePromptAgentRequest,
    PromptAgentRuntimeRequestSchema,
} from "../services/prompt-agent-runtime.ts";

function genBaseUrl(env: Env["Bindings"]): string {
    return (
        (env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
        "https://gen.pollinations.ai"
    );
}

/**
 * Shared DB lookup for a prompt_agent community endpoint row.
 * Used by both the Chat Completions and Responses routes.
 */
async function lookupAgentConfig(agentId: string, db: Env["Bindings"]["DB"]) {
    const drizzleDb = drizzle(db, { schema });
    const row = await drizzleDb.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, agentId),
            eq(schema.communityEndpoint.type, "prompt_agent"),
        ),
    });
    return row ?? null;
}

export const agentRuntimeRoutes = new Hono<Env>()
    .use("*", auth({ allowSessionCookie: false, allowApiKey: true }))

    // -------------------------------------------------------------------------
    // POST /v1/chat/completions — managed agent via Chat Completions shape
    // -------------------------------------------------------------------------
    .post(
        "/v1/chat/completions",
        validator("json", PromptAgentRuntimeRequestSchema, (result) => {
            if (!result.success) {
                throw new Error("Managed agent request contract is invalid", {
                    cause: result.error,
                });
            }
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const body = c.req.valid("json");
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
            const row = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.id, body.model),
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
            return await handlePromptAgentRequest(body, c.req.raw.signal, {
                config,
                apiKey,
                genBaseUrl: genBaseUrl(c.env),
            });
        },
    )

    // -------------------------------------------------------------------------
    // POST /v1/responses — managed agent via Responses API shape (issue #14243)
    //
    // Stateless-only: store, previous_response_id, conversation, background,
    // encrypted state, and request-supplied tools are rejected with 400.
    // The MCP tool loop is fully server-managed (same mcpServers as Chat path).
    // Auth uses the identical run-token security as the Chat Completions route.
    // Billing guarantee: terminal response.completed event (with usage) is only
    // emitted after the agent completes; a disconnect before that point bills
    // nothing.
    // -------------------------------------------------------------------------
    .post(
        "/v1/responses",
        validator("json", AgentResponsesRequestSchema, (result) => {
            if (!result.success) {
                throw new Error(
                    "Managed agent Responses request contract is invalid",
                    {
                        cause: result.error,
                    },
                );
            }
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const body = c.req.valid("json");
            if (c.var.auth.agentRun?.managedAgentId !== body.model) {
                throw new HTTPException(403, {
                    message: "Agent run token is not valid for this agent",
                });
            }
            const apiKey = c.var.auth.rawApiKey;
            if (!apiKey) {
                throw new HTTPException(401, { message: "Unauthorized" });
            }

            const row = await lookupAgentConfig(body.model, c.env.DB);
            if (!row) {
                throw new HTTPException(404, { message: "Agent not found" });
            }
            const config = parsePromptAgentConfig(row.payload);
            if (!config) {
                throw new Error(`Agent ${row.id} has invalid configuration`);
            }
            return await handleAgentResponsesRequest(body, c.req.raw.signal, {
                config,
                apiKey,
                genBaseUrl: genBaseUrl(c.env),
            });
        },
    );

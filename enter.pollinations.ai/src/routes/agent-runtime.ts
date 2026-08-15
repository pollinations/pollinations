import * as schema from "@shared/db/better-auth.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    parsePromptAgentConfig,
    parsePromptAgentMcpHeaders,
} from "../services/prompt-agent.ts";
import {
    handlePromptAgentRequest,
    PromptAgentRuntimeRequestSchema,
} from "../services/prompt-agent-runtime.ts";

const POLLINATIONS_MCP_URL = "https://mcp.pollinations.ai";

function genBaseUrl(env: Env["Bindings"]): string {
    return (
        (env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
        "https://gen.pollinations.ai"
    );
}

export const agentRuntimeRoutes = new Hono<Env>()
    .use("*", auth({ allowSessionCookie: false, allowApiKey: true }))
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
            const mcpHeaders = row.mcpHeadersCiphertext
                ? parsePromptAgentMcpHeaders(
                      await decryptSecret(
                          row.mcpHeadersCiphertext,
                          c.env.BETTER_AUTH_SECRET,
                      ),
                  )
                : {};
            if (!mcpHeaders) {
                throw new Error(`Agent ${row.id} has invalid MCP credentials`);
            }
            return await handlePromptAgentRequest(body, c.req.raw.signal, {
                config,
                mcpHeaders,
                apiKey,
                genBaseUrl: genBaseUrl(c.env),
                pollinationsMcpUrl: POLLINATIONS_MCP_URL,
            });
        },
    );

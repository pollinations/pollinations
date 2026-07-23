import * as schema from "@shared/db/better-auth.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
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

export const agentRuntimeRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        if (
            c.req.header("Authorization") !== `Bearer ${c.env.PLN_ENTER_TOKEN}`
        ) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        await next();
    })
    .post("/v1/chat/completions", async (c) => {
        let body: RuntimeRequest;
        try {
            body = await c.req.json<RuntimeRequest>();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }
        if (typeof body.model !== "string") {
            throw new HTTPException(400, { message: "Agent ID is required" });
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
        const apiKey = await decryptSecret(
            row.apiKeyCiphertext,
            c.env.BETTER_AUTH_SECRET,
        );
        return await handlePromptAgentRequest(body, c.req.raw.signal, {
            config,
            apiKey,
            genBaseUrl: genBaseUrl(c.env),
        });
    });

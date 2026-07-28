import { validator } from "@shared/middleware/validator.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    AGENT_RUN_TOKEN_DEFAULT_TTL_SECONDS,
    AGENT_RUN_TOKEN_MAX_TTL_SECONDS,
    signAgentRunToken,
} from "../utils/agent-run-token.ts";

const CreateAgentRunTokenSchema = z.object({
    agent_id: z.string().trim().min(1).max(253),
    models: z.array(z.string().trim().min(1).max(253)).min(1).max(64),
    expires_in: z
        .number()
        .int()
        .min(30)
        .max(AGENT_RUN_TOKEN_MAX_TTL_SECONDS)
        .default(AGENT_RUN_TOKEN_DEFAULT_TTL_SECONDS),
});

const AgentRunTokenResponseSchema = z.object({
    access_token: z.string().startsWith("ag_"),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int(),
    run_id: z.string(),
    agent_id: z.string(),
    models: z.array(z.string()),
});

export const agentRunTokenRoutes = new Hono<Env>()
    .use("*", edgeRateLimit, auth())
    .post(
        "/run-token",
        describeRoute({
            tags: ["Authentication"],
            summary: "Create Agent Run Token",
            description:
                "Creates a short-lived generation credential for one agent run. Requests made with the returned token are billed to the parent API key and can use only the selected built-in models. Agent run tokens cannot mint nested tokens.",
            responses: {
                200: {
                    description: "Agent run token created",
                    content: {
                        "application/json": {
                            schema: resolver(AgentRunTokenResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 403, 429, 500),
            },
        }),
        validator("json", CreateAgentRunTokenSchema),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const parentApiKey = c.var.auth.apiKey;
            if (!parentApiKey) throw new HTTPException(401);
            if (c.var.auth.agentRun) {
                throw new HTTPException(403, {
                    message: "Agent run tokens cannot create nested tokens",
                });
            }

            const body = c.req.valid("json");
            const registry = await getGenerationModelRegistry(c.env);
            const parentModels = parentApiKey.permissions?.models;
            const models: string[] = [];

            for (const requestedModel of body.models) {
                const entry = registry.resolve(requestedModel);
                if (!entry || entry.communityEndpoint) {
                    throw new HTTPException(400, {
                        message: `Model '${requestedModel}' is not available for agent run tokens`,
                    });
                }
                if (parentModels && !parentModels.includes(entry.id)) {
                    throw new HTTPException(403, {
                        message: `Model '${requestedModel}' is not allowed for this API key`,
                    });
                }
                if (!models.includes(entry.id)) models.push(entry.id);
            }

            const runId = crypto.randomUUID();
            const token = await signAgentRunToken({
                secret: c.env.BETTER_AUTH_SECRET,
                parentApiKeyId: parentApiKey.id,
                agentId: body.agent_id,
                runId,
                models,
                expiresIn: body.expires_in,
            });

            c.header("Cache-Control", "no-store");
            return c.json({
                access_token: token,
                token_type: "Bearer" as const,
                expires_in: body.expires_in,
                run_id: runId,
                agent_id: body.agent_id,
                models,
            });
        },
    );

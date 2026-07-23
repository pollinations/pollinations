import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { decryptSecret, encryptSecret } from "@shared/secret-encryption.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    buildPromptAgentDeploy,
    PromptAgentSchema,
    parsePromptAgentConfig,
    promptAgentConfigBindings,
    serializePromptAgentConfig,
} from "../services/prompt-agent.ts";
import { PROMPT_AGENT_TEMPLATE_SOURCE } from "../services/prompt-agent-template.ts";
import {
    agentWorkerScriptName,
    deleteAgentWorker,
    deployAgentWorker,
    requireWorkerDeployConfig,
} from "../services/worker-deploy.ts";
import { requireAccountKeysPermission } from "./account-permissions.ts";

const AgentNameSchema = z.string().trim().min(1).max(120);
const CreateAgentSchema = z.object({
    name: AgentNameSchema,
    ...PromptAgentSchema.shape,
});
const UpdateAgentSchema = z
    .object({
        name: AgentNameSchema.optional(),
        systemPrompt: PromptAgentSchema.shape.systemPrompt.optional(),
        baseModel: PromptAgentSchema.shape.baseModel.optional(),
        mcpServers: PromptAgentSchema.shape.mcpServers.optional(),
    })
    .refine(
        (input) => Object.values(input).some((value) => value !== undefined),
        {
            message: "Provide at least one field to update",
        },
    );
const AgentResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    systemPrompt: z.string(),
    baseModel: z.string(),
    mcpServers: PromptAgentSchema.shape.mcpServers,
    baseUrl: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const AgentListResponseSchema = z.object({
    data: z.array(AgentResponseSchema),
});
const AgentDeleteResponseSchema = z.object({ id: z.string() });

type Db = ReturnType<typeof drizzle<typeof schema>>;
type AgentRow = typeof schema.agent.$inferSelect;

function genBaseUrl(env: Env["Bindings"]): string {
    return (
        (env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
        "https://gen.pollinations.ai"
    );
}

function toResponse(row: AgentRow) {
    const config = parsePromptAgentConfig(row.config);
    if (!config) throw new Error(`Agent ${row.id} has invalid configuration`);
    return {
        id: row.id,
        name: row.name,
        ...config,
        baseUrl: row.baseUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedAgent(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.agent.findFirst({
        where: and(
            eq(schema.agent.id, id),
            eq(schema.agent.ownerUserId, ownerUserId),
        ),
    });
    if (!row) {
        throw new HTTPException(404, { message: "Agent not found" });
    }
    return row;
}

async function ensureAgentNameAvailable(
    db: Db,
    ownerUserId: string,
    name: string,
    currentId?: string,
): Promise<void> {
    const existing = await db.query.agent.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.agent.ownerUserId, ownerUserId),
            eq(schema.agent.name, name),
        ),
    });
    if (!existing || existing.id === currentId) return;
    throw new HTTPException(400, { message: "Agent name is already in use" });
}

export const agentsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Agents",
            description:
                "List prompt agents owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Owned agents",
                    content: {
                        "application/json": {
                            schema: resolver(AgentListResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountKeysPermission(c.var.auth.apiKey);
            const db = drizzle(c.env.DB, { schema });
            const rows = await db.query.agent.findMany({
                where: eq(schema.agent.ownerUserId, user.id),
                orderBy: (agent, { desc }) => [desc(agent.createdAt)],
            });
            return c.json({ data: rows.map(toResponse) });
        },
    )
    .get(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Agent",
            description:
                "Get an agent owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Owned agent",
                    content: {
                        "application/json": {
                            schema: resolver(AgentResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Agent not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountKeysPermission(c.var.auth.apiKey);
            const db = drizzle(c.env.DB, { schema });
            return c.json(
                toResponse(
                    await requireOwnedAgent(db, c.req.param("id"), user.id),
                ),
            );
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create Agent",
            description:
                "Create and deploy an editable prompt agent. The agent can later be registered separately as a community model. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Created agent",
                    content: {
                        "application/json": {
                            schema: resolver(AgentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid agent configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateAgentSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            requireAccountKeysPermission(c.var.auth.apiKey);
            const db = drizzle(c.env.DB, { schema });
            await ensureAgentNameAvailable(db, user.id, input.name);
            const id = crypto.randomUUID();
            const config = PromptAgentSchema.parse(input);
            const deployment = await buildPromptAgentDeploy({
                authClient: c.var.auth.client,
                dbBinding: c.env.DB,
                userId: user.id,
                agentName: input.name,
                config,
                genBaseUrl: genBaseUrl(c.env),
            });
            const workerAuthToken = crypto.randomUUID().replaceAll("-", "");
            const deployConfig = requireWorkerDeployConfig(c.env);
            let workerDeployed = false;
            try {
                const baseUrl = await deployAgentWorker(
                    deployConfig,
                    agentWorkerScriptName(id),
                    deployment.source,
                    workerAuthToken,
                    deployment.extraBindings,
                );
                workerDeployed = true;
                const [row] = await db
                    .insert(schema.agent)
                    .values({
                        id,
                        ownerUserId: user.id,
                        name: input.name,
                        config: deployment.serializedConfig,
                        baseUrl,
                        bearerTokenCiphertext: await encryptSecret(
                            workerAuthToken,
                            c.env.BETTER_AUTH_SECRET,
                        ),
                        apiKeyId: deployment.keyId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .returning();
                return c.json(toResponse(row));
            } catch (error) {
                if (workerDeployed) {
                    await deleteAgentWorker(
                        deployConfig,
                        agentWorkerScriptName(id),
                    );
                }
                await db
                    .delete(schema.apikey)
                    .where(eq(schema.apikey.id, deployment.keyId));
                throw error;
            }
        },
    )
    .patch(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update Agent",
            description:
                "Update an agent and redeploy it at the same URL. Existing community model registration is unchanged. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Updated agent",
                    content: {
                        "application/json": {
                            schema: resolver(AgentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid agent configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Agent not found" },
            },
        }),
        validator("json", UpdateAgentSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            requireAccountKeysPermission(c.var.auth.apiKey);
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            const existing = await requireOwnedAgent(db, id, user.id);
            await ensureAgentNameAvailable(
                db,
                user.id,
                input.name ?? existing.name,
                id,
            );
            const currentConfig = parsePromptAgentConfig(existing.config);
            if (!currentConfig) {
                throw new Error(
                    `Agent ${existing.id} has invalid configuration`,
                );
            }
            const config = PromptAgentSchema.parse({
                systemPrompt: input.systemPrompt ?? currentConfig.systemPrompt,
                baseModel: input.baseModel ?? currentConfig.baseModel,
                mcpServers: input.mcpServers ?? currentConfig.mcpServers,
            });
            const serializedConfig = serializePromptAgentConfig(config);
            const configChanged = serializedConfig !== existing.config;
            let baseUrl = existing.baseUrl;
            if (configChanged) {
                const workerAuthToken = await decryptSecret(
                    existing.bearerTokenCiphertext,
                    c.env.BETTER_AUTH_SECRET,
                );
                baseUrl = await deployAgentWorker(
                    requireWorkerDeployConfig(c.env),
                    agentWorkerScriptName(id),
                    PROMPT_AGENT_TEMPLATE_SOURCE,
                    workerAuthToken,
                    promptAgentConfigBindings(config, genBaseUrl(c.env)),
                    ["POLLINATIONS_KEY"],
                );
            }
            const [row] = await db
                .update(schema.agent)
                .set({
                    name: input.name ?? existing.name,
                    config: serializedConfig,
                    baseUrl,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.agent.id, id),
                        eq(schema.agent.ownerUserId, user.id),
                    ),
                )
                .returning();
            return c.json(toResponse(row));
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete Agent",
            description:
                "Delete an unregistered agent. Delete its community model registration first if it is currently registered. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deleted agent",
                    content: {
                        "application/json": {
                            schema: resolver(AgentDeleteResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Agent not found" },
                409: { description: "Agent is still registered" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountKeysPermission(c.var.auth.apiKey);
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            const existing = await requireOwnedAgent(db, id, user.id);
            const registration = await db.query.communityEndpoint.findFirst({
                columns: { id: true },
                where: eq(schema.communityEndpoint.agentId, id),
            });
            if (registration) {
                throw new HTTPException(409, {
                    message:
                        "Delete the agent's community model registration first",
                });
            }
            await deleteAgentWorker(
                requireWorkerDeployConfig(c.env),
                agentWorkerScriptName(id),
            );
            await db
                .delete(schema.apikey)
                .where(eq(schema.apikey.id, existing.apiKeyId));
            await db
                .delete(schema.agent)
                .where(
                    and(
                        eq(schema.agent.id, id),
                        eq(schema.agent.ownerUserId, user.id),
                    ),
                );
            return c.json({ id });
        },
    );

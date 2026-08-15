import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    PromptAgentSchema,
    parsePromptAgentConfig,
    serializePromptAgentConfig,
} from "../services/prompt-agent.ts";
import { requireAccountPermission } from "./account-permissions.ts";

const CreateAgentSchema = PromptAgentSchema;
const UpdateAgentSchema = z
    .object({
        systemPrompt: PromptAgentSchema.shape.systemPrompt.optional(),
        baseModel: PromptAgentSchema.shape.baseModel.optional(),
        pollinationsTools:
            PromptAgentSchema.shape.pollinationsTools.removeDefault(),
        mcpServers: PromptAgentSchema.shape.mcpServers.removeDefault(),
    })
    .refine(
        (input) => Object.values(input).some((value) => value !== undefined),
        {
            message: "Provide at least one field to update",
        },
    );
const AgentResponseSchema = z.object({
    id: z.string(),
    systemPrompt: z.string(),
    baseModel: z.string(),
    pollinationsTools: z.boolean(),
    mcpServers: PromptAgentSchema.shape.mcpServers,
    createdAt: z.string(),
    updatedAt: z.string(),
});
const AgentListResponseSchema = z.object({
    data: z.array(AgentResponseSchema),
});
const AgentDeleteResponseSchema = z.object({ id: z.string() });

type Db = ReturnType<typeof drizzle<typeof schema>>;
type AgentRow = typeof schema.agent.$inferSelect;

function toResponse(row: AgentRow) {
    const config = parsePromptAgentConfig(row.config);
    if (!config) throw new Error(`Agent ${row.id} has invalid configuration`);
    return {
        id: row.id,
        ...config,
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
                "Create an editable prompt agent. The agent can later be registered separately as a community model. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = crypto.randomUUID();
            const config = PromptAgentSchema.parse(input);
            const [row] = await db
                .insert(schema.agent)
                .values({
                    id,
                    ownerUserId: user.id,
                    config: serializePromptAgentConfig(config),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(toResponse(row));
        },
    )
    .patch(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update Agent",
            description:
                "Update an agent. Existing community model registration is unchanged. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            const existing = await requireOwnedAgent(db, id, user.id);
            const currentConfig = parsePromptAgentConfig(existing.config);
            if (!currentConfig) {
                throw new Error(
                    `Agent ${existing.id} has invalid configuration`,
                );
            }
            const config = PromptAgentSchema.parse({
                systemPrompt: input.systemPrompt ?? currentConfig.systemPrompt,
                baseModel: input.baseModel ?? currentConfig.baseModel,
                pollinationsTools:
                    input.pollinationsTools ?? currentConfig.pollinationsTools,
                mcpServers: input.mcpServers ?? currentConfig.mcpServers,
            });
            const serializedConfig = serializePromptAgentConfig(config);
            const [row] = await db
                .update(schema.agent)
                .set({
                    config: serializedConfig,
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            await requireOwnedAgent(db, id, user.id);
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

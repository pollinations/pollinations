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
    McpServerResponseSchema,
    type PromptAgentConfig,
    type PromptAgentInput,
    PromptAgentInputSchema,
    type PromptAgentMcpHeaders,
    PromptAgentSchema,
    parsePromptAgentConfig,
    parsePromptAgentMcpHeaders,
    serializePromptAgentConfig,
} from "../services/prompt-agent.ts";
import { requireAccountPermission } from "./account-permissions.ts";

const CreateAgentSchema = PromptAgentInputSchema;
const UpdateAgentSchema = PromptAgentInputSchema;
const AgentResponseSchema = z.object({
    id: z.string(),
    systemPrompt: z.string(),
    baseModel: z.string(),
    pollinationsTools: z.boolean(),
    mcpServers: z.array(McpServerResponseSchema),
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
        mcpServers: config.mcpServers.map((server) => ({
            name: server.name,
            url: server.url,
            headers: Object.fromEntries(
                server.headers.map((name) => [name, null]),
            ),
        })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function savedHeaderValue(
    headers: Record<string, string> | undefined,
    name: string,
): string | undefined {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers ?? {}).find(
        ([savedName]) => savedName.toLowerCase() === normalizedName,
    )?.[1];
}

function resolveMcpServers(
    servers: PromptAgentInput["mcpServers"],
    currentServers: PromptAgentConfig["mcpServers"] = [],
    currentHeaders: PromptAgentMcpHeaders = {},
): {
    mcpServers: PromptAgentConfig["mcpServers"];
    mcpHeaders: PromptAgentMcpHeaders;
} {
    const mcpHeaders: PromptAgentMcpHeaders = {};
    const mcpServers = servers.map((server, index) => {
        const currentServer =
            currentServers.find(
                (candidate) => candidate.name === server.name,
            ) ??
            currentServers.find((candidate) => candidate.url === server.url) ??
            currentServers[index];
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(server.headers)) {
            const resolved =
                value ??
                savedHeaderValue(
                    currentServer
                        ? currentHeaders[currentServer.name]
                        : undefined,
                    name,
                );
            if (resolved === undefined) {
                throw new HTTPException(400, {
                    message: `MCP header "${name}" for server "${server.name}" needs a value`,
                });
            }
            headers[name] = resolved;
        }
        if (Object.keys(headers).length > 0) {
            mcpHeaders[server.name] = headers;
        }
        return {
            name: server.name,
            url: server.url,
            headers: Object.keys(headers),
        };
    });
    return { mcpServers, mcpHeaders };
}

async function encryptedMcpHeaders(
    headers: PromptAgentMcpHeaders,
    secret: string,
): Promise<string | null> {
    if (Object.keys(headers).length === 0) return null;
    return encryptSecret(JSON.stringify(headers), secret);
}

async function storedMcpHeaders(
    row: AgentRow,
    secret: string,
): Promise<PromptAgentMcpHeaders> {
    if (!row.mcpHeadersCiphertext) return {};
    const headers = parsePromptAgentMcpHeaders(
        await decryptSecret(row.mcpHeadersCiphertext, secret),
    );
    if (!headers) {
        throw new Error(`Agent ${row.id} has invalid MCP header credentials`);
    }
    return headers;
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
                "Create an editable prompt agent. MCP header values are encrypted and never returned. The agent can later be registered separately as a community model. API keys require `account:keys`.",
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
            const { mcpServers, mcpHeaders } = resolveMcpServers(
                input.mcpServers,
            );
            const config = PromptAgentSchema.parse({ ...input, mcpServers });
            const [row] = await db
                .insert(schema.agent)
                .values({
                    id,
                    ownerUserId: user.id,
                    config: serializePromptAgentConfig(config),
                    mcpHeadersCiphertext: await encryptedMcpHeaders(
                        mcpHeaders,
                        c.env.BETTER_AUTH_SECRET,
                    ),
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
                "Replace an agent configuration. Null MCP header values keep the saved value in the same server row. Omitted tools and servers are removed. Existing community model registration is unchanged. API keys require `account:keys`.",
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
            const resolvedMcp = resolveMcpServers(
                input.mcpServers,
                currentConfig.mcpServers,
                await storedMcpHeaders(existing, c.env.BETTER_AUTH_SECRET),
            );
            const config = PromptAgentSchema.parse({
                ...input,
                mcpServers: resolvedMcp.mcpServers,
            });
            const serializedConfig = serializePromptAgentConfig(config);
            const update: Partial<typeof schema.agent.$inferInsert> = {
                config: serializedConfig,
                mcpHeadersCiphertext: await encryptedMcpHeaders(
                    resolvedMcp.mcpHeaders,
                    c.env.BETTER_AUTH_SECRET,
                ),
                updatedAt: new Date(),
            };
            const [row] = await db
                .update(schema.agent)
                .set(update)
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
                "Delete an agent and its community model registration. API keys require `account:keys`.",
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
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            await requireOwnedAgent(db, id, user.id);
            await db.batch([
                db
                    .delete(schema.communityEndpoint)
                    .where(
                        and(
                            eq(schema.communityEndpoint.agentId, id),
                            eq(schema.communityEndpoint.ownerUserId, user.id),
                        ),
                    ),
                db
                    .delete(schema.agent)
                    .where(
                        and(
                            eq(schema.agent.id, id),
                            eq(schema.agent.ownerUserId, user.id),
                        ),
                    ),
            ]);
            return c.json({ id });
        },
    );

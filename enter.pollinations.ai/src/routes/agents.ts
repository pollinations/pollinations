import {
    CODE_AGENT_BASE_URL_PLACEHOLDER,
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    CodeAgentConfigSchema,
    CodeAgentInputSchema,
    isCommunityEndpointOwnerAllowed,
    PROMPT_AGENT_BASE_URL_PLACEHOLDER,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    deleteCodeAgent,
    deployCodeAgent,
    loadCodeAgentSource,
    resolveCodeAgentRepository,
} from "../services/code-agent.ts";
import {
    BuiltinMcpServerIdSchema,
    PromptAgentInputSchema,
    serializePromptAgentConfig,
} from "../services/prompt-agent.ts";
import { requireAccountPermission } from "./account-permissions.ts";
import { RequiredSafetyFeaturesSchema } from "./community-endpoints/schemas.ts";

const ListingFieldsSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(
            /^[A-Za-z0-9._:-]+$/,
            "Model name may only contain letters, numbers, periods, underscores, colons, and hyphens",
        ),
    title: z.string().trim().min(1).max(COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH),
    description: z
        .string()
        .trim()
        .max(COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH),
    visibility: z.enum(COMMUNITY_ENDPOINT_VISIBILITIES),
});

const CreateListingFieldsSchema = ListingFieldsSchema.extend({
    description: ListingFieldsSchema.shape.description.optional().default(""),
    visibility: ListingFieldsSchema.shape.visibility
        .optional()
        .default("private"),
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional().default([]),
});
const UpdateListingFieldsSchema = z.object({
    name: ListingFieldsSchema.shape.name.optional(),
    title: ListingFieldsSchema.shape.title.optional(),
    description: ListingFieldsSchema.shape.description.optional(),
    visibility: ListingFieldsSchema.shape.visibility.optional(),
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional(),
});

const CreatePromptAgentSchema = PromptAgentInputSchema.extend({
    ...CreateListingFieldsSchema.shape,
    type: z.literal("prompt_agent").optional().default("prompt_agent"),
}).strict();
const CreateCodeAgentSchema = CodeAgentInputSchema.extend({
    type: z.literal("code_agent"),
    visibility: ListingFieldsSchema.shape.visibility
        .optional()
        .default("private"),
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional().default([]),
}).strict();
const CreateAgentSchema = z.union([
    CreateCodeAgentSchema,
    CreatePromptAgentSchema,
]);
const UpdatePromptAgentSchema = PromptAgentInputSchema.extend(
    UpdateListingFieldsSchema.shape,
).strict();
const UpdateCodeAgentSchema = z
    .object({
        visibility: ListingFieldsSchema.shape.visibility.optional(),
        requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional(),
    })
    .strict();
const UpdateAgentEnvelopeSchema = z
    .object({
        ...UpdateListingFieldsSchema.shape,
        systemPrompt: z.unknown().optional(),
        baseModel: z.unknown().optional(),
        mcpServers: z.unknown().optional(),
    })
    .strict();

const AgentResponseBaseSchema = z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(COMMUNITY_ENDPOINT_VISIBILITIES),
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
});
const AgentResponseSchema = z.discriminatedUnion("type", [
    AgentResponseBaseSchema.extend({
        type: z.literal("prompt_agent"),
        systemPrompt: z.string(),
        baseModel: z.string(),
        mcpServers: z.array(BuiltinMcpServerIdSchema),
    }),
    AgentResponseBaseSchema.extend({
        type: z.literal("code_agent"),
        ...CodeAgentConfigSchema.shape,
    }),
]);
const AgentListResponseSchema = z.object({
    data: z.array(AgentResponseSchema),
});
const AgentDeleteResponseSchema = z.object({ id: z.string() });
const CodeAgentSyncResponseSchema = z.object({
    updated: z.boolean(),
    deployedCommitSha: z.string(),
});

type Db = ReturnType<typeof drizzle<typeof schema>>;
type AgentRow = typeof schema.communityEndpoint.$inferSelect;

function toResponse(row: AgentRow) {
    if (row.type !== "prompt_agent" && row.type !== "code_agent") {
        throw new Error(`Listing ${row.id} is not a managed agent`);
    }
    const config = parseListingPayload(row.type, row.payload);
    if (!config) throw new Error(`Agent ${row.id} has invalid configuration`);
    return {
        id: row.id,
        name: row.name,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        type: row.type,
        ...config,
        requiredSafetyFeatures: row.requiredSafetyFeatures,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedAgent(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, id),
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            inArray(schema.communityEndpoint.type, [
                "prompt_agent",
                "code_agent",
            ]),
        ),
    });
    if (!row) throw new HTTPException(404, { message: "Agent not found" });
    return row;
}

const CODE_AGENT_SYNC_THROTTLE_SECONDS = 30;

function codeAgentListingFields(repository: {
    name: string;
    description: string | null;
}) {
    return {
        name: repository.name.toLowerCase(),
        title: repository.name.slice(0, COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH),
        description:
            repository.description
                ?.trim()
                .slice(0, COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH) || null,
    };
}

async function syncCodeAgent(c: Context<Env>, id: string) {
    const db = drizzle(c.env.DB, { schema });
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, id),
            eq(schema.communityEndpoint.type, "code_agent"),
        ),
    });
    if (!row) throw new HTTPException(404, { message: "Agent not found" });
    const config = parseListingPayload("code_agent", row.payload);
    if (!config) {
        throw new Error(`Agent ${id} has invalid configuration`);
    }

    const throttleKey = `code-agent-sync:throttle:${id}`;
    const now = Date.now();
    const throttleUntil = Number(await c.env.KV.get(throttleKey));
    if (Number.isFinite(throttleUntil) && throttleUntil > now) {
        throw new HTTPException(429, {
            message: "Agent sync is limited to once every 30 seconds",
        });
    }
    await c.env.KV.put(
        throttleKey,
        String(now + CODE_AGENT_SYNC_THROTTLE_SECONDS * 1000),
        { expirationTtl: 60 },
    );

    const repository = await resolveCodeAgentRepository(
        c.env,
        config.repository,
    );
    const { deployedCommitSha } = repository;
    const listing = codeAgentListingFields(repository);
    const metadataChanged =
        listing.title !== row.title ||
        listing.description !== row.description ||
        repository.repository !== config.repository;
    if (deployedCommitSha === config.deployedCommitSha && !metadataChanged) {
        return {
            updated: false,
            deployedCommitSha,
        };
    }
    if (deployedCommitSha !== config.deployedCommitSha) {
        const source = await loadCodeAgentSource(
            repository.repository,
            deployedCommitSha,
        );
        await deployCodeAgent(c.env, id, source);
    }
    await db
        .update(schema.communityEndpoint)
        .set({
            title: listing.title,
            description: listing.description,
            payload: JSON.stringify({
                ...config,
                repository: repository.repository,
                deployedCommitSha,
            }),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(schema.communityEndpoint.id, id),
                eq(schema.communityEndpoint.type, "code_agent"),
            ),
        );
    return { updated: true, deployedCommitSha };
}

async function requireAgentWriteAccess(
    db: Db,
    ownerUserId: string,
    name: string,
    visibility: "private" | "public",
    currentId?: string,
) {
    const owner = await db.query.user.findFirst({
        columns: { githubId: true, githubUsername: true },
        where: eq(schema.user.id, ownerUserId),
    });
    // Old standalone agents could exist before an owner linked GitHub. Keep
    // those preserved private rows editable after migration; creating a new
    // callable listing or publishing still requires a stable owner slug.
    if (!owner?.githubUsername && (!currentId || visibility === "public")) {
        throw new HTTPException(400, {
            message:
                "A GitHub username is required to create or publish an agent",
        });
    }
    if (visibility === "public" && !isCommunityEndpointOwnerAllowed(owner)) {
        throw new HTTPException(403, {
            message:
                "Community model publishing requires approval. Agents can stay private for your own use.",
        });
    }
    const existing = await db.query.communityEndpoint.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            eq(schema.communityEndpoint.name, name),
        ),
    });
    if (existing && existing.id !== currentId) {
        throw new HTTPException(400, {
            message: "Community model name is already registered",
        });
    }
}

export const agentsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "List Agents",
            description:
                "List managed agents owned by the authenticated account. API keys require `account:keys`.",
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
            const rows = await db.query.communityEndpoint.findMany({
                where: and(
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                    inArray(schema.communityEndpoint.type, [
                        "prompt_agent",
                        "code_agent",
                    ]),
                ),
                orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
            });
            return c.json({
                data: rows.map(toResponse),
            });
        },
    )
    .get(
        "/:id",
        describeRoute({
            tags: ["🤖 Community Agents"],
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
            tags: ["🤖 Community Agents"],
            summary: "Create Agent",
            description:
                "Create a prompt agent or deploy `agent.js` from a public GitHub repository. Code-agent identity comes from the repository, and public visibility requires community publisher access. Code agents export a default function accepting `{ request, pollinations, mcp }` and return an OpenAI Responses-compatible Response. API keys require `account:keys`.",
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
            let payload: string;
            let listing: {
                name: string;
                title: string;
                description: string | null;
            };
            if (input.type === "code_agent") {
                const repository = await resolveCodeAgentRepository(
                    c.env,
                    input.repository,
                );
                const { deployedCommitSha } = repository;
                listing = codeAgentListingFields(repository);
                await requireAgentWriteAccess(
                    db,
                    user.id,
                    listing.name,
                    input.visibility,
                );
                const source = await loadCodeAgentSource(
                    repository.repository,
                    deployedCommitSha,
                );
                await deployCodeAgent(c.env, id, source);
                payload = JSON.stringify({
                    repository: repository.repository,
                    deployedCommitSha,
                });
            } else {
                listing = {
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                };
                await requireAgentWriteAccess(
                    db,
                    user.id,
                    listing.name,
                    input.visibility,
                );
                payload = serializePromptAgentConfig(input);
            }
            let row: AgentRow;
            try {
                [row] = await db
                    .insert(schema.communityEndpoint)
                    .values({
                        id,
                        ownerUserId: user.id,
                        name: listing.name,
                        title: listing.title,
                        description: listing.description,
                        type: input.type,
                        baseUrl:
                            input.type === "code_agent"
                                ? CODE_AGENT_BASE_URL_PLACEHOLDER
                                : PROMPT_AGENT_BASE_URL_PLACEHOLDER,
                        upstreamModel: id,
                        requiredSafetyFeatures: input.requiredSafetyFeatures,
                        payload,
                        visibility: input.visibility,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .returning();
            } catch (error) {
                if (input.type === "code_agent") {
                    await deleteCodeAgent(c.env, id).catch(() => undefined);
                }
                throw error;
            }
            return c.json(toResponse(row));
        },
    )
    .patch(
        "/:id",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "Update Agent",
            description:
                "Update a prompt agent's configuration or a code agent's visibility and safety policy. A code agent's identity and repository are fixed after creation. API keys require `account:keys`.",
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
        validator("json", UpdateAgentEnvelopeSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            const stored = await requireOwnedAgent(db, id, user.id);
            let name = stored.name;
            let title = stored.title;
            let description = stored.description;
            let visibility = stored.visibility;
            let requiredSafetyFeatures = stored.requiredSafetyFeatures;
            let nextPayload: string;
            if (stored.type === "code_agent") {
                const update = UpdateCodeAgentSchema.safeParse(input);
                const config = parseListingPayload(
                    "code_agent",
                    stored.payload,
                );
                if (!update.success) {
                    throw new HTTPException(400, {
                        message: update.error.issues[0]?.message,
                    });
                }
                if (!config) {
                    throw new Error(`Agent ${id} has invalid configuration`);
                }
                visibility = update.data.visibility ?? visibility;
                requiredSafetyFeatures =
                    update.data.requiredSafetyFeatures ??
                    requiredSafetyFeatures;
                nextPayload = stored.payload;
            } else {
                const update = UpdatePromptAgentSchema.safeParse(input);
                const config = parseListingPayload(
                    "prompt_agent",
                    stored.payload,
                );
                if (!update.success) {
                    throw new HTTPException(400, {
                        message: update.error.issues[0]?.message,
                    });
                }
                if (!config) {
                    throw new Error(`Agent ${id} has invalid configuration`);
                }
                name = update.data.name ?? name;
                title = update.data.title ?? title;
                description =
                    update.data.description === undefined
                        ? description
                        : update.data.description || null;
                visibility = update.data.visibility ?? visibility;
                requiredSafetyFeatures =
                    update.data.requiredSafetyFeatures ??
                    requiredSafetyFeatures;
                nextPayload = serializePromptAgentConfig({
                    systemPrompt:
                        update.data.systemPrompt ?? config.systemPrompt,
                    baseModel: update.data.baseModel ?? config.baseModel,
                    mcpServers: update.data.mcpServers ?? config.mcpServers,
                });
            }
            await requireAgentWriteAccess(db, user.id, name, visibility, id);
            const [row] = await db
                .update(schema.communityEndpoint)
                .set({
                    name,
                    title,
                    description,
                    visibility,
                    requiredSafetyFeatures,
                    payload: nextPayload,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                        eq(schema.communityEndpoint.type, stored.type),
                    ),
                )
                .returning();
            return c.json(toResponse(row));
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "Delete Agent",
            description:
                "Delete an agent and its model listing. API keys require `account:keys`.",
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
            const stored = await requireOwnedAgent(db, id, user.id);
            await db
                .delete(schema.communityEndpoint)
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                        eq(schema.communityEndpoint.type, stored.type),
                    ),
                );
            if (stored.type === "code_agent") {
                await deleteCodeAgent(c.env, id).catch((error) => {
                    console.error("Failed to remove code agent Worker", error);
                });
            }
            return c.json({ id });
        },
    );

export const publicAgentSyncRoutes = new Hono<Env>().post(
    "/:id/sync",
    describeRoute({
        tags: ["🤖 Community Agents"],
        summary: "Sync Code Agent",
        description:
            "Deploy the latest `agent.js` revision from a code agent's configured public GitHub repository. The repository binding cannot be changed through this unauthenticated trigger.",
        responses: {
            200: {
                description: "Agent synchronized",
                content: {
                    "application/json": {
                        schema: resolver(CodeAgentSyncResponseSchema),
                    },
                },
            },
            404: { description: "Code agent not found" },
            429: { description: "Sync rate limited" },
        },
    }),
    async (c) => c.json(await syncCodeAgent(c, c.req.param("id"))),
);

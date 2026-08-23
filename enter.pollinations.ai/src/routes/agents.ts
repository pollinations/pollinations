import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    isCommunityEndpointOwnerAllowed,
    PROMPT_AGENT_BASE_URL_PLACEHOLDER,
    PromptAgentGitHubSourceInputSchema,
    PromptAgentGitHubSourceSchema,
} from "@shared/community-endpoints.ts";
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
    agentRuntimeBaseUrl,
    BuiltinMcpServerIdSchema,
    PromptAgentInputSchema,
    parsePromptAgentListing,
    serializePromptAgentListing,
} from "../services/prompt-agent.ts";
import { importPromptAgentFromGitHub } from "../services/prompt-agent-github.ts";
import { requireAccountPermission } from "./account-permissions.ts";

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
});
const CreateInlineAgentSchema = PromptAgentInputSchema.extend(
    CreateListingFieldsSchema.shape,
).strict();
const CreateGitHubAgentSchema = CreateListingFieldsSchema.extend({
    source: PromptAgentGitHubSourceInputSchema,
}).strict();
const CreateAgentSchema = z.union([
    CreateInlineAgentSchema,
    CreateGitHubAgentSchema,
]);
const UpdateAgentSchema = z
    .object({
        systemPrompt: PromptAgentInputSchema.shape.systemPrompt.optional(),
        baseModel: PromptAgentInputSchema.shape.baseModel.optional(),
        mcpServers: z.array(BuiltinMcpServerIdSchema).max(1).optional(),
        source: PromptAgentGitHubSourceInputSchema.optional(),
        name: ListingFieldsSchema.shape.name.optional(),
        title: ListingFieldsSchema.shape.title.optional(),
        description: ListingFieldsSchema.shape.description.optional(),
        visibility: ListingFieldsSchema.shape.visibility.optional(),
    })
    .strict()
    .superRefine((input, ctx) => {
        const hasInlineConfig =
            input.systemPrompt !== undefined ||
            input.baseModel !== undefined ||
            input.mcpServers !== undefined;
        if (
            hasInlineConfig &&
            (input.systemPrompt === undefined || input.baseModel === undefined)
        ) {
            ctx.addIssue({
                code: "custom",
                message:
                    "systemPrompt and baseModel are both required when replacing inline configuration",
            });
        }
        if (hasInlineConfig && input.source) {
            ctx.addIssue({
                code: "custom",
                message:
                    "Provide either inline configuration or a GitHub source, not both",
            });
        }
        if (Object.keys(input).length === 0) {
            ctx.addIssue({ code: "custom", message: "No updates provided" });
        }
    });
const AgentResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(COMMUNITY_ENDPOINT_VISIBILITIES),
    baseUrl: z.string().url(),
    upstreamModel: z.string(),
    systemPrompt: z.string(),
    baseModel: z.string(),
    mcpServers: z.array(BuiltinMcpServerIdSchema),
    source: PromptAgentGitHubSourceSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const AgentListResponseSchema = z.object({
    data: z.array(AgentResponseSchema),
});
const AgentDeleteResponseSchema = z.object({ id: z.string() });

type Db = ReturnType<typeof drizzle<typeof schema>>;
type AgentRow = typeof schema.communityEndpoint.$inferSelect;

function promptConfigFromInput(input: {
    systemPrompt?: string;
    baseModel?: string;
    mcpServers?: "pollinations"[];
}) {
    return PromptAgentInputSchema.parse({
        systemPrompt: input.systemPrompt,
        baseModel: input.baseModel,
        mcpServers: input.mcpServers,
    });
}

function requireOwnerGithubId(owner: { githubId: number | null } | undefined) {
    if (!owner?.githubId) {
        throw new HTTPException(400, {
            message: "A linked GitHub account is required",
        });
    }
    return owner.githubId;
}

function toResponse(row: AgentRow, baseUrl: string) {
    const listing = parsePromptAgentListing(row.payload);
    if (!listing) throw new Error(`Agent ${row.id} has invalid configuration`);
    const { source = null, ...config } = listing;
    return {
        id: row.id,
        name: row.name,
        title: row.title ?? row.name,
        description: row.description,
        visibility: row.visibility,
        baseUrl,
        upstreamModel: row.upstreamModel,
        ...config,
        source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedAgent(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, id),
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            eq(schema.communityEndpoint.type, "prompt_agent"),
        ),
    });
    if (!row) throw new HTTPException(404, { message: "Agent not found" });
    return row;
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
    return owner;
}

async function requireGitHubAccessToken(db: Db, ownerUserId: string) {
    const githubAccount = await db.query.account.findFirst({
        columns: { accessToken: true, accessTokenExpiresAt: true },
        where: and(
            eq(schema.account.userId, ownerUserId),
            eq(schema.account.providerId, "github"),
        ),
    });
    if (
        !githubAccount?.accessToken ||
        (githubAccount.accessTokenExpiresAt &&
            githubAccount.accessTokenExpiresAt <= new Date())
    ) {
        throw new HTTPException(400, {
            message:
                "GitHub authorization is unavailable. Sign out and reconnect GitHub, then try again.",
        });
    }
    return githubAccount.accessToken;
}

export const agentsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["🤖 Community Agents"],
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
            const rows = await db.query.communityEndpoint.findMany({
                where: and(
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                    eq(schema.communityEndpoint.type, "prompt_agent"),
                ),
                orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
            });
            return c.json({
                data: rows.map((row) =>
                    toResponse(row, agentRuntimeBaseUrl(c.env)),
                ),
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
                    agentRuntimeBaseUrl(c.env),
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
                "Create and list a prompt agent in one operation. API keys require `account:keys`.",
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
            const owner = await requireAgentWriteAccess(
                db,
                user.id,
                input.name,
                input.visibility,
            );
            if (input.visibility === "public" && !("source" in input)) {
                throw new HTTPException(400, {
                    message: "Public agents require a GitHub source repository",
                });
            }
            if (input.visibility !== "public" && "source" in input) {
                throw new HTTPException(400, {
                    message: "GitHub-backed agents must be public",
                });
            }
            const imported =
                "source" in input
                    ? await importPromptAgentFromGitHub(
                          input.source,
                          requireOwnerGithubId(owner),
                          await requireGitHubAccessToken(db, user.id),
                      )
                    : null;
            const config = imported ?? {
                config: promptConfigFromInput(input),
                source: undefined,
            };
            const id = crypto.randomUUID();
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id,
                    ownerUserId: user.id,
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                    type: "prompt_agent",
                    baseUrl: PROMPT_AGENT_BASE_URL_PLACEHOLDER,
                    upstreamModel: id,
                    payload: serializePromptAgentListing(
                        config.config,
                        config.source,
                    ),
                    visibility: input.visibility,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(toResponse(row, agentRuntimeBaseUrl(c.env)));
        },
    )
    .patch(
        "/:id",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "Update Agent",
            description:
                "Replace an agent configuration and listing in one operation. API keys require `account:keys`.",
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
            const stored = await requireOwnedAgent(db, id, user.id);
            const storedListing = parsePromptAgentListing(stored.payload);
            if (!storedListing) {
                throw new HTTPException(500, {
                    message: "Stored agent configuration is invalid",
                });
            }
            const name = input.name ?? stored.name;
            const visibility = input.visibility ?? stored.visibility;
            const owner = await requireAgentWriteAccess(
                db,
                user.id,
                name,
                visibility,
                id,
            );
            const hasInlineConfig =
                input.systemPrompt !== undefined ||
                input.baseModel !== undefined ||
                input.mcpServers !== undefined;
            if (input.source && visibility !== "public") {
                throw new HTTPException(400, {
                    message: "GitHub-backed agents must be public",
                });
            }
            const imported = input.source
                ? await importPromptAgentFromGitHub(
                      input.source,
                      requireOwnerGithubId(owner),
                      await requireGitHubAccessToken(db, user.id),
                  )
                : null;
            const nextConfig = imported
                ? imported.config
                : hasInlineConfig
                  ? promptConfigFromInput(input)
                  : storedListing;
            const nextSource = imported
                ? imported.source
                : hasInlineConfig || visibility === "private"
                  ? undefined
                  : storedListing.source;
            if (visibility === "public" && !nextSource) {
                throw new HTTPException(400, {
                    message: "Public agents require a GitHub source repository",
                });
            }
            const [row] = await db
                .update(schema.communityEndpoint)
                .set({
                    name,
                    title: input.title ?? stored.title,
                    description:
                        input.description === undefined
                            ? stored.description
                            : input.description || null,
                    visibility,
                    payload: serializePromptAgentListing(
                        nextConfig,
                        nextSource,
                    ),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                        eq(schema.communityEndpoint.type, "prompt_agent"),
                    ),
                )
                .returning();
            return c.json(toResponse(row, agentRuntimeBaseUrl(c.env)));
        },
    )
    .post(
        "/:id/sync",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "Sync Agent from GitHub",
            description:
                "Import the current default-branch manifest from an agent's public GitHub source. The previous valid snapshot remains active if synchronization fails. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Synchronized agent",
                    content: {
                        "application/json": {
                            schema: resolver(AgentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid GitHub source or manifest" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Agent not found" },
                502: { description: "GitHub request failed" },
                503: { description: "GitHub rate limit reached" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const db = drizzle(c.env.DB, { schema });
            const id = c.req.param("id");
            const stored = await requireOwnedAgent(db, id, user.id);
            const listing = parsePromptAgentListing(stored.payload);
            if (!listing?.source) {
                throw new HTTPException(400, {
                    message: "Agent does not have a GitHub source",
                });
            }
            const owner = await db.query.user.findFirst({
                columns: { githubId: true },
                where: eq(schema.user.id, user.id),
            });
            const imported = await importPromptAgentFromGitHub(
                {
                    repositoryUrl: listing.source.repositoryUrl,
                    manifestPath: listing.source.manifestPath,
                },
                requireOwnerGithubId(owner),
                await requireGitHubAccessToken(db, user.id),
            );
            const [row] = await db
                .update(schema.communityEndpoint)
                .set({
                    payload: serializePromptAgentListing(
                        imported.config,
                        imported.source,
                    ),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                        eq(schema.communityEndpoint.type, "prompt_agent"),
                    ),
                )
                .returning();
            return c.json(toResponse(row, agentRuntimeBaseUrl(c.env)));
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
            await requireOwnedAgent(db, id, user.id);
            await db
                .delete(schema.communityEndpoint)
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                        eq(schema.communityEndpoint.type, "prompt_agent"),
                    ),
                );
            return c.json({ id });
        },
    );

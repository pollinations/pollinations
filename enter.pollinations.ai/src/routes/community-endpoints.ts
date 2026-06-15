import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    COMMUNITY_ENDPOINT_TIER_GATE_ENABLED,
    type CommunityEndpointAllowlistEnv,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    canManageCommunityEndpoints,
    communityEndpointPrices,
    communityModelId,
    isCommunityEndpointOwnerAllowed,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { decryptSecret, encryptSecret } from "@shared/secret-encryption.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    listCommunityEndpointModels,
    testCommunityEndpoint,
} from "../services/community-endpoint-openai.ts";

const PriceSchema = z.number().finite().min(0);
const PriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional().default(0),
    ]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;

const EndpointFieldsSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(240).optional(),
    baseUrl: z.string().url(),
    upstreamModel: z.string().trim().min(1).max(253).optional(),
    bearerToken: z.string().min(1),
    ...PriceFieldsSchema,
    contextLength: z.number().int().positive().nullable().optional(),
});

const CreateEndpointSchema = EndpointFieldsSchema.refine(
    hasPositivePrice,
    "At least one price must be greater than 0",
);

const UpdateEndpointSchema = EndpointFieldsSchema.partial();
const ModelListSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().optional(),
});
const TestEndpointSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().min(1),
    model: z.string().trim().min(1).max(253),
});
const SavedEndpointTestSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().optional(),
    model: z.string().trim().min(1).max(253),
});
type Db = ReturnType<typeof drizzle<typeof schema>>;
type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

function hasPositivePrice(value: Partial<CommunityEndpointPrices>): boolean {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.some(
        (field) => (value[field.key] ?? 0) > 0,
    );
}

function normalizeInputBaseUrl(value: string): string {
    try {
        return normalizeCommunityEndpointBaseUrl(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error ? error.message : "Invalid endpoint URL",
        });
    }
}

function normalizeInputBearerToken(value: string): string {
    try {
        return normalizeCommunityEndpointBearerToken(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error
                    ? error.message
                    : "Invalid API bearer token",
        });
    }
}

async function requireCommunityEndpointAccess(
    db: Db,
    env: CommunityEndpointAllowlistEnv,
    userId: string,
): Promise<void> {
    const user = await db.query.user.findFirst({
        columns: { githubId: true, tier: true },
        where: eq(schema.user.id, userId),
    });

    if (!isCommunityEndpointOwnerAllowed(env, user)) {
        throw new HTTPException(403, {
            message: "Community endpoints are invite-only",
        });
    }

    if (!COMMUNITY_ENDPOINT_TIER_GATE_ENABLED) return;
    if (canManageCommunityEndpoints(user?.tier)) return;
    throw new HTTPException(403, {
        message: "Community endpoints require Flower tier or higher",
    });
}

async function requireOwnerGithubUsername(
    db: Db,
    userId: string,
): Promise<string> {
    const owner = await db.query.user.findFirst({
        columns: { githubUsername: true },
        where: eq(schema.user.id, userId),
    });
    if (owner?.githubUsername) return owner.githubUsername;
    throw new HTTPException(400, {
        message:
            "A GitHub username is required to register community endpoints",
    });
}

function toResponse(row: CommunityEndpointRow, ownerGithubUsername: string) {
    return {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        description: row.description,
        baseUrl: row.baseUrl,
        upstreamModel: row.upstreamModel,
        tokenConfigured: true,
        ...communityEndpointPrices(row),
        contextLength: row.contextLength,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedEndpoint(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, id),
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
        ),
    });
    if (!row) {
        throw new HTTPException(404, {
            message: "Community endpoint not found",
        });
    }
    return row;
}

async function ensureModelNameAvailable(
    db: Db,
    ownerUserId: string,
    name: string,
    currentId?: string,
): Promise<void> {
    const existing = await db.query.communityEndpoint.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            eq(schema.communityEndpoint.name, name),
        ),
    });
    if (!existing || existing.id === currentId) return;
    throw new HTTPException(400, {
        message: "Community model name is already registered",
    });
}

function throwEndpointTestError(error: unknown): never {
    throw new HTTPException(400, {
        message:
            error instanceof Error ? error.message : "Endpoint test failed",
    });
}

export const communityEndpointsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .get("/", async (c) => {
        const user = c.var.auth.requireUser();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        const ownerGithubUsername = await requireOwnerGithubUsername(
            db,
            user.id,
        );
        const rows = await db.query.communityEndpoint.findMany({
            where: eq(schema.communityEndpoint.ownerUserId, user.id),
            orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
        });
        return c.json({
            data: rows.map((row) => toResponse(row, ownerGithubUsername)),
        });
    })
    .post("/", validator("json", CreateEndpointSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        const ownerGithubUsername = await requireOwnerGithubUsername(
            db,
            user.id,
        );
        await ensureModelNameAvailable(db, user.id, input.name);
        const id = crypto.randomUUID();
        const [row] = await db
            .insert(schema.communityEndpoint)
            .values({
                id,
                ownerUserId: user.id,
                name: input.name,
                description: input.description || null,
                baseUrl: normalizeInputBaseUrl(input.baseUrl),
                upstreamModel: input.upstreamModel ?? input.name,
                bearerTokenCiphertext: await encryptSecret(
                    normalizeInputBearerToken(input.bearerToken),
                    c.env.BETTER_AUTH_SECRET,
                ),
                ...communityEndpointPrices(input),
                contextLength: input.contextLength ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();
        return c.json(toResponse(row, ownerGithubUsername));
    })
    .post("/models", validator("json", ModelListSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        try {
            const models = await listCommunityEndpointModels(input);
            return c.json({ data: models });
        } catch (error) {
            throwEndpointTestError(error);
        }
    })
    .post("/test", validator("json", TestEndpointSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        try {
            const result = await testCommunityEndpoint(input);
            return c.json({
                ok: true,
                message: "Endpoint responded with usage",
                ...result,
            });
        } catch (error) {
            throwEndpointTestError(error);
        }
    })
    .post("/:id/models", validator("json", ModelListSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const { id } = c.req.param();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        const endpoint = await requireOwnedEndpoint(db, id, user.id);
        try {
            const models = await listCommunityEndpointModels({
                baseUrl: input.baseUrl,
                bearerToken:
                    input.bearerToken ??
                    (await decryptSecret(
                        endpoint.bearerTokenCiphertext,
                        c.env.BETTER_AUTH_SECRET,
                    )),
            });
            return c.json({ data: models });
        } catch (error) {
            throwEndpointTestError(error);
        }
    })
    .post(
        "/:id/test",
        validator("json", SavedEndpointTestSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointAccess(db, c.env, user.id);
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            try {
                const result = await testCommunityEndpoint({
                    baseUrl: input.baseUrl,
                    bearerToken:
                        input.bearerToken ??
                        (await decryptSecret(
                            endpoint.bearerTokenCiphertext,
                            c.env.BETTER_AUTH_SECRET,
                        )),
                    model: input.model,
                });
                return c.json({
                    ok: true,
                    message: "Endpoint responded with usage",
                    ...result,
                });
            } catch (error) {
                throwEndpointTestError(error);
            }
        },
    )
    .post("/:id/update", validator("json", UpdateEndpointSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const { id } = c.req.param();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        const ownerGithubUsername = await requireOwnerGithubUsername(
            db,
            user.id,
        );
        const endpoint = await requireOwnedEndpoint(db, id, user.id);
        const nextPrices = communityEndpointPrices({ ...endpoint, ...input });
        if (!hasPositivePrice(nextPrices)) {
            throw new HTTPException(400, {
                message: "At least one price must be greater than 0",
            });
        }
        await ensureModelNameAvailable(
            db,
            user.id,
            input.name ?? endpoint.name,
            id,
        );

        const update: Partial<typeof schema.communityEndpoint.$inferInsert> = {
            updatedAt: new Date(),
        };
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) {
            update.description = input.description || null;
        }
        if (input.baseUrl !== undefined) {
            update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
        }
        if (input.upstreamModel !== undefined) {
            update.upstreamModel = input.upstreamModel;
        }
        if (input.bearerToken !== undefined) {
            update.bearerTokenCiphertext = await encryptSecret(
                normalizeInputBearerToken(input.bearerToken),
                c.env.BETTER_AUTH_SECRET,
            );
        }
        for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
            if (input[field.key] !== undefined) {
                update[field.key] = input[field.key];
            }
        }
        if (input.contextLength !== undefined) {
            update.contextLength = input.contextLength;
        }

        const [row] = await db
            .update(schema.communityEndpoint)
            .set(update)
            .where(
                and(
                    eq(schema.communityEndpoint.id, id),
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                ),
            )
            .returning();
        return c.json(toResponse(row, ownerGithubUsername));
    })
    .delete("/:id", async (c) => {
        const user = c.var.auth.requireUser();
        const { id } = c.req.param();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointAccess(db, c.env, user.id);
        await requireOwnedEndpoint(db, id, user.id);
        await db
            .delete(schema.communityEndpoint)
            .where(
                and(
                    eq(schema.communityEndpoint.id, id),
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                ),
            );
        return c.json({ id });
    });

import {
    communityModelId,
    normalizeCommunityEndpointBaseUrl,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

const PriceSchema = z.number().finite().min(0);
const COMMUNITY_ENDPOINT_TIER_GATE_ENABLED = false;
const COMMUNITY_ENDPOINT_TIERS = new Set(["flower", "nectar", "router"]);

const EndpointFieldsSchema = z.object({
    name: z.string().min(1).max(120),
    baseUrl: z.string().url(),
    upstreamModel: z.string().min(1).max(253),
    bearerToken: z.string().min(1),
    promptTextPrice: PriceSchema,
    completionTextPrice: PriceSchema,
    contextLength: z.number().int().positive().nullable().optional(),
});

const CreateEndpointSchema = EndpointFieldsSchema.refine(
    (value) => value.promptTextPrice > 0 || value.completionTextPrice > 0,
    "At least one price must be greater than 0",
);

const UpdateEndpointSchema = EndpointFieldsSchema.partial();

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

async function requireCommunityEndpointTier(
    db: ReturnType<typeof drizzle<typeof schema>>,
    userId: string,
): Promise<void> {
    if (!COMMUNITY_ENDPOINT_TIER_GATE_ENABLED) return;
    const user = await db.query.user.findFirst({
        columns: { tier: true },
        where: eq(schema.user.id, userId),
    });
    if (user?.tier && COMMUNITY_ENDPOINT_TIERS.has(user.tier)) return;
    throw new HTTPException(403, {
        message: "Community endpoints require Flower tier or higher",
    });
}

function toResponse(row: typeof schema.communityEndpoint.$inferSelect) {
    return {
        id: row.id,
        modelId: communityModelId(row.id),
        name: row.name,
        baseUrl: row.baseUrl,
        upstreamModel: row.upstreamModel,
        tokenConfigured: true,
        promptTextPrice: row.promptTextPrice,
        completionTextPrice: row.completionTextPrice,
        contextLength: row.contextLength,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedEndpoint(
    db: ReturnType<typeof drizzle<typeof schema>>,
    id: string,
    ownerUserId: string,
) {
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

export const communityEndpointsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .get("/", async (c) => {
        const user = c.var.auth.requireUser();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointTier(db, user.id);
        const rows = await db.query.communityEndpoint.findMany({
            where: eq(schema.communityEndpoint.ownerUserId, user.id),
            orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
        });
        return c.json({ data: rows.map(toResponse) });
    })
    .post("/", validator("json", CreateEndpointSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointTier(db, user.id);
        const id = crypto.randomUUID();
        const [row] = await db
            .insert(schema.communityEndpoint)
            .values({
                id,
                ownerUserId: user.id,
                name: input.name,
                baseUrl: normalizeInputBaseUrl(input.baseUrl),
                upstreamModel: input.upstreamModel,
                bearerTokenCiphertext: await encryptSecret(
                    input.bearerToken,
                    c.env.BETTER_AUTH_SECRET,
                ),
                promptTextPrice: input.promptTextPrice,
                completionTextPrice: input.completionTextPrice,
                contextLength: input.contextLength ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();
        return c.json(toResponse(row));
    })
    .post("/:id/update", validator("json", UpdateEndpointSchema), async (c) => {
        const user = c.var.auth.requireUser();
        const input = c.req.valid("json");
        const { id } = c.req.param();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointTier(db, user.id);
        const endpoint = await requireOwnedEndpoint(db, id, user.id);
        const nextPromptTextPrice =
            input.promptTextPrice ?? endpoint.promptTextPrice;
        const nextCompletionTextPrice =
            input.completionTextPrice ?? endpoint.completionTextPrice;
        if (nextPromptTextPrice <= 0 && nextCompletionTextPrice <= 0) {
            throw new HTTPException(400, {
                message: "At least one price must be greater than 0",
            });
        }

        const update: Partial<typeof schema.communityEndpoint.$inferInsert> = {
            updatedAt: new Date(),
        };
        if (input.name !== undefined) update.name = input.name;
        if (input.baseUrl !== undefined) {
            update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
        }
        if (input.upstreamModel !== undefined) {
            update.upstreamModel = input.upstreamModel;
        }
        if (input.bearerToken !== undefined) {
            update.bearerTokenCiphertext = await encryptSecret(
                input.bearerToken,
                c.env.BETTER_AUTH_SECRET,
            );
        }
        if (input.promptTextPrice !== undefined) {
            update.promptTextPrice = input.promptTextPrice;
        }
        if (input.completionTextPrice !== undefined) {
            update.completionTextPrice = input.completionTextPrice;
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
        return c.json(toResponse(row));
    })
    .delete("/:id", async (c) => {
        const user = c.var.auth.requireUser();
        const { id } = c.req.param();
        const db = drizzle(c.env.DB, { schema });
        await requireCommunityEndpointTier(db, user.id);
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

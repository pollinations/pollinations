import {
    communityModelDefinition,
    communityModelId,
    effectiveCommunityEndpointVisibility,
    legacyCommunityModelId,
    parseCommunityModelId,
    parseListingPayload,
    resolveEffectiveProxyListing,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import {
    isSequenceFallbackBalanceAllowed,
    isSequenceFallbackPricingAllowed,
    MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH,
    MODEL_SEQUENCE_MAX_MODELS,
    MODEL_SEQUENCE_NAME_MAX_LENGTH,
    MODEL_SEQUENCE_NAME_REGEX,
    MODEL_SEQUENCE_TITLE_MAX_LENGTH,
    modelSequenceEventType,
    modelSequenceModelId,
    parseModelSequenceId,
} from "@shared/model-sequences.ts";
import {
    getRegistryModelDefinition,
    isVisibleModelDefinition,
    type ModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { requireAccountPermission } from "./account-permissions.ts";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type ModelSequenceRow = typeof schema.modelSequence.$inferSelect;

const ModelSequenceSchema = z
    .object({
        id: z.string(),
        modelId: z
            .string()
            .describe(
                "Canonical model id used at the gateway: `<github-username>/<name>`.",
            ),
        name: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        modelIds: z
            .array(z.string())
            .describe(
                "Ordered model ids: the first is the primary, the rest are fallbacks tried in order.",
            ),
        createdAt: z.string(),
        updatedAt: z.string(),
    })
    .strict();

const ModelSequenceListResponseSchema = z.object({
    data: z.array(ModelSequenceSchema),
});

const ModelSequenceResponseSchema = z.object({
    data: ModelSequenceSchema,
});

const ModelSequenceDeleteResponseSchema = z.object({
    success: z.literal(true),
});

const NameSchema = z
    .string()
    .min(1)
    .max(MODEL_SEQUENCE_NAME_MAX_LENGTH)
    .regex(
        MODEL_SEQUENCE_NAME_REGEX,
        "Name may only contain letters, numbers, dots, underscores, colons and hyphens",
    )
    .describe(
        "Sequence name. The public model id becomes `<github-username>/<name>`.",
    );

const TitleSchema = z.string().min(1).max(MODEL_SEQUENCE_TITLE_MAX_LENGTH);
const DescriptionSchema = z
    .string()
    .max(MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional();
const ModelIdsSchema = z
    .array(z.string().min(1))
    .min(2, "A sequence needs a primary model and at least one fallback")
    .max(MODEL_SEQUENCE_MAX_MODELS)
    .describe(
        "Ordered model ids. The first entry is the primary: it supplies the quoted price, modality, endpoints and capabilities. The rest are fallbacks and must not cost more than the primary.",
    );

export const CreateModelSequenceSchema = z
    .object({
        name: NameSchema,
        title: TitleSchema,
        description: DescriptionSchema,
        modelIds: ModelIdsSchema,
    })
    .strict();

export const UpdateModelSequenceSchema = z
    .object({
        title: TitleSchema.optional(),
        description: DescriptionSchema,
        modelIds: ModelIdsSchema.optional(),
    })
    .strict();

function toModelSequenceResponse(
    row: ModelSequenceRow,
    ownerGithubUsername: string,
) {
    return {
        id: row.id,
        modelId: modelSequenceModelId(ownerGithubUsername, row.name),
        name: row.name,
        title: row.title,
        description: row.description,
        modelIds: Array.isArray(row.modelIds) ? row.modelIds : [],
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
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
            "Connect a GitHub account before registering a model sequence: the model id includes your GitHub username.",
    });
}

type ResolvedSequenceModel = {
    modelId: string;
    definition: ModelDefinition;
    eventType: EventType;
};

function missingModelMessage(modelId: string): string {
    return `Model ${modelId} does not exist`;
}

/**
 * Resolves a requested member id to a canonical id and its definition.
 * Static ids are tried first because bundled ids contain a slash
 * (`provider/model`), which also matches the sequence id shape. Community
 * models resolve through the `community/<owner>/<name>` id; an id that only
 * matches the sequence shape refers to another sequence, and nested
 * sequences are not allowed.
 */
async function resolveSequenceModel(
    db: Db,
    ownerUserId: string,
    requested: string,
): Promise<ResolvedSequenceModel> {
    try {
        const resolved = resolveModelName(requested);
        const definition = getRegistryModelDefinition(resolved);
        if (!isVisibleModelDefinition(definition)) {
            throw new HTTPException(400, {
                message: missingModelMessage(requested),
            });
        }
        return {
            modelId: resolved,
            definition,
            eventType: modelSequenceEventType(definition.category),
        };
    } catch (error) {
        if (error instanceof HTTPException) throw error;
    }

    const communityParts = parseCommunityModelId(requested);
    if (communityParts) {
        const owner = await db.query.user.findFirst({
            columns: {
                id: true,
                communityProviderName: true,
                communityProviderUrl: true,
                communityProviderIconUrl: true,
            },
            where: eq(
                schema.user.githubUsername,
                communityParts.ownerGithubUsername,
            ),
        });
        const endpoint = owner
            ? await db.query.communityEndpoint.findFirst({
                  where: and(
                      eq(schema.communityEndpoint.ownerUserId, owner.id),
                      eq(
                          schema.communityEndpoint.name,
                          communityParts.modelName,
                      ),
                  ),
              })
            : undefined;
        const modelId = communityModelId(
            communityParts.ownerGithubUsername,
            communityParts.modelName,
        );
        // Private or hidden models owned by someone else look identical to a
        // missing model, so validation errors never reveal their existence.
        if (
            !endpoint ||
            (endpoint.ownerUserId !== ownerUserId &&
                (effectiveCommunityEndpointVisibility(
                    endpoint.visibility,
                    endpoint.pendingVisibility,
                    endpoint.pendingAt,
                ) === "private" ||
                    endpoint.hiddenAt !== null))
        ) {
            // The legacy community alias `owner/name` shares its id space
            // with sequences, so this may name an existing sequence. Nested
            // sequences are not allowed, and saying so reveals nothing about
            // other owners: the sequence itself is owner-private either way.
            const nested = owner
                ? await db.query.modelSequence.findFirst({
                      columns: { id: true },
                      where: and(
                          eq(schema.modelSequence.ownerUserId, owner.id),
                          eq(
                              schema.modelSequence.name,
                              communityParts.modelName,
                          ),
                      ),
                  })
                : undefined;
            if (nested) {
                throw new HTTPException(400, {
                    message: `Model ${requested} is itself a model sequence; nested sequences are not allowed`,
                });
            }
            throw new HTTPException(400, {
                message: missingModelMessage(modelId),
            });
        }
        if (endpoint.hiddenAt !== null) {
            throw new HTTPException(400, {
                message: `Model ${modelId} must be listed`,
            });
        }
        if (endpoint.type !== "proxy") {
            throw new HTTPException(400, {
                message: `Model ${modelId} cannot delegate generation`,
            });
        }
        const currentPayload = parseListingPayload("proxy", endpoint.payload);
        if (!currentPayload) {
            throw new HTTPException(400, {
                message: `Model ${modelId} has invalid configuration`,
            });
        }
        const payload = resolveEffectiveProxyListing({
            visibility: endpoint.visibility,
            payload: currentPayload,
            pendingVisibility: endpoint.pendingVisibility,
            pendingPayload: parseListingPayload(
                "proxy",
                endpoint.pendingPayload,
            ),
            pendingAt: endpoint.pendingAt,
        }).payload;
        if (
            effectiveCommunityEndpointVisibility(
                endpoint.visibility,
                endpoint.pendingVisibility,
                endpoint.pendingAt,
            ) === "private" &&
            endpoint.ownerUserId !== ownerUserId
        ) {
            throw new HTTPException(400, {
                message: `Model ${modelId} must be public or owned by you`,
            });
        }
        const definition = communityModelDefinition({
            modelId,
            addedDate: endpoint.createdAt.getTime(),
            title: endpoint.title,
            description: endpoint.description,
            providerName: owner?.communityProviderName,
            providerUrl: owner?.communityProviderUrl,
            providerIconUrl: owner?.communityProviderIconUrl,
            modality: payload.modality,
            imagePricing: payload.imagePricing,
            inputModalities: payload.inputModalities,
            perUserRpm: payload.perUserRpm,
            advertised: payload.advertised,
            paidOnly: payload.paidOnly,
            requiredSafetyFeatures: endpoint.requiredSafetyFeatures,
            ...payload.prices,
        });
        return {
            modelId,
            definition,
            eventType: modelSequenceEventType(definition.category),
        };
    }

    if (parseModelSequenceId(requested)) {
        throw new HTTPException(400, {
            message: `Model ${requested} is itself a model sequence; nested sequences are not allowed`,
        });
    }
    throw new HTTPException(400, {
        message: missingModelMessage(requested),
    });
}

/**
 * Resolves the requested model list in declared order and enforces the
 * sequence invariants: no duplicates, one shared event type, and fallbacks
 * that never exceed the primary's price or require a balance class the
 * primary does not.
 */
async function resolveSequenceModelIds(
    db: Db,
    ownerUserId: string,
    requested: string[],
): Promise<string[]> {
    const resolved: ResolvedSequenceModel[] = [];
    for (const modelId of requested) {
        const model = await resolveSequenceModel(db, ownerUserId, modelId);
        if (resolved.some((entry) => entry.modelId === model.modelId)) {
            throw new HTTPException(400, {
                message: `Model ${model.modelId} is listed more than once`,
            });
        }
        resolved.push(model);
    }
    const [primary, ...fallbacks] = resolved;
    for (const target of fallbacks) {
        if (target.eventType !== primary.eventType) {
            throw new HTTPException(400, {
                message: `Model ${target.modelId} is a ${target.eventType} model, not ${primary.eventType}`,
            });
        }
        if (
            !isSequenceFallbackBalanceAllowed(
                primary.definition,
                target.definition,
            )
        ) {
            throw new HTTPException(400, {
                message: `Model ${target.modelId} accepts only Paid Pollen, which the primary model does not require`,
            });
        }
        if (
            !isSequenceFallbackPricingAllowed(
                primary.definition,
                target.definition,
            )
        ) {
            throw new HTTPException(400, {
                message: `Model ${target.modelId} is priced above the primary model ${primary.modelId}`,
            });
        }
    }
    return resolved.map((model) => model.modelId);
}

/**
 * The sequence model id `<owner>/<name>` shares its id space with bundled
 * models and legacy community aliases, so a name must be free across all
 * three namespaces before it can be registered.
 */
async function ensureSequenceNameAvailable(
    db: Db,
    ownerUserId: string,
    ownerGithubUsername: string,
    name: string,
    currentId?: string,
): Promise<void> {
    const bundledModelExists = [
        modelSequenceModelId(ownerGithubUsername, name),
        communityModelId(ownerGithubUsername, name),
        legacyCommunityModelId(ownerGithubUsername, name),
    ].some((modelId) => {
        try {
            resolveModelName(modelId);
            return true;
        } catch {
            return false;
        }
    });
    if (bundledModelExists) {
        throw new HTTPException(400, {
            message:
                "Model sequence ID conflicts with a bundled model or alias",
        });
    }
    const existingSequence = await db.query.modelSequence.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.modelSequence.ownerUserId, ownerUserId),
            eq(schema.modelSequence.name, name),
        ),
    });
    if (existingSequence && existingSequence.id !== currentId) {
        throw new HTTPException(400, {
            message: "Model sequence name is already registered",
        });
    }
    const existingEndpoint = await db.query.communityEndpoint.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            eq(schema.communityEndpoint.name, name),
        ),
    });
    if (existingEndpoint) {
        throw new HTTPException(400, {
            message:
                "A community model with this name already owns the model ID",
        });
    }
}

async function findOwnedSequence(
    db: Db,
    userId: string,
    id: string,
): Promise<ModelSequenceRow> {
    const row = await db.query.modelSequence.findFirst({
        where: and(
            eq(schema.modelSequence.id, id),
            eq(schema.modelSequence.ownerUserId, userId),
        ),
    });
    if (!row) {
        throw new HTTPException(404, {
            message: "Model sequence not found",
        });
    }
    return row;
}

export const modelSequencesRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "List My Model Sequences",
            description:
                "List virtual My Models (fallback sequences) owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Registered model sequences",
                    content: {
                        "application/json": {
                            schema: resolver(ModelSequenceListResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const rows = await db
                .select()
                .from(schema.modelSequence)
                .where(eq(schema.modelSequence.ownerUserId, user.id))
                .orderBy(desc(schema.modelSequence.createdAt));
            return c.json(
                ModelSequenceListResponseSchema.parse({
                    data: rows.map((row) =>
                        toModelSequenceResponse(row, ownerGithubUsername),
                    ),
                }),
            );
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Create a Model Sequence",
            description:
                "Register a virtual My Model: an ordered list of existing model ids served under `<github-username>/<name>`. The first id is the primary and supplies the quoted price and modality; the remaining ids are fallbacks tried in order and must not cost more than the primary. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Created model sequence",
                    content: {
                        "application/json": {
                            schema: resolver(ModelSequenceResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid sequence" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateModelSequenceSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const input = c.req.valid("json");
            await ensureSequenceNameAvailable(
                db,
                user.id,
                ownerGithubUsername,
                input.name,
            );
            const modelIds = await resolveSequenceModelIds(
                db,
                user.id,
                input.modelIds,
            );
            const id = crypto.randomUUID();
            await db.insert(schema.modelSequence).values({
                id,
                ownerUserId: user.id,
                name: input.name,
                title: input.title,
                description: input.description ?? null,
                modelIds,
            });
            const row = await findOwnedSequence(db, user.id, id);
            return c.json(
                ModelSequenceResponseSchema.parse({
                    data: toModelSequenceResponse(row, ownerGithubUsername),
                }),
            );
        },
    )
    .put(
        "/:id",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Update a Model Sequence",
            description:
                "Replace the title, description, or model list of a sequence. The name is immutable because it is part of the public model id. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Updated model sequence",
                    content: {
                        "application/json": {
                            schema: resolver(ModelSequenceResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid sequence" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Not found" },
            },
        }),
        validator("json", UpdateModelSequenceSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const row = await findOwnedSequence(db, user.id, c.req.param("id"));
            const input = c.req.valid("json");
            const modelIds = input.modelIds
                ? await resolveSequenceModelIds(db, user.id, input.modelIds)
                : undefined;
            await db
                .update(schema.modelSequence)
                .set({
                    ...(input.title !== undefined
                        ? { title: input.title }
                        : {}),
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(modelIds ? { modelIds } : {}),
                })
                .where(eq(schema.modelSequence.id, row.id));
            const updated = await findOwnedSequence(db, user.id, row.id);
            return c.json(
                ModelSequenceResponseSchema.parse({
                    data: toModelSequenceResponse(updated, ownerGithubUsername),
                }),
            );
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Delete a Model Sequence",
            description:
                "Remove a virtual My Model. The model id stops resolving at the gateway within a minute (registry cache TTL). API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deleted model sequence",
                    content: {
                        "application/json": {
                            schema: resolver(ModelSequenceDeleteResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const row = await findOwnedSequence(db, user.id, c.req.param("id"));
            await db
                .delete(schema.modelSequence)
                .where(eq(schema.modelSequence.id, row.id));
            return c.json(
                ModelSequenceDeleteResponseSchema.parse({ success: true }),
            );
        },
    );

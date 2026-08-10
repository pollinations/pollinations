import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES,
    COMMUNITY_ENDPOINT_INPUT_MODALITIES,
    COMMUNITY_ENDPOINT_MODALITIES,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    COMMUNITY_PROVIDER_NAME_MAX_LENGTH,
    COMMUNITY_PROVIDER_URL_MAX_LENGTH,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPriceFieldsForModality,
    communityEndpointPrices,
    communityEndpointPricesForModality,
    communityEndpointTitle,
    communityModelId,
    isCommunityEndpointOwnerAllowed,
    isCommunityFallbackPricingAllowed,
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MAX_COMMUNITY_PRICE_PER_TOKEN,
    MAX_FALLBACK_TARGETS,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    normalizeCommunityEndpointImagePricing,
    normalizeCommunityEndpointInputModalities,
    normalizeCommunityEndpointModality,
    normalizeCommunityProviderUrl,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { MODEL_INPUT_MODALITIES } from "@shared/registry/registry.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { and, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    listCommunityEndpointModels,
    testCommunityEndpoint,
    testCommunityImageEndpoint,
} from "../services/community-endpoint-openai.ts";
import { requireAccountPermission } from "./account-permissions.ts";

const ModalitySchema = z
    .enum(COMMUNITY_ENDPOINT_MODALITIES)
    .describe(
        'Upstream API family. "text" uses `/v1/chat/completions`; "image" uses `/v1/images/generations` and optionally `/v1/images/edits` when the endpoint test succeeds.',
    );
const ImagePricingSchema = z
    .enum(COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES)
    .describe(
        'Image models only. "request": the generated-image price is charged once per generation. "tokens": provider-returned OpenAI image token usage is charged against per-token prices. Detected by the endpoint test.',
    );
const InputModalitySchema = z.enum(MODEL_INPUT_MODALITIES);
const InputModalitiesSchema = z
    .array(InputModalitySchema)
    .min(1)
    .describe(
        "Input types accepted by the model. Select every supported modality so the model catalog can advertise them accurately.",
    );
const PriceSchema = z
    .number()
    .finite()
    .min(0)
    .refine((price) => price === 0 || price >= MIN_COMMUNITY_PRICE_PER_TOKEN, {
        message: `Price must be 0 (free) or at least ${MIN_COMMUNITY_PRICE_PER_TOKEN} per token (${MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS} per 1M tokens)`,
    })
    .describe(
        'Pollen price. Token rates are per token internally (the dashboard displays per 1M); `completionImagePrice` is per generated image when `imagePricing` is "request".',
    );
const UpdatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional(),
    ]),
) as unknown as Record<
    CommunityEndpointPriceKey,
    z.ZodOptional<z.ZodType<number>>
>;

function enforceCommunityEndpointPriceLimits(
    source: Partial<Record<CommunityEndpointPriceKey, number>>,
    modality: (typeof COMMUNITY_ENDPOINT_MODALITIES)[number],
    imagePricing: (typeof COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES)[number],
): void {
    for (const field of communityEndpointPriceFieldsForModality(
        modality,
        imagePricing,
    )) {
        const price = source[field.key];
        const maxPrice =
            field.priceUnit === "image"
                ? MAX_COMMUNITY_PRICE_PER_IMAGE
                : MAX_COMMUNITY_PRICE_PER_TOKEN;
        if (price === undefined || price <= maxPrice) continue;

        const limit =
            field.priceUnit === "image"
                ? `${MAX_COMMUNITY_PRICE_PER_IMAGE} Pollen per image`
                : `${MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS} Pollen per 1M tokens`;
        throw new HTTPException(400, {
            message: `${field.label} price must not exceed ${limit}`,
        });
    }
}

function enforceCommunityEndpointInputModalities(
    modality: CommunityEndpointModality,
    inputModalities: readonly string[],
): void {
    const permitted = COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality];
    const unsupported = inputModalities.find(
        (input) => !(permitted as readonly string[]).includes(input),
    );
    if (!unsupported) return;
    throw new HTTPException(400, {
        message: `${unsupported} input is not supported for ${modality} models`,
    });
}

// Community fallback targets are restricted to public community models or
// private models owned by the same developer.
// Pointing a community model at a Pollinations-operated model is deliberately
// out of scope: static registry prices can be function-valued/dynamic, so the
// "same or lower price" comparison is not well-defined against them.
const FallbackModelIdsSchema = z
    .array(z.string().trim().min(1))
    .max(MAX_FALLBACK_TARGETS)
    .describe(
        'Community model ids ("<owner>/<name>") tried in order when this model\'s upstream fails, or an empty array to clear them. Each must be another active community model of the same modality, public or owned by you, and priced at or below this model on every price field.',
    );

const SELF_FALLBACK_MESSAGE = "Fallback target cannot be the model itself";

type FallbackPrimary = {
    modelId: string;
    ownerUserId: string;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    prices: CommunityEndpointPrices;
};

/**
 * Why `target` may not serve as a fallback for `primary`, or null when it may.
 *
 * The candidate list the dashboard offers and the validation the write path
 * applies must agree, so both go through this one function — a target the UI
 * shows can always be saved, and one it hides always explains itself.
 */
function fallbackTargetRejection(
    primary: FallbackPrimary,
    modelId: string,
    target: CommunityEndpointRow,
): string | null {
    // Reached from the candidates route, where the model itself is one of the
    // public rows scanned. The write path checks this earlier, before any
    // lookup, because a model being created has no row to find.
    if (modelId === primary.modelId) return SELF_FALLBACK_MESSAGE;
    if (target.disabledAt !== null) {
        return `Fallback target ${modelId} must be active`;
    }
    if (
        target.visibility === "private" &&
        target.ownerUserId !== primary.ownerUserId
    ) {
        return `Fallback target ${modelId} must be public or owned by you`;
    }
    const targetModality = normalizeCommunityEndpointModality(target.modality);
    if (targetModality !== primary.modality) {
        return `Fallback target ${modelId} is a ${targetModality} model, not ${primary.modality}`;
    }
    // The stored price columns mean different things in "request" and "tokens"
    // mode, so comparing across modes is meaningless.
    const targetImagePricing = normalizeCommunityEndpointImagePricing(
        target.imagePricing,
    );
    if (
        primary.modality === "image" &&
        targetImagePricing !== primary.imagePricing
    ) {
        return `Fallback target ${modelId} bills images per ${targetImagePricing}, not per ${primary.imagePricing}`;
    }
    const targetPrices = communityEndpointPrices(target);
    if (!isCommunityFallbackPricingAllowed(primary.prices, targetPrices)) {
        const excesses = COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
            (field) => targetPrices[field.key] > primary.prices[field.key],
        ).map(
            (field) =>
                `${field.key} (${targetPrices[field.key]}) exceeds this model's (${primary.prices[field.key]})`,
        );
        return `Fallback target ${modelId} ${excesses.join(", ")}`;
    }
    return null;
}

// Resolves and validates one requested fallback target.
async function resolveFallbackModelId(
    db: Db,
    requested: string,
    primary: FallbackPrimary,
): Promise<string> {
    const parsed = parseCommunityModelId(requested);
    if (!parsed) {
        throw new HTTPException(400, {
            message: `Fallback target ${requested} must be a community model id in the form <owner>/<name>`,
        });
    }
    const fallbackModelId = communityModelId(
        parsed.ownerGithubUsername,
        parsed.modelName,
    );
    // Before the lookup: on create the model has no row yet, so a self-reference
    // would otherwise surface as "does not exist".
    if (fallbackModelId === primary.modelId) {
        throw new HTTPException(400, { message: SELF_FALLBACK_MESSAGE });
    }

    const targetOwner = await db.query.user.findFirst({
        columns: { id: true },
        where: eq(schema.user.githubUsername, parsed.ownerGithubUsername),
    });
    const target = targetOwner
        ? await db.query.communityEndpoint.findFirst({
              where: and(
                  eq(schema.communityEndpoint.ownerUserId, targetOwner.id),
                  eq(schema.communityEndpoint.name, parsed.modelName),
              ),
          })
        : undefined;
    if (!target) {
        throw new HTTPException(400, {
            message: `Fallback target ${fallbackModelId} does not exist`,
        });
    }
    const rejection = fallbackTargetRejection(primary, fallbackModelId, target);
    if (rejection) throw new HTTPException(400, { message: rejection });
    return fallbackModelId;
}

// Resolves the whole declared list.
//
// A target can later be deleted, deactivated, or repriced above the primary.
// There is no reconciliation job: the generation registry re-checks these same
// rules when it links entries, so this is a UX guard, not an invariant.
async function resolveFallbackModelIds(
    db: Db,
    requested: string[],
    primary: FallbackPrimary,
): Promise<string[]> {
    const resolved: string[] = [];
    for (const id of requested) {
        const modelId = await resolveFallbackModelId(db, id, primary);
        if (resolved.includes(modelId)) {
            throw new HTTPException(400, {
                message: `Fallback target ${modelId} is listed more than once`,
            });
        }
        resolved.push(modelId);
    }
    return resolved;
}

const VisibilitySchema = z
    .enum(COMMUNITY_ENDPOINT_VISIBILITIES)
    .describe(
        '"private": owner-only, shown only to the owner, with no owner-set price. "public": anyone and listed in the catalog; it may be free or priced. Publishing requires an allowlisted account.',
    );
const PerUserRpmSchema = z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .describe(
        "Maximum requests per minute for each Pollinations user. Null means no Pollinations-side limit.",
    );
const EndpointFieldsSchema = {
    // This slug is used in `<owner>/<name>` model ids and by operational tools.
    // Keep it safe to pass as data without accepting shell or SQL syntax.
    name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(
            /^[A-Za-z0-9._:-]+$/,
            "Model name may only contain letters, numbers, periods, underscores, colons, and hyphens",
        ),
    title: z
        .string()
        .trim()
        .min(1)
        .max(COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH)
        .describe("Display name shown in the model catalog."),
    description: z
        .string()
        .trim()
        .max(COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH)
        .optional(),
    baseUrl: z
        .string()
        .url()
        .describe(
            "OpenAI-compatible `/v1` base URL or full chat, image generation, or image edit URL.",
        ),
    upstreamModel: z.string().trim().min(1).max(253).optional(),
    bearerToken: z.string().min(1),
} as const;

const CreateEndpointSchema = z.object({
    ...EndpointFieldsSchema,
    modality: ModalitySchema.optional().default("text"),
    imagePricing: ImagePricingSchema.optional().default("request"),
    inputModalities: InputModalitiesSchema.optional().default(["text"]),
    visibility: VisibilitySchema.optional().default("private"),
    perUserRpm: PerUserRpmSchema.optional(),
    fallbackModelIds: FallbackModelIdsSchema.optional(),
    ...UpdatePriceFieldsSchema,
});
const UpdateEndpointSchema = z.object({
    name: EndpointFieldsSchema.name.optional(),
    title: EndpointFieldsSchema.title.optional(),
    description: EndpointFieldsSchema.description,
    baseUrl: EndpointFieldsSchema.baseUrl.optional(),
    upstreamModel: EndpointFieldsSchema.upstreamModel,
    bearerToken: EndpointFieldsSchema.bearerToken.optional(),
    visibility: VisibilitySchema.optional(),
    perUserRpm: PerUserRpmSchema.optional(),
    imagePricing: ImagePricingSchema.optional(),
    inputModalities: InputModalitiesSchema.optional(),
    fallbackModelIds: FallbackModelIdsSchema.optional(),
    active: z.boolean().optional(),
    ...UpdatePriceFieldsSchema,
});
const FallbackCandidatesResponseSchema = z.object({
    data: z.array(z.string()),
});
const ModelListSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().min(1),
});
const TestEndpointSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().min(1),
    model: z.string().trim().min(1).max(253),
    modality: ModalitySchema.optional().default("text"),
});
const ResponsePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, z.number()]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const CommunityEndpointResponseSchema = z.object({
    id: z.string(),
    modelId: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    modality: ModalitySchema,
    imagePricing: ImagePricingSchema,
    inputModalities: z.array(InputModalitySchema),
    baseUrl: z.string(),
    upstreamModel: z.string(),
    visibility: VisibilitySchema,
    perUserRpm: PerUserRpmSchema,
    fallbackModelIds: z.array(z.string()),
    ...ResponsePriceFieldsSchema,
    disabled: z.boolean(),
    disabledReason: z.string().nullable(),
    disabledAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const CommunityEndpointListResponseSchema = z.object({
    data: z.array(CommunityEndpointResponseSchema),
    provider: z.object({
        name: z.string().nullable(),
        url: z.string().url().nullable(),
    }),
});
const CommunityProviderProfileInputSchema = z.object({
    name: z.string().trim().max(COMMUNITY_PROVIDER_NAME_MAX_LENGTH),
    url: z.string().trim().max(COMMUNITY_PROVIDER_URL_MAX_LENGTH),
});
const CommunityProviderProfileResponseSchema = z.object({
    name: z.string().nullable(),
    url: z.string().url().nullable(),
});
const CommunityEndpointModelsResponseSchema = z.object({
    data: z.array(z.string()),
});
const CommunityEndpointTestResponseSchema = z
    .object({
        ok: z.boolean(),
        message: z.string(),
        usage: z
            .record(z.string(), z.unknown())
            .describe(
                "Raw provider usage, or `{ images: 1 }` when an image provider returns no token usage.",
            ),
        billableUsage: z
            .record(z.string(), z.number())
            .describe(
                "Normalized billable usage fields used to reveal applicable prices.",
            ),
        imagePricing: ImagePricingSchema.optional().describe(
            "Image tests only: pricing mode detected from the provider response.",
        ),
        inputModalities: z
            .array(InputModalitySchema)
            .optional()
            .describe(
                "Image tests only: input types detected from generation and edit probes.",
            ),
    })
    .passthrough();
const CommunityEndpointDeleteResponseSchema = z.object({
    id: z.string(),
});
const ENDPOINT_PROBE_THROTTLE_SECONDS = 30;
type Db = ReturnType<typeof drizzle<typeof schema>>;
type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

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

function normalizeInputProviderUrl(value: string): string {
    try {
        return normalizeCommunityProviderUrl(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error ? error.message : "Invalid provider URL",
        });
    }
}

// Anyone may register private endpoints for their own use. Publishing and raw
// upstream probes require an allowlisted account.
async function requireCommunityEndpointPublishAccess(
    db: Db,
    userId: string,
): Promise<void> {
    const user = await db.query.user.findFirst({
        columns: { githubId: true },
        where: eq(schema.user.id, userId),
    });

    if (!isCommunityEndpointOwnerAllowed(user)) {
        throw new HTTPException(403, {
            message:
                "Community model publishing tools require approval. Models can stay private for your own use.",
        });
    }
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
    const modality = normalizeCommunityEndpointModality(row.modality);
    return {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        title: communityEndpointTitle({
            modelId: communityModelId(ownerGithubUsername, row.name),
            title: row.title,
            description: row.description,
        }),
        description: row.description,
        modality,
        imagePricing: normalizeCommunityEndpointImagePricing(row.imagePricing),
        inputModalities: normalizeCommunityEndpointInputModalities(
            row.inputModalities,
            modality,
        ),
        baseUrl: row.baseUrl,
        upstreamModel: row.upstreamModel,
        visibility: row.visibility,
        perUserRpm: row.perUserRpm,
        fallbackModelIds: row.fallbackModelIds ?? [],
        ...communityEndpointPrices(row),
        disabled: row.disabledAt !== null,
        disabledReason: row.disabledReason,
        disabledAt: row.disabledAt,
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

type EndpointProbeKind = "models" | "test";

// Publishing is allowlist-gated. Pricing is independent: public endpoints may
// be free or owner-priced.
async function enforcePublishingAccess(
    db: Db,
    userId: string,
    visibility: CommunityEndpointVisibility,
): Promise<void> {
    if (visibility !== "public") return;
    await requireCommunityEndpointPublishAccess(db, userId);
}

async function enforceEndpointProbeThrottle(
    c: Pick<Context<Env>, "env" | "json">,
    userId: string,
    kind: EndpointProbeKind,
): Promise<Response | undefined> {
    const throttleKey = `community-endpoint-${kind}:throttle:${userId}`;
    const now = Date.now();
    const throttleUntil = Number(await c.env.KV.get(throttleKey));
    if (Number.isFinite(throttleUntil) && throttleUntil > now) {
        return c.json(
            {
                error: "rate_limited",
                message:
                    "Community endpoint probes are limited to once every 30 seconds.",
            },
            429,
            { "Retry-After": String(ENDPOINT_PROBE_THROTTLE_SECONDS) },
        );
    }
    await c.env.KV.put(
        throttleKey,
        String(now + ENDPOINT_PROBE_THROTTLE_SECONDS * 1000),
        {
            expirationTtl: 60,
        },
    );
    return undefined;
}

export const communityEndpointsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List My Models",
            description:
                "List private and public community models owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Registered community models",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointListResponseSchema,
                            ),
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
            const rows = await db.query.communityEndpoint.findMany({
                where: eq(schema.communityEndpoint.ownerUserId, user.id),
                orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
            });
            const owner = await db.query.user.findFirst({
                columns: {
                    communityProviderName: true,
                    communityProviderUrl: true,
                },
                where: eq(schema.user.id, user.id),
            });
            return c.json({
                data: rows.map((row) => toResponse(row, ownerGithubUsername)),
                provider: {
                    name: owner?.communityProviderName ?? null,
                    url: owner?.communityProviderUrl ?? null,
                },
            });
        },
    )
    .post(
        "/provider",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update Community Provider Profile",
            description:
                "Set the public provider name and HTTPS service link shared by all community models owned by the authenticated account. Send both fields empty to clear the profile. Publishing approval and `account:keys` are required.",
            responses: {
                200: {
                    description: "Updated community provider profile",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityProviderProfileResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Invalid provider profile" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CommunityProviderProfileInputSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            await requireCommunityEndpointPublishAccess(db, user.id);

            const name = input.name.trim();
            const url = input.url.trim();
            if (Boolean(name) !== Boolean(url)) {
                throw new HTTPException(400, {
                    message: "Provider name and URL must be set together",
                });
            }

            const [profile] = await db
                .update(schema.user)
                .set({
                    communityProviderName: name || null,
                    communityProviderUrl: url
                        ? normalizeInputProviderUrl(url)
                        : null,
                    updatedAt: new Date(),
                })
                .where(eq(schema.user.id, user.id))
                .returning({
                    name: schema.user.communityProviderName,
                    url: schema.user.communityProviderUrl,
                });
            return c.json(profile);
        },
    )
    .get(
        "/:id/fallback-candidates",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Fallback Candidates",
            description:
                "Community models this model may declare as fallbacks: active, public or owned by you, same modality, and priced at or below it on every price field. Computed with the same rule the update endpoint validates against, so every id listed here is accepted. Eligibility is re-checked when a request is routed, so a target repriced above this model afterwards stops serving without changing the stored list.",
            responses: {
                200: {
                    description: "Eligible fallback model ids",
                    content: {
                        "application/json": {
                            schema: resolver(FallbackCandidatesResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Model not found" },
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
            const endpoint = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.id, c.req.param("id")),
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                ),
            });
            if (!endpoint) {
                throw new HTTPException(404, { message: "Model not found" });
            }
            const primary: FallbackPrimary = {
                modelId: communityModelId(ownerGithubUsername, endpoint.name),
                ownerUserId: user.id,
                modality: normalizeCommunityEndpointModality(endpoint.modality),
                imagePricing: normalizeCommunityEndpointImagePricing(
                    endpoint.imagePricing,
                ),
                prices: communityEndpointPrices(endpoint),
            };
            const candidates = await db
                .select({
                    endpoint: schema.communityEndpoint,
                    ownerGithubUsername: schema.user.githubUsername,
                })
                .from(schema.communityEndpoint)
                .innerJoin(
                    schema.user,
                    eq(schema.communityEndpoint.ownerUserId, schema.user.id),
                )
                .where(
                    or(
                        eq(schema.communityEndpoint.visibility, "public"),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                    ),
                );
            const data = candidates
                .flatMap(({ endpoint: row, ownerGithubUsername: owner }) => {
                    if (!owner) return [];
                    const modelId = communityModelId(owner, row.name);
                    return fallbackTargetRejection(primary, modelId, row)
                        ? []
                        : [modelId];
                })
                .sort();
            return c.json({ data });
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create My Model",
            description:
                "Register a private or public community text or image model. Private is the default. Public models require an allowlisted account and may be free or priced. API keys require `account:keys`. The upstream bearer token is encrypted and never returned.",
            responses: {
                200: {
                    description: "Created community model",
                    content: {
                        "application/json": {
                            schema: resolver(CommunityEndpointResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid model configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            await ensureModelNameAvailable(db, user.id, input.name);
            const imagePricing =
                input.modality === "image" ? input.imagePricing : "request";
            enforceCommunityEndpointInputModalities(
                input.modality,
                input.inputModalities,
            );
            const prices =
                input.visibility === "public"
                    ? communityEndpointPricesForModality(
                          input,
                          input.modality,
                          imagePricing,
                      )
                    : communityEndpointPrices({});
            enforceCommunityEndpointPriceLimits(
                prices,
                input.modality,
                imagePricing,
            );
            const fallbackModelIds = input.fallbackModelIds
                ? await resolveFallbackModelIds(db, input.fallbackModelIds, {
                      modelId: communityModelId(
                          ownerGithubUsername,
                          input.name,
                      ),
                      ownerUserId: user.id,
                      modality: input.modality,
                      imagePricing,
                      prices,
                  })
                : [];
            await enforcePublishingAccess(db, user.id, input.visibility);
            const id = crypto.randomUUID();
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id,
                    ownerUserId: user.id,
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                    modality: input.modality,
                    imagePricing,
                    inputModalities: input.inputModalities,
                    baseUrl: normalizeInputBaseUrl(input.baseUrl),
                    upstreamModel: input.upstreamModel ?? input.name,
                    bearerTokenCiphertext: await encryptSecret(
                        normalizeInputBearerToken(input.bearerToken),
                        c.env.BETTER_AUTH_SECRET,
                    ),
                    visibility: input.visibility,
                    perUserRpm: input.perUserRpm ?? null,
                    fallbackModelIds,
                    ...prices,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(toResponse(row, ownerGithubUsername));
        },
    )
    .post(
        "/models",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Upstream Models",
            description:
                "Fetch OpenAI-compatible upstream model IDs before publishing a My Models endpoint. Requires community model publishing approval; API keys also require `account:keys`.",
            responses: {
                200: {
                    description: "Upstream model IDs",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointModelsResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Endpoint probe failed" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                429: { description: "Probe rate limited" },
            },
        }),
        validator("json", ModelListSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            await requireCommunityEndpointPublishAccess(db, user.id);
            const throttled = await enforceEndpointProbeThrottle(
                c,
                user.id,
                "models",
            );
            if (throttled) return throttled;
            try {
                const models = await listCommunityEndpointModels(input);
                return c.json({ data: models });
            } catch (error) {
                throwEndpointTestError(error);
            }
        },
    )
    .post(
        "/test",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Test My Model Endpoint",
            description:
                "Test an OpenAI-compatible upstream model before publishing it. Image tests detect token pricing and probe the derived `/images/edits` endpoint. Requires community model publishing approval; API keys also require `account:keys`.",
            responses: {
                200: {
                    description: "Endpoint test result",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointTestResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Endpoint test failed" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                429: { description: "Probe rate limited" },
            },
        }),
        validator("json", TestEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            await requireCommunityEndpointPublishAccess(db, user.id);
            const throttled = await enforceEndpointProbeThrottle(
                c,
                user.id,
                "test",
            );
            if (throttled) return throttled;
            try {
                const result =
                    input.modality === "image"
                        ? await testCommunityImageEndpoint(input)
                        : await testCommunityEndpoint(input);
                return c.json({
                    ok: true,
                    message:
                        input.modality === "image"
                            ? result.inputModalities?.includes("image")
                                ? "Generation and editing endpoints responded with image data"
                                : "Generation endpoint responded; editing is not supported"
                            : "Endpoint responded with usage",
                    ...result,
                });
            } catch (error) {
                throwEndpointTestError(error);
            }
        },
    )
    .post(
        "/:id/update",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update My Model",
            description:
                "Update a community model owned by the authenticated account. Changing visibility to public publishes it and requires an allowlisted account; public models may be free or priced. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Updated community model",
                    content: {
                        "application/json": {
                            schema: resolver(CommunityEndpointResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid model configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Community endpoint not found" },
            },
        }),
        validator("json", UpdateEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            const modality = normalizeCommunityEndpointModality(
                endpoint.modality,
            );
            if (input.inputModalities !== undefined) {
                enforceCommunityEndpointInputModalities(
                    modality,
                    input.inputModalities,
                );
            }
            await ensureModelNameAvailable(
                db,
                user.id,
                input.name ?? endpoint.name,
                id,
            );

            const update: Partial<
                typeof schema.communityEndpoint.$inferInsert
            > = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) update.name = input.name;
            if (input.title !== undefined) update.title = input.title;
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
            if (input.visibility !== undefined) {
                update.visibility = input.visibility;
            }
            if (input.perUserRpm !== undefined) {
                update.perUserRpm = input.perUserRpm;
            }
            if (input.inputModalities !== undefined) {
                update.inputModalities = input.inputModalities;
            }
            if (input.active !== undefined) {
                update.disabledAt = input.active ? null : new Date();
                update.disabledReason = input.active
                    ? null
                    : "Deactivated by owner";
                update.disabledBy = input.active ? null : "owner";
            }
            const storedImagePricing = normalizeCommunityEndpointImagePricing(
                endpoint.imagePricing,
            );
            const effectiveImagePricing =
                modality === "image" && input.imagePricing !== undefined
                    ? input.imagePricing
                    : storedImagePricing;
            update.imagePricing = effectiveImagePricing;
            for (const field of communityEndpointPriceFieldsForModality(
                modality,
                effectiveImagePricing,
            )) {
                if (input[field.key] !== undefined) {
                    update[field.key] = input[field.key];
                } else if (effectiveImagePricing !== storedImagePricing) {
                    // Switching modes changes the unit of the shared price
                    // columns (per image ↔ per token); stored values must not
                    // be reinterpreted, so unsent prices reset to free.
                    update[field.key] = 0;
                }
            }
            const effectiveVisibility = input.visibility ?? endpoint.visibility;
            // A private model is owner-only, so owner-declared public pricing
            // does not apply; making a published model private clears prices.
            const effectivePrices =
                effectiveVisibility === "private"
                    ? communityEndpointPrices({})
                    : communityEndpointPricesForModality(
                          { ...endpoint, ...update },
                          modality,
                          effectiveImagePricing,
                      );
            enforceCommunityEndpointPriceLimits(
                effectivePrices,
                modality,
                effectiveImagePricing,
            );
            // Validate against the prices this update actually persists, not
            // the stored ones. An unsent field keeps the stored targets: if a
            // later price change makes one too expensive, the generation
            // registry stops linking it at read time.
            if (input.fallbackModelIds) {
                update.fallbackModelIds = await resolveFallbackModelIds(
                    db,
                    input.fallbackModelIds,
                    {
                        modelId: communityModelId(
                            ownerGithubUsername,
                            input.name ?? endpoint.name,
                        ),
                        ownerUserId: user.id,
                        modality,
                        imagePricing: effectiveImagePricing,
                        prices: effectivePrices,
                    },
                );
            }
            await enforcePublishingAccess(db, user.id, effectiveVisibility);
            // Persist visibility together with the complete effective price
            // set on every update, so concurrent partial updates cannot
            // interleave into a public row with cleared prices.
            update.visibility = effectiveVisibility;
            Object.assign(update, effectivePrices);
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
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete My Model",
            description:
                "Delete a community model owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deleted community model",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointDeleteResponseSchema,
                            ),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Community endpoint not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
        },
    );

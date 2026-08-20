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
    type CommunityEndpointAdvertised,
    CommunityEndpointAdvertisedSchema,
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
    MAX_COMMUNITY_PRICE_PER_SECOND,
    MAX_COMMUNITY_PRICE_PER_TOKEN,
    MAX_FALLBACK_TARGETS,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
    normalizeCommunityEndpointAdvertised,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    normalizeCommunityEndpointInputModalities,
    normalizeCommunityProviderUrl,
    type ProxyListingPayload,
    parseCommunityModelId,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { ValidationError } from "@shared/http/validation-error.ts";
import { validator } from "@shared/middleware/validator.ts";
import {
    MODEL_INPUT_MODALITIES,
    type ModelInputModality,
} from "@shared/registry/registry.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { and, desc, eq, or } from "drizzle-orm";
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
    testCommunityTranscriptionEndpoint,
} from "../services/community-endpoint-openai.ts";
import { requireAccountPermission } from "./account-permissions.ts";

const ModalitySchema = z
    .enum(COMMUNITY_ENDPOINT_MODALITIES)
    .describe(
        'Upstream API family. "text" uses `/v1/chat/completions`; "image" uses `/v1/images/generations` and optionally `/v1/images/edits` when the endpoint test succeeds; "transcription" uses `/v1/audio/transcriptions`.',
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
const AdvertisedSchema = z
    .object(CommunityEndpointAdvertisedSchema.shape)
    .strict()
    .describe("Owner-declared catalog metadata for text models.");
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
                : field.priceUnit === "second"
                  ? MAX_COMMUNITY_PRICE_PER_SECOND
                  : MAX_COMMUNITY_PRICE_PER_TOKEN;
        if (price === undefined || price <= maxPrice) continue;

        const limit =
            field.priceUnit === "image"
                ? `${MAX_COMMUNITY_PRICE_PER_IMAGE} Pollen per image`
                : field.priceUnit === "second"
                  ? `${MAX_COMMUNITY_PRICE_PER_SECOND} Pollen per second`
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

function hasAdvertisedClaim(
    advertised: CommunityEndpointAdvertised | undefined,
): boolean {
    return Object.values(advertised ?? {}).some((value) =>
        Array.isArray(value) ? value.length > 0 : value != null,
    );
}

function enforceCommunityEndpointAdvertised(
    modality: CommunityEndpointModality,
    advertised: CommunityEndpointAdvertised | undefined,
): void {
    if (modality === "text" || !hasAdvertisedClaim(advertised)) return;
    throw new HTTPException(400, {
        message: "advertised metadata is only supported for text models",
    });
}

// Community fallback targets are restricted to public community models or
// private models owned by the same developer.
// Pointing a community model at a Pollinations-operated model is deliberately
// out of scope: static registry prices can be function-valued/dynamic, so the
// "same or lower price" comparison is not well-defined against them.
const FallbacksSchema = z
    .array(z.string().trim().min(1))
    .max(MAX_FALLBACK_TARGETS)
    .describe(
        'Community model ids ("<owner>/<name>") tried in order when this model\'s upstream fails, or an empty array to clear them. Each must be another listed community model of the same modality, public or owned by you, and priced at or below this model on every price field.',
    );

const SELF_FALLBACK_MESSAGE = "Fallback target cannot be the model itself";

type FallbackPrimary = {
    modelId: string;
    ownerUserId: string;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    prices: CommunityEndpointPrices;
    inputModalities?: readonly ModelInputModality[] | null;
};

function fallbackTargetMissingMessage(modelId: string): string {
    return `Fallback target ${modelId} does not exist`;
}

/**
 * Private or hidden rows owned by someone else must look identical to a
 * missing row. Distinct 400s were an existence oracle.
 */
function shouldConcealFallbackTarget(
    primary: FallbackPrimary,
    target: CommunityEndpointRow,
): boolean {
    if (target.ownerUserId === primary.ownerUserId) return false;
    return target.visibility === "private" || target.hiddenAt !== null;
}

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
    if (shouldConcealFallbackTarget(primary, target)) {
        return fallbackTargetMissingMessage(modelId);
    }
    if (target.hiddenAt !== null) {
        return `Fallback target ${modelId} must be listed`;
    }
    if (target.type !== "proxy") {
        return `Fallback target ${modelId} cannot delegate generation`;
    }
    if (
        target.visibility === "private" &&
        target.ownerUserId !== primary.ownerUserId
    ) {
        return `Fallback target ${modelId} must be public or owned by you`;
    }
    const payload = parseListingPayload("proxy", target.payload);
    if (!payload) {
        return `Fallback target ${modelId} has invalid configuration`;
    }
    const targetModality = payload.modality;
    if (targetModality !== primary.modality) {
        return `Fallback target ${modelId} is a ${targetModality} model, not ${primary.modality}`;
    }
    // The stored price columns mean different things in "request" and "tokens"
    // mode, so comparing across modes is meaningless.
    const targetImagePricing = payload.imagePricing;
    if (
        primary.modality === "image" &&
        targetImagePricing !== primary.imagePricing
    ) {
        return `Fallback target ${modelId} bills images per ${targetImagePricing}, not per ${primary.imagePricing}`;
    }
    const primaryInputs = normalizeCommunityEndpointInputModalities(
        primary.inputModalities,
        primary.modality,
    );
    const targetInputs = normalizeCommunityEndpointInputModalities(
        payload.inputModalities,
        targetModality,
    );
    if (
        primary.modality === "image" &&
        primaryInputs.includes("image") &&
        !targetInputs.includes("image")
    ) {
        return `Fallback target ${modelId} does not support image edits`;
    }
    const targetPrices = payload.prices;
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
async function resolveFallback(
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
    if (!target || shouldConcealFallbackTarget(primary, target)) {
        throw new HTTPException(400, {
            message: fallbackTargetMissingMessage(fallbackModelId),
        });
    }
    const rejection = fallbackTargetRejection(primary, fallbackModelId, target);
    if (rejection) throw new HTTPException(400, { message: rejection });
    return fallbackModelId;
}

// Resolves the whole declared list.
//
// A target can later be deleted, hidden, or repriced above the primary.
// There is no reconciliation job: the generation registry re-checks these same
// rules when it links entries, so this is a UX guard, not an invariant.
async function resolveFallbacks(
    db: Db,
    requested: string[],
    primary: FallbackPrimary,
): Promise<string[]> {
    const resolved: string[] = [];
    for (const id of requested) {
        const modelId = await resolveFallback(db, id, primary);
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
    .finite()
    .positive()
    .nullable()
    .describe(
        "Maximum requests per minute for each Pollinations user. Decimals are supported; 0.5 means one request every two minutes. Null means no Pollinations-side limit.",
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

// Proxies are created here. Prompt agents use /account/agents so their config
// and listing are written atomically; endpoint agents remain admin-created.
const ProxyCreateSchema = z
    .object({
        name: EndpointFieldsSchema.name,
        title: EndpointFieldsSchema.title,
        description: EndpointFieldsSchema.description,
        visibility: VisibilitySchema.optional().default("private"),
        baseUrl: EndpointFieldsSchema.baseUrl,
        bearerToken: EndpointFieldsSchema.bearerToken,
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        modality: ModalitySchema.optional().default("text"),
        imagePricing: ImagePricingSchema.optional().default("request"),
        // No blanket default: what an omitted set means depends on the
        // modality, so it is resolved in the handler once modality is known.
        inputModalities: InputModalitiesSchema.optional(),
        advertised: AdvertisedSchema.optional(),
        perUserRpm: PerUserRpmSchema.optional(),
        fallbacks: FallbacksSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .strict();
const CreateEndpointSchema = ProxyCreateSchema;
const CommonUpdateFieldsSchema = {
    name: EndpointFieldsSchema.name.optional(),
    title: EndpointFieldsSchema.title.optional(),
    description: EndpointFieldsSchema.description,
    visibility: VisibilitySchema.optional(),
    hidden: z.boolean().optional(),
} as const;
const ProxyUpdateSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        perUserRpm: PerUserRpmSchema.optional(),
        imagePricing: ImagePricingSchema.optional(),
        inputModalities: InputModalitiesSchema.optional(),
        advertised: AdvertisedSchema.optional(),
        fallbacks: FallbacksSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .strict();
const PromptAgentUpdateSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
    })
    .strict();
const EndpointAgentUpdateSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        perUserRpm: PerUserRpmSchema.optional(),
    })
    .strict();
// The public contract lists every updateable field without requiring clients to
// echo the row's immutable type. Once the row is loaded, its exact strict schema
// performs the authoritative parse and rejects fields from another listing kind.
const UpdateEndpointSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        perUserRpm: PerUserRpmSchema.optional(),
        imagePricing: ImagePricingSchema.optional(),
        inputModalities: InputModalitiesSchema.optional(),
        advertised: AdvertisedSchema.optional(),
        fallbacks: FallbacksSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .strict();

function assertValidUpdate(
    type: "proxy" | "prompt_agent" | "endpoint_agent",
    input: unknown,
): void {
    const selected =
        type === "proxy"
            ? ProxyUpdateSchema
            : type === "prompt_agent"
              ? PromptAgentUpdateSchema
              : EndpointAgentUpdateSchema;
    const result = selected.safeParse(input);
    if (!result.success) throw new ValidationError(result.error, "json");
}
const FallbackCandidatesResponseSchema = z.object({
    data: z.array(z.string()),
});
const ModelListSchema = z
    .object({
        baseUrl: z.string().url(),
        bearerToken: z.string().min(1),
    })
    .strict();
const TestEndpointSchema = z
    .object({
        baseUrl: z.string().url(),
        bearerToken: z.string().min(1),
        model: z.string().trim().min(1).max(253),
        modality: ModalitySchema.optional().default("text"),
    })
    .strict();
const ResponsePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, z.number()]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const CommunityEndpointResponseFieldsSchema = {
    id: z.string(),
    modelId: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    baseUrl: z.string().url(),
    upstreamModel: z.string().min(1),
    visibility: VisibilitySchema,
    hidden: z.boolean(),
    hiddenReason: z.string().nullable(),
    hiddenAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
} as const;
const ProxyEndpointResponseSchema = z
    .object({
        ...CommunityEndpointResponseFieldsSchema,
        type: z.literal("proxy"),
        modality: ModalitySchema,
        imagePricing: ImagePricingSchema,
        inputModalities: z.array(InputModalitySchema),
        advertised: AdvertisedSchema,
        perUserRpm: PerUserRpmSchema,
        fallbacks: z.array(z.string()),
        ...ResponsePriceFieldsSchema,
    })
    .strict();
const PromptAgentEndpointResponseSchema = z
    .object({
        ...CommunityEndpointResponseFieldsSchema,
        type: z.literal("prompt_agent"),
    })
    .strict();
const EndpointAgentEndpointResponseSchema = z
    .object({
        ...CommunityEndpointResponseFieldsSchema,
        type: z.literal("endpoint_agent"),
        perUserRpm: PerUserRpmSchema,
    })
    .strict();
const CommunityEndpointResponseSchema = z.discriminatedUnion("type", [
    ProxyEndpointResponseSchema,
    PromptAgentEndpointResponseSchema,
    EndpointAgentEndpointResponseSchema,
]);
const CommunityEndpointListResponseSchema = z.object({
    data: z.array(CommunityEndpointResponseSchema),
    provider: z.object({
        name: z.string().nullable(),
        url: z.string().url().nullable(),
    }),
});
const CommunityProviderProfileInputSchema = z
    .object({
        name: z.string().trim().max(COMMUNITY_PROVIDER_NAME_MAX_LENGTH),
        url: z.string().trim().max(COMMUNITY_PROVIDER_URL_MAX_LENGTH),
    })
    .strict();
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

// Anyone may register private endpoints for their own use and probe their own
// upstream. Publishing requires an allowlisted account.
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
                "Community model publishing requires approval. Models can stay private for your own use.",
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

function toResponse(
    row: CommunityEndpointRow,
    ownerGithubUsername: string,
    agentRuntimeUrl: string,
): z.infer<typeof CommunityEndpointResponseSchema> {
    const common = {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        title: communityEndpointTitle({
            modelId: communityModelId(ownerGithubUsername, row.name),
            title: row.title,
            description: row.description,
        }),
        description: row.description,
        baseUrl: row.type === "prompt_agent" ? agentRuntimeUrl : row.baseUrl,
        upstreamModel: row.upstreamModel,
        visibility: row.visibility,
        hidden: row.hiddenAt !== null,
        hiddenReason: row.hiddenReason,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
    if (row.type === "prompt_agent") {
        return CommunityEndpointResponseSchema.parse({
            ...common,
            type: row.type,
        });
    }
    if (row.type === "endpoint_agent") {
        const payload = parseListingPayload("endpoint_agent", row.payload);
        if (!payload) {
            throw new Error(`Invalid endpoint_agent payload for ${row.id}`);
        }
        return CommunityEndpointResponseSchema.parse({
            ...common,
            type: row.type,
            perUserRpm: payload.perUserRpm,
        });
    }
    const payload = parseListingPayload("proxy", row.payload);
    if (!payload) throw new Error(`Invalid proxy payload for ${row.id}`);
    const { bearerTokenCiphertext: _credential, prices, ...proxy } = payload;
    return CommunityEndpointResponseSchema.parse({
        ...common,
        type: row.type,
        ...proxy,
        advertised: normalizeCommunityEndpointAdvertised(
            payload.advertised,
            payload.modality,
        ),
        ...prices,
    });
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
            const rows = await db
                .select()
                .from(schema.communityEndpoint)
                .where(eq(schema.communityEndpoint.ownerUserId, user.id))
                .orderBy(desc(schema.communityEndpoint.createdAt));
            const owner = await db.query.user.findFirst({
                columns: {
                    communityProviderName: true,
                    communityProviderUrl: true,
                },
                where: eq(schema.user.id, user.id),
            });
            return c.json(
                CommunityEndpointListResponseSchema.parse({
                    data: rows.map((endpoint) =>
                        toResponse(
                            endpoint,
                            ownerGithubUsername,
                            c.env.AGENT_RUNTIME_BASE_URL,
                        ),
                    ),
                    provider: {
                        name: owner?.communityProviderName ?? null,
                        url: owner?.communityProviderUrl ?? null,
                    },
                }),
            );
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
                "Community models this model may declare as fallbacks: listed, public or owned by you, same modality, and priced at or below it on every price field. Computed with the same rule the update endpoint validates against, so every id listed here is accepted. Eligibility is re-checked when a request is routed, so a target repriced above this model afterwards stops serving without changing the stored list.",
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
            if (endpoint.type !== "proxy") return c.json({ data: [] });
            const endpointPayload = parseListingPayload(
                "proxy",
                endpoint.payload,
            );
            if (!endpointPayload) {
                throw new Error(`Invalid proxy payload for ${endpoint.id}`);
            }
            const primary: FallbackPrimary = {
                modelId: communityModelId(ownerGithubUsername, endpoint.name),
                ownerUserId: user.id,
                modality: endpointPayload.modality,
                imagePricing: endpointPayload.imagePricing,
                prices: endpointPayload.prices,
                inputModalities: endpointPayload.inputModalities,
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
                "Register a private or public community text, image, or transcription model. Private is the default. Public models require an allowlisted account and may be free or priced. API keys require `account:keys`. The upstream bearer token is encrypted and never returned.",
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
            const modality = input.modality;
            const imagePricing =
                modality === "image" ? input.imagePricing : "request";
            // An omitted set follows the modality — audio for transcription,
            // text otherwise. An explicit set is validated rather than
            // silently rewritten, so a wrong declaration still gets a 400.
            const inputModalities =
                input.inputModalities ??
                normalizeCommunityEndpointInputModalities(undefined, modality);
            enforceCommunityEndpointInputModalities(modality, inputModalities);
            enforceCommunityEndpointAdvertised(modality, input.advertised);
            const prices =
                input.visibility === "public"
                    ? communityEndpointPricesForModality(
                          input,
                          modality,
                          imagePricing,
                      )
                    : communityEndpointPrices({});
            enforceCommunityEndpointPriceLimits(prices, modality, imagePricing);
            const payload: ProxyListingPayload = {
                modality,
                imagePricing,
                inputModalities,
                bearerTokenCiphertext: await encryptSecret(
                    normalizeInputBearerToken(input.bearerToken),
                    c.env.BETTER_AUTH_SECRET,
                ),
                perUserRpm: input.perUserRpm ?? null,
                fallbacks: input.fallbacks
                    ? await resolveFallbacks(db, input.fallbacks, {
                          modelId: communityModelId(
                              ownerGithubUsername,
                              input.name,
                          ),
                          ownerUserId: user.id,
                          modality,
                          imagePricing,
                          prices,
                          inputModalities,
                      })
                    : [],
                ...(hasAdvertisedClaim(input.advertised)
                    ? { advertised: input.advertised }
                    : {}),
                prices,
            };
            await enforcePublishingAccess(db, user.id, input.visibility);
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id: crypto.randomUUID(),
                    ownerUserId: user.id,
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                    visibility: input.visibility,
                    type: "proxy",
                    baseUrl: normalizeInputBaseUrl(input.baseUrl),
                    upstreamModel: input.upstreamModel ?? input.name,
                    payload: JSON.stringify(payload),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(
                toResponse(
                    row,
                    ownerGithubUsername,
                    c.env.AGENT_RUNTIME_BASE_URL,
                ),
            );
        },
    )
    .post(
        "/models",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Upstream Models",
            description:
                "Fetch OpenAI-compatible upstream model IDs from a provider before registering a My Models endpoint. Limited to one probe every 30 seconds per account. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
                "Test an OpenAI-compatible upstream model before registering it. Image tests detect the image pricing mode and probe the derived `/images/edits` endpoint. Limited to one probe every 30 seconds per account. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
                        : input.modality === "transcription"
                          ? await testCommunityTranscriptionEndpoint(input)
                          : await testCommunityEndpoint(input);
                return c.json({
                    ok: true,
                    message:
                        input.modality === "image"
                            ? result.inputModalities?.includes("image")
                                ? "Generation and editing endpoints responded with image data"
                                : "Generation endpoint responded; editing is not supported"
                            : input.modality === "transcription"
                              ? "Endpoint responded with transcription text"
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
            // The row already owns its immutable type. Validate the external
            // body against that exact strict Zod schema instead of asking
            // every client to echo a redundant discriminator.
            assertValidUpdate(endpoint.type, input);
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
            if (input.hidden !== undefined) {
                update.hiddenAt = input.hidden ? new Date() : null;
                update.hiddenReason = input.hidden ? "Hidden by owner" : null;
                update.hiddenBy = input.hidden ? "owner" : null;
            }
            const effectiveVisibility = input.visibility ?? endpoint.visibility;
            await enforcePublishingAccess(db, user.id, effectiveVisibility);
            update.visibility = effectiveVisibility;
            if (endpoint.type === "prompt_agent") {
                // Prompt configuration is edited through /account/agents.
                // This route only updates shared listing state such as hidden.
            } else if (endpoint.type === "endpoint_agent") {
                if (!parseListingPayload("endpoint_agent", endpoint.payload)) {
                    throw new Error(
                        `Invalid endpoint_agent payload for ${endpoint.id}`,
                    );
                }
                if (input.baseUrl !== undefined) {
                    update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
                }
                if (input.upstreamModel !== undefined) {
                    update.upstreamModel = input.upstreamModel;
                }
                if (input.perUserRpm !== undefined) {
                    update.payload = JSON.stringify({
                        perUserRpm: input.perUserRpm,
                    });
                }
            } else {
                const stored = parseListingPayload("proxy", endpoint.payload);
                if (!stored) {
                    throw new Error(`Invalid proxy payload for ${endpoint.id}`);
                }
                const modality = stored.modality;
                const inputModalities =
                    input.inputModalities ?? stored.inputModalities;
                enforceCommunityEndpointInputModalities(
                    modality,
                    inputModalities,
                );
                enforceCommunityEndpointAdvertised(modality, input.advertised);
                const imagePricing =
                    modality === "image" && input.imagePricing !== undefined
                        ? input.imagePricing
                        : stored.imagePricing;
                const priceSource = { ...stored.prices, ...input };
                if (imagePricing !== stored.imagePricing) {
                    for (const field of communityEndpointPriceFieldsForModality(
                        modality,
                        imagePricing,
                    )) {
                        if (input[field.key] === undefined) {
                            priceSource[field.key] = 0;
                        }
                    }
                }
                const prices =
                    effectiveVisibility === "private"
                        ? communityEndpointPrices({})
                        : communityEndpointPricesForModality(
                              priceSource,
                              modality,
                              imagePricing,
                          );
                enforceCommunityEndpointPriceLimits(
                    prices,
                    modality,
                    imagePricing,
                );
                const fallbacks =
                    input.fallbacks === undefined
                        ? stored.fallbacks
                        : await resolveFallbacks(db, input.fallbacks, {
                              modelId: communityModelId(
                                  ownerGithubUsername,
                                  input.name ?? endpoint.name,
                              ),
                              ownerUserId: user.id,
                              modality,
                              imagePricing,
                              prices,
                              inputModalities,
                          });
                if (input.baseUrl !== undefined) {
                    update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
                }
                if (input.upstreamModel !== undefined) {
                    update.upstreamModel = input.upstreamModel;
                }
                const changesPayload = [
                    input.bearerToken,
                    input.visibility,
                    input.perUserRpm,
                    input.imagePricing,
                    input.inputModalities,
                    input.advertised,
                    input.fallbacks,
                    ...COMMUNITY_ENDPOINT_PRICE_FIELDS.map(
                        ({ key }) => input[key],
                    ),
                ].some((value) => value !== undefined);
                if (changesPayload) {
                    const payload: ProxyListingPayload = {
                        bearerTokenCiphertext:
                            input.bearerToken === undefined
                                ? stored.bearerTokenCiphertext
                                : await encryptSecret(
                                      normalizeInputBearerToken(
                                          input.bearerToken,
                                      ),
                                      c.env.BETTER_AUTH_SECRET,
                                  ),
                        modality,
                        imagePricing,
                        inputModalities,
                        perUserRpm:
                            input.perUserRpm === undefined
                                ? stored.perUserRpm
                                : input.perUserRpm,
                        fallbacks,
                        advertised:
                            input.advertised === undefined
                                ? stored.advertised
                                : hasAdvertisedClaim(input.advertised)
                                  ? input.advertised
                                  : undefined,
                        prices,
                    };
                    update.payload = JSON.stringify(payload);
                }
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
            return c.json(
                toResponse(
                    row,
                    ownerGithubUsername,
                    c.env.AGENT_RUNTIME_BASE_URL,
                ),
            );
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

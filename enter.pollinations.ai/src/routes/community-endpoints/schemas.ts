import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES,
    COMMUNITY_ENDPOINT_MODALITIES,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    COMMUNITY_PROVIDER_NAME_MAX_LENGTH,
    COMMUNITY_PROVIDER_URL_MAX_LENGTH,
    CommunityEndpointAdvertisedSchema,
    type CommunityEndpointPriceKey,
    MAX_FALLBACK_TARGETS,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
} from "@shared/community-endpoints.ts";
import { ValidationError } from "@shared/http/validation-error.ts";
import { MODEL_INPUT_MODALITIES } from "@shared/registry/registry.ts";
import { SAFETY_FEATURES } from "@shared/schemas/safety.ts";
import { z } from "zod";

const ModalitySchema = z
    .enum(COMMUNITY_ENDPOINT_MODALITIES)
    .describe(
        'Upstream API family. "text" uses `/v1/chat/completions`; "image" uses `/v1/images/generations` and optionally `/v1/images/edits`; "video" calls the exact configured URL; "transcription" uses `/v1/audio/transcriptions`; "speech" uses `/v1/audio/speech`.',
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
export const RequiredSafetyFeaturesSchema = z
    .array(z.enum(SAFETY_FEATURES))
    .max(SAFETY_FEATURES.length)
    .describe(
        "Input safety checks callers cannot disable. Use sexual and violence to block harmful prompts before they reach the provider.",
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
        'Pollen price. Token rates are per token internally (the dashboard displays per 1M); `completionImagePrice` is per generated image when `imagePricing` is "request"; `completionVideoPrice` is per generated second.',
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
const FallbacksSchema = z
    .array(z.string().trim().min(1))
    .max(MAX_FALLBACK_TARGETS)
    .describe(
        'Community model ids ("<owner>/<name>") tried in order when this model\'s upstream fails, or an empty array to clear them. Each must be another listed community model of the same modality, public or owned by you, and priced at or below this model on every price field.',
    );
const VisibilitySchema = z
    .enum(COMMUNITY_ENDPOINT_VISIBILITIES)
    .describe(
        '"private": owner-only, shown only to the owner, with no owner-set price. "public": anyone and listed in the catalog; it may be free or priced. Publishing requires an allowlisted account.',
    );
const PaidOnlySchema = z
    .boolean()
    .describe(
        "Restrict callers to spending Paid Pollen on this model. Use it when the upstream bills per use, so Quest Pollen cannot cover the price and leave you paying the inference cost.",
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
            "OpenAI-compatible `/v1` base URL or full chat, image, transcription, or speech URL. For video, the exact generation URL.",
        ),
    upstreamModel: z.string().trim().min(1).max(253).optional(),
    bearerToken: z.string().min(1),
} as const;

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
        inputModalities: InputModalitiesSchema.optional(),
        requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional().default(
            [],
        ),
        advertised: AdvertisedSchema.optional(),
        perUserRpm: PerUserRpmSchema.optional(),
        paidOnly: PaidOnlySchema.optional().default(false),
        fallbacks: FallbacksSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .strict();
export const CreateEndpointSchema = ProxyCreateSchema;
export type ProxyCreateInput = z.infer<typeof ProxyCreateSchema>;

export const CreateEndpointAgentSchema = z
    .object({
        name: EndpointFieldsSchema.name,
        title: EndpointFieldsSchema.title,
        description: EndpointFieldsSchema.description,
        visibility: VisibilitySchema.optional().default("private"),
        baseUrl: EndpointFieldsSchema.baseUrl,
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional().default(
            [],
        ),
        perUserRpm: PerUserRpmSchema.optional().default(null),
    })
    .strict();

const CommonUpdateFieldsSchema = {
    name: EndpointFieldsSchema.name.optional(),
    title: EndpointFieldsSchema.title.optional(),
    description: EndpointFieldsSchema.description,
    visibility: VisibilitySchema.optional(),
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema.optional(),
    hidden: z.boolean().optional(),
} as const;
const ProxyUpdateSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        perUserRpm: PerUserRpmSchema.optional(),
        paidOnly: PaidOnlySchema.optional(),
        imagePricing: ImagePricingSchema.optional(),
        inputModalities: InputModalitiesSchema.optional(),
        advertised: AdvertisedSchema.optional(),
        fallbacks: FallbacksSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .strict();
export type ProxyUpdateInput = z.infer<typeof ProxyUpdateSchema>;
const PromptAgentUpdateSchema = z.object(CommonUpdateFieldsSchema).strict();
const EndpointAgentUpdateSchema = z
    .object({
        ...CommonUpdateFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        perUserRpm: PerUserRpmSchema.optional(),
    })
    .strict();

export const UpdateEndpointSchema = ProxyUpdateSchema;

const UPDATE_SCHEMA_BY_TYPE = {
    proxy: ProxyUpdateSchema,
    prompt_agent: PromptAgentUpdateSchema,
    endpoint_agent: EndpointAgentUpdateSchema,
} as const;

export function assertValidUpdate(
    type: keyof typeof UPDATE_SCHEMA_BY_TYPE,
    input: unknown,
): void {
    const result = UPDATE_SCHEMA_BY_TYPE[type].safeParse(input);
    if (!result.success) throw new ValidationError(result.error, "json");
}

export const FallbackCandidatesResponseSchema = z.object({
    data: z.array(z.string()),
});
export const ModelListSchema = z
    .object({
        baseUrl: z.string().url(),
        bearerToken: z.string().min(1),
    })
    .strict();
export const TestEndpointSchema = z
    .object({
        baseUrl: z.string().url(),
        bearerToken: z.string().min(1),
        model: z.string().trim().min(1).max(253).optional(),
        modality: ModalitySchema.optional().default("text"),
    })
    .strict()
    .superRefine((input, ctx) => {
        if (input.modality !== "video" && !input.model) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["model"],
                message: "model is required unless modality is video",
            });
        }
    });
const ResponsePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, z.number()]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const PendingCommunityEndpointChangeSchema = z
    .object({
        effectiveAt: z.string().datetime(),
        visibility: z.literal("public").optional(),
        paidOnly: z.boolean().optional(),
        imagePricing: ImagePricingSchema.optional(),
        ...Object.fromEntries(
            COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
                field.key,
                z.number().optional(),
            ]),
        ),
    })
    .strict()
    .nullable();
const CommunityEndpointResponseFieldsSchema = {
    id: z.string(),
    modelId: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    baseUrl: z.string().url(),
    upstreamModel: z.string().min(1),
    visibility: VisibilitySchema,
    requiredSafetyFeatures: RequiredSafetyFeaturesSchema,
    pending: PendingCommunityEndpointChangeSchema,
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
        paidOnly: z.boolean(),
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
export const EndpointAgentResponseSchema = z
    .object({
        ...CommunityEndpointResponseFieldsSchema,
        type: z.literal("endpoint_agent"),
        perUserRpm: PerUserRpmSchema,
    })
    .strict();
export const CommunityEndpointResponseSchema = z.discriminatedUnion("type", [
    ProxyEndpointResponseSchema,
    PromptAgentEndpointResponseSchema,
    EndpointAgentResponseSchema,
]);
export type CommunityEndpointResponse = z.infer<
    typeof CommunityEndpointResponseSchema
>;
export const CommunityEndpointListResponseSchema = z.object({
    data: z.array(CommunityEndpointResponseSchema),
    provider: z.object({
        name: z.string().nullable(),
        url: z.string().url().nullable(),
    }),
});
export const CommunityProviderProfileInputSchema = z
    .object({
        name: z.string().trim().max(COMMUNITY_PROVIDER_NAME_MAX_LENGTH),
        url: z.string().trim().max(COMMUNITY_PROVIDER_URL_MAX_LENGTH),
    })
    .strict();
export const CommunityProviderProfileResponseSchema = z.object({
    name: z.string().nullable(),
    url: z.string().url().nullable(),
});
export const CommunityEndpointModelsResponseSchema = z.object({
    data: z.array(z.string()),
});
export const CommunityEndpointTestResponseSchema = z
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
export const CommunityEndpointDeleteResponseSchema = z.object({
    id: z.string(),
});

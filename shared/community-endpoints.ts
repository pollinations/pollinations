import { z } from "zod";
import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
import { MCP_SERVER_IDS } from "./registry/mcp.ts";
import type { ModelCapability } from "./registry/model-info.ts";
import {
    type Category,
    MODEL_INPUT_MODALITIES,
    type ModelDefinition,
    type ModelInputModality,
    type ModelOutputModality,
    type PriceDefinition,
} from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    OPENAI_EMBEDDING_USAGE_PATHS,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";
import type { SafetyFeature } from "./schemas/safety.ts";

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_MODEL_REWARD_RATE = 0.75;
export const COMMUNITY_ENDPOINT_CHANGE_DELAY_MS = 3 * 60 * 60 * 1000;
export const COMMUNITY_ENDPOINT_MODALITIES = [
    "text",
    "image",
    "video",
    "transcription",
    "speech",
    "embedding",
] as const;
// How a community image endpoint is billed. "request" charges the fixed
// per-image price once per generation; "tokens" charges the provider-returned
// OpenAI image token usage against per-1M prices. The mode is detected by the
// registration probe: endpoints that return valid image token usage get
// "tokens", everything else falls back to "request".
export const COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES = [
    "request",
    "tokens",
] as const;
// Display name shown in the catalog and dashboard, separate from the callable
// slug (`name`) and the optional longer `description`.
export const COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH = 42;
export const COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH = 160;
export const COMMUNITY_PROVIDER_NAME_MAX_LENGTH = 42;
export const COMMUNITY_PROVIDER_URL_MAX_LENGTH = 2048;
// Zero is free; positive owner-declared prices start at this floor.
export const MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS = 0.000001;
export const MIN_COMMUNITY_PRICE_PER_TOKEN =
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS / 1_000_000;
// Keep typos and malicious configurations from exposing callers to extreme
// charges.
export const MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS = 50;
export const MAX_COMMUNITY_PRICE_PER_TOKEN =
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS / 1_000_000;
export const MAX_COMMUNITY_PRICE_PER_IMAGE = 0.25;
// Community publishers need room for premium video backends while callers
// still need protection from accidental or abusive per-second prices.
export const MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND = 0.5;
// Per-second audio (STT/TTS) prices are tiny compared to per-token rates, so
// this ceiling is written per minute and divided down: $0.012/min is ~2x
// OpenAI whisper ($0.006/min) and ~3x the priciest first-party STT model
// (scribe, $0.00367/min). Keep the division visible — a bare 0.006 here reads
// like OpenAI's per-minute rate but would bill 60x that per second.
export const MAX_COMMUNITY_PRICE_PER_SECOND = 0.012 / 60;
// How long we wait on a community endpoint before giving up. Generous because
// these are self-hosted hobby GPUs that cold-start, and in line with the text
// providers (Portkey and Azure both use 290s). Workers impose no wall-clock
// limit of their own, so without this a hung endpoint would hold the request
// open until the caller disconnects.
export const COMMUNITY_ENDPOINT_TIMEOUT_MS = 300_000;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

export type CommunityEndpointModality =
    (typeof COMMUNITY_ENDPOINT_MODALITIES)[number];

export const MAX_COMMUNITY_CONTEXT_LENGTH = 10_000_000;

export const COMMUNITY_ENDPOINT_CAPABILITIES = [
    "tool_calling",
    "reasoning",
] as const satisfies readonly ModelCapability[];

export type CommunityEndpointCapability =
    (typeof COMMUNITY_ENDPOINT_CAPABILITIES)[number];

export const CommunityEndpointAdvertisedSchema = z
    .object({
        capabilities: z
            .array(z.enum(COMMUNITY_ENDPOINT_CAPABILITIES))
            .optional(),
        contextLength: z
            .number()
            .int()
            .positive()
            .max(MAX_COMMUNITY_CONTEXT_LENGTH)
            .optional(),
    })
    .strict();

export type CommunityEndpointAdvertised = z.infer<
    typeof CommunityEndpointAdvertisedSchema
>;

export function normalizeCommunityEndpointAdvertised(
    value: CommunityEndpointAdvertised | null | undefined,
    modality: CommunityEndpointModality,
): CommunityEndpointAdvertised {
    if (!value || modality !== "text") return {};
    const advertised: CommunityEndpointAdvertised = {};
    if (value.capabilities?.length) {
        const declared = new Set<string>(value.capabilities);
        const capabilities = COMMUNITY_ENDPOINT_CAPABILITIES.filter(
            (capability) => declared.has(capability),
        );
        if (capabilities.length) advertised.capabilities = capabilities;
    }
    if (value.contextLength) advertised.contextLength = value.contextLength;
    return advertised;
}

export type CommunityEndpointImagePricing =
    (typeof COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES)[number];

const COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE = {
    promptTextTokens: {
        key: "promptTextPrice",
        label: "Prompt text",
        priceUnit: "million",
    },
    promptCachedTokens: {
        key: "promptCachedPrice",
        label: "Prompt cached",
        priceUnit: "million",
    },
    promptCacheWriteTokens: {
        key: "promptCacheWritePrice",
        label: "Prompt cache write",
        priceUnit: "million",
    },
    promptAudioTokens: {
        key: "promptAudioPrice",
        label: "Prompt audio",
        priceUnit: "million",
    },
    promptImageTokens: {
        key: "promptImagePrice",
        label: "Prompt image",
        priceUnit: "million",
    },
    completionTextTokens: {
        key: "completionTextPrice",
        label: "Completion text",
        priceUnit: "million",
    },
    completionReasoningTokens: {
        key: "completionReasoningPrice",
        label: "Completion reasoning",
        priceUnit: "million",
    },
    completionAudioTokens: {
        key: "completionAudioPrice",
        label: "Completion audio",
        priceUnit: "million",
    },
} as const satisfies Record<
    OpenAIChatUsageType,
    { key: string; label: string; priceUnit: "million" }
>;

const COMMUNITY_TEXT_PRICE_FIELDS = OPENAI_CHAT_USAGE_TYPES.map(
    (usageType) => ({
        usageType,
        rawUsagePaths: OPENAI_CHAT_USAGE_PATHS[usageType],
        ...COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE[usageType],
    }),
) as readonly {
    key: (typeof COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE)[OpenAIChatUsageType]["key"];
    usageType: OpenAIChatUsageType;
    label: string;
    priceUnit: "million";
    rawUsagePaths: readonly string[];
}[];

const COMMUNITY_IMAGE_PRICE_FIELD = {
    key: "completionImagePrice",
    usageType: "completionImageTokens",
    label: "Generated image",
    priceUnit: "image",
    rawUsagePaths: ["images"],
} as const;

// Token-mode image fields reuse the stored price columns but are priced per
// 1M tokens against the OpenAI images usage shape (input_tokens_details.*,
// output_tokens) instead of per generated image.
const COMMUNITY_IMAGE_TOKEN_PRICE_FIELDS = [
    {
        key: "promptTextPrice",
        usageType: "promptTextTokens",
        label: "Prompt text",
        priceUnit: "million",
        rawUsagePaths: ["input_tokens_details.text_tokens"],
    },
    {
        key: "promptImagePrice",
        usageType: "promptImageTokens",
        label: "Prompt image",
        priceUnit: "million",
        rawUsagePaths: ["input_tokens_details.image_tokens"],
    },
    {
        key: "completionImagePrice",
        usageType: "completionImageTokens",
        label: "Generated image",
        priceUnit: "million",
        rawUsagePaths: ["output_tokens"],
    },
] as const;

// Transcription endpoints bill audio input duration in seconds against the
// same prompt audio price column, mirroring the first-party whisper/scribe
// models (cost keyed on promptAudioSeconds at a per-second rate).
const COMMUNITY_TRANSCRIPTION_PRICE_FIELD = {
    key: "promptAudioPrice",
    usageType: "promptAudioSeconds",
    label: "Prompt audio",
    priceUnit: "second",
    // Paths are relative to the stored usage object, same as the chat fields
    // ("prompt_tokens", not "usage.prompt_tokens"). The probe normalizes every
    // upstream duration shape to `duration`, so that is the only key here.
    rawUsagePaths: ["duration"],
} as const;

// Speech (TTS) endpoints bill the synthesized text length in characters
// against the completion audio price column, mirroring the first-party
// elevenlabs models (cost keyed on completionAudioTokens at a per-1M rate).
// The gateway counts the characters itself, so the meter cannot go missing
// the way an upstream-reported duration can.
const COMMUNITY_SPEECH_PRICE_FIELD = {
    key: "completionAudioPrice",
    usageType: "completionAudioTokens",
    label: "Completion audio",
    priceUnit: "million",
    // The probe reports the probe text's length under `characters` so the
    // pricing UI can mark the row this field bills.
    rawUsagePaths: ["characters"],
} as const;

// Community video endpoints are billed from the duration Pollinations sends.
const COMMUNITY_VIDEO_PRICE_FIELD = {
    key: "completionVideoPrice",
    usageType: "completionVideoSeconds",
    label: "Generated video",
    priceUnit: "video_second",
    rawUsagePaths: ["duration"],
} as const;

export const COMMUNITY_ENDPOINT_PRICE_FIELDS = [
    ...COMMUNITY_TEXT_PRICE_FIELDS,
    COMMUNITY_IMAGE_PRICE_FIELD,
    COMMUNITY_TRANSCRIPTION_PRICE_FIELD,
    COMMUNITY_VIDEO_PRICE_FIELD,
] as const;

const COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_IMAGE_PRICE_FIELD,
] as const;

const COMMUNITY_TRANSCRIPTION_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_TRANSCRIPTION_PRICE_FIELD,
] as const;

const COMMUNITY_SPEECH_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_SPEECH_PRICE_FIELD,
] as const;

const COMMUNITY_VIDEO_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_VIDEO_PRICE_FIELD,
] as const;

// Embedding endpoints bill token usage per 1M like text models. Token-only
// billing through promptTextPrice — no fixed per-request mode.
const COMMUNITY_EMBEDDING_ENDPOINT_PRICE_FIELDS = [
    {
        key: "promptTextPrice",
        usageType: "promptTextTokens",
        label: "Prompt text",
        priceUnit: "million",
        rawUsagePaths: OPENAI_EMBEDDING_USAGE_PATHS.promptTextTokens,
    },
] as const;

export type CommunityEndpointPriceField =
    | (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number]
    | (typeof COMMUNITY_IMAGE_TOKEN_PRICE_FIELDS)[number]
    | (typeof COMMUNITY_TRANSCRIPTION_ENDPOINT_PRICE_FIELDS)[number]
    | (typeof COMMUNITY_EMBEDDING_ENDPOINT_PRICE_FIELDS)[number];

type CommunityModalitySpec = {
    category: Category;
    inputModalities: readonly ModelInputModality[];
    outputModalities: readonly ModelOutputModality[];
    supportedEndpoints: readonly string[];
    // Specialized categories such as transcription must reject sibling routes
    // unless the route explicitly opts into this endpoint list.
    restrictDefinitionEndpoints?: boolean;
    endpointsByInputModality?: Partial<
        Record<ModelInputModality, readonly string[]>
    >;
    priceFields: readonly CommunityEndpointPriceField[];
    tokenPriceFields?: readonly CommunityEndpointPriceField[];
};

/**
 * Maps each community upstream API shape to the ordinary catalog contract it
 * publishes. The upstream modality deliberately remains distinct from the
 * catalog category: transcription endpoints, for example, are catalogued as
 * audio models with text output.
 */
export const COMMUNITY_MODALITY_SPEC = {
    text: {
        category: "text",
        inputModalities: MODEL_INPUT_MODALITIES,
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/chat/completions", "/text", "/text/{prompt}"],
        priceFields: COMMUNITY_TEXT_PRICE_FIELDS,
    },
    image: {
        category: "image",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        supportedEndpoints: ["/v1/images/generations", "/image/{prompt}"],
        endpointsByInputModality: { image: ["/v1/images/edits"] },
        priceFields: COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS,
        tokenPriceFields: COMMUNITY_IMAGE_TOKEN_PRICE_FIELDS,
    },
    video: {
        category: "video",
        inputModalities: MODEL_INPUT_MODALITIES,
        outputModalities: ["video"],
        supportedEndpoints: [
            "/v1/images/generations",
            "/image/{prompt}",
            "/video/{prompt}",
        ],
        priceFields: COMMUNITY_VIDEO_ENDPOINT_PRICE_FIELDS,
    },
    transcription: {
        category: "audio",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/audio/transcriptions"],
        restrictDefinitionEndpoints: true,
        priceFields: COMMUNITY_TRANSCRIPTION_ENDPOINT_PRICE_FIELDS,
    },
    speech: {
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        supportedEndpoints: ["/v1/audio/speech", "/audio/{text}"],
        restrictDefinitionEndpoints: true,
        priceFields: COMMUNITY_SPEECH_ENDPOINT_PRICE_FIELDS,
    },
    embedding: {
        category: "embedding",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        supportedEndpoints: ["/v1/embeddings"],
        priceFields: COMMUNITY_EMBEDDING_ENDPOINT_PRICE_FIELDS,
    },
} as const satisfies Record<CommunityEndpointModality, CommunityModalitySpec>;

export function communityEndpointPriceFieldsForModality(
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing = "request",
): readonly CommunityEndpointPriceField[] {
    const spec: CommunityModalitySpec = COMMUNITY_MODALITY_SPEC[modality];
    if (imagePricing === "tokens" && spec.tokenPriceFields) {
        return spec.tokenPriceFields;
    }
    return spec.priceFields;
}

export function communityEndpointSupportedEndpoints(
    modality: CommunityEndpointModality,
    inputModalities: readonly ModelInputModality[],
): string[] {
    const spec: CommunityModalitySpec = COMMUNITY_MODALITY_SPEC[modality];
    const endpoints = [...spec.supportedEndpoints];
    for (const inputModality of inputModalities) {
        endpoints.push(
            ...(spec.endpointsByInputModality?.[inputModality] ?? []),
        );
    }
    return endpoints;
}

export type CommunityEndpointPriceKey =
    (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number]["key"];

export type CommunityEndpointPrices = Record<CommunityEndpointPriceKey, number>;

export function communityEndpointPrices(
    source: Partial<CommunityEndpointPrices>,
): CommunityEndpointPrices {
    return Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
            field.key,
            source[field.key] ?? 0,
        ]),
    ) as CommunityEndpointPrices;
}

/**
 * True when the owner charges nothing for calling this endpoint. The price set
 * must be complete — a missing field is not a free one.
 */
export function isFreeCommunityEndpoint(
    prices: CommunityEndpointPrices,
): boolean {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.every(
        (field) => prices[field.key] === 0,
    );
}

export function communityEndpointPricesForModality(
    source: Partial<CommunityEndpointPrices>,
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing = "request",
): CommunityEndpointPrices {
    const allowed = new Set(
        communityEndpointPriceFieldsForModality(modality, imagePricing).map(
            (field) => field.key,
        ),
    );
    return Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
            field.key,
            allowed.has(field.key) ? (source[field.key] ?? 0) : 0,
        ]),
    ) as CommunityEndpointPrices;
}

/**
 * Bounds how much latency one request can spend failing before it gives up:
 * every extra target is another upstream timeout the caller waits through.
 * Enforced on write and re-applied when the generation registry links entries.
 */
export const MAX_FALLBACK_TARGETS = 3;

/**
 * True when `target` costs no more than `primary` on every price field.
 *
 * The caller is charged the primary's price whichever endpoint serves, so this
 * bounds the PAYOUT rather than the invoice: a rescuer is paid on their own
 * listing, and this rule is what guarantees that stays at or below what was
 * charged. It also stops an owner routing traffic to a pricier model whose
 * owner would then earn more than the caller was quoted.
 */
export function isCommunityFallbackPricingAllowed(
    primary: CommunityEndpointPrices,
    target: CommunityEndpointPrices,
): boolean {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.every(
        (field) => target[field.key] <= primary[field.key],
    );
}

/**
 * A fallback cannot require a balance bucket the caller was never required to
 * have for the primary model. A paid-only primary may fall back to either kind.
 */
export function isCommunityFallbackBalanceAllowed(
    primary: { paidOnly: boolean },
    target: { paidOnly: boolean },
): boolean {
    return !target.paidOnly || primary.paidOnly;
}

export function normalizeCommunityEndpointModality(
    value: string | null | undefined,
): CommunityEndpointModality {
    if (value === "transcription") return "transcription";
    if (value === "speech") return "speech";
    if (value === "video") return "video";
    if (value === "image") return "image";
    if (value === "embedding") return "embedding";
    return "text";
}

export function normalizeCommunityEndpointImagePricing(
    value: string | null | undefined,
): CommunityEndpointImagePricing {
    return value === "tokens" ? "tokens" : "request";
}

export function normalizeCommunityEndpointInputModalities(
    value: readonly ModelInputModality[] | null | undefined,
    endpointModality: CommunityEndpointModality,
): ModelInputModality[] {
    // Both empty cases — nothing declared, and a declared set that shares
    // nothing with this modality — fall back to the modality's own first
    // input: text for text, image, and video endpoints; audio for transcription.
    // Falling back to a bare "text" would hand a transcription endpoint the
    // one input it cannot accept, which the write path then rejects with a
    // 400 naming an input the owner never chose.
    const permitted = COMMUNITY_MODALITY_SPEC[endpointModality].inputModalities;
    const declared = new Set(value ?? []);
    const normalized = permitted.filter((modality) => declared.has(modality));
    return normalized.length ? [...normalized] : [permitted[0]];
}

// Access/visibility of a registered endpoint. Private is the default; choosing
// public on create or update is allowlist-gated.
//   private → owner-only callable, shown only to the owner, no owner-set price
//   public  → anyone callable, listed in the model catalog, priced
export const COMMUNITY_ENDPOINT_VISIBILITIES = ["private", "public"] as const;

export type CommunityEndpointVisibility =
    (typeof COMMUNITY_ENDPOINT_VISIBILITIES)[number];

/* -------------------------------------------------------------------------
 * Listing storage
 *
 * A row carries what every listing has — who owns it, what it is called,
 * whether it is published — plus one `payload` whose shape `type` selects.
 * A field that belongs to one kind of listing exists only in that kind's
 * payload, so a listing cannot store a price it never charges or a credential
 * it never sends. The invariants that used to be checked field by field on
 * write are now the absence of somewhere to put the value.
 * ---------------------------------------------------------------------- */

export const LISTING_TYPES = [
    "proxy",
    "prompt_agent",
    "endpoint_agent",
] as const;

// Prompt agents all share one deployment-specific worker. Store this safe,
// environment-neutral URL in the common target column, then replace it with
// AGENT_RUNTIME_BASE_URL when a row crosses the API/runtime boundary. The
// reserved .invalid host guarantees a missed replacement cannot call another
// environment by accident.
export const PROMPT_AGENT_BASE_URL_PLACEHOLDER =
    "https://agent-runtime.invalid/api/agent-runtime/v1";

export type ListingType = (typeof LISTING_TYPES)[number];

/**
 * The owner's own OpenAI-compatible server, reached with the upstream bearer
 * secret registered for that server. This is never the owner's or caller's
 * Pollinations credential. The only kind that names a price, because it is the
 * only kind whose caller is buying something from the owner.
 */
const StoredCommunityEndpointPricesSchema = z.object(
    Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
            field.key,
            z.number().finite().min(0).default(0),
        ]),
    ) as Record<CommunityEndpointPriceKey, z.ZodDefault<z.ZodNumber>>,
);

export const ProxyListingPayloadSchema = z
    .object({
        bearerTokenCiphertext: z.string().min(1),
        // Owner-set: callers may only spend Paid Pollen on this model. Rows
        // from before paid-only support are public-spend by default.
        paidOnly: z.boolean().default(false),
        modality: z.enum(COMMUNITY_ENDPOINT_MODALITIES),
        imagePricing: z.enum(COMMUNITY_ENDPOINT_IMAGE_PRICING_MODES),
        inputModalities: z.array(z.enum(MODEL_INPUT_MODALITIES)).min(1),
        perUserRpm: z.number().finite().positive().nullable(),
        fallbacks: z
            .array(z.string().min(1))
            .transform((fallbacks) => fallbacks.slice(0, MAX_FALLBACK_TARGETS)),
        advertised: CommunityEndpointAdvertisedSchema.optional(),
        prices: StoredCommunityEndpointPricesSchema,
    })
    .transform(({ advertised: storedAdvertised, ...payload }) => {
        const advertised = normalizeCommunityEndpointAdvertised(
            storedAdvertised,
            payload.modality,
        );
        return {
            ...payload,
            inputModalities: normalizeCommunityEndpointInputModalities(
                payload.inputModalities,
                payload.modality,
            ),
            ...(Object.keys(advertised).length ? { advertised } : {}),
        };
    });

export type ProxyListingPayload = z.infer<typeof ProxyListingPayloadSchema>;

/**
 * An agent Enter runs itself. Its row id is also the model sent to the shared
 * runtime, which loads this configuration from the same row.
 */
export const BuiltinMcpServerIdSchema = z.enum(MCP_SERVER_IDS);
export const PromptAgentConfigSchema = z.object({
    systemPrompt: z.string().trim().min(1).max(8000),
    baseModel: z.string().trim().min(1).max(253),
    mcpServers: z
        .array(BuiltinMcpServerIdSchema)
        .max(MCP_SERVER_IDS.length)
        .refine((servers) => new Set(servers).size === servers.length, {
            message: "Duplicate MCP servers are not allowed",
        })
        .optional()
        .default([]),
});
export const PromptAgentInputSchema = PromptAgentConfigSchema.strict();

export type PromptAgentListingPayload = z.infer<typeof PromptAgentConfigSchema>;

/**
 * An agent on the owner's own server. It is sent a run token rather than a
 * credential. The rate limit remains gateway policy, not an upstream secret.
 */
export const EndpointAgentListingPayloadSchema = z
    .object({
        perUserRpm: z.number().finite().positive().nullable().default(null),
    })
    .strict();

export type EndpointAgentListingPayload = z.infer<
    typeof EndpointAgentListingPayloadSchema
>;

export type ListingPayloadByType = {
    proxy: ProxyListingPayload;
    prompt_agent: PromptAgentListingPayload;
    endpoint_agent: EndpointAgentListingPayload;
};

const LISTING_PAYLOAD_SCHEMA_BY_TYPE = {
    proxy: ProxyListingPayloadSchema,
    prompt_agent: PromptAgentConfigSchema,
    endpoint_agent: EndpointAgentListingPayloadSchema,
} as const;

/**
 * Read a stored payload back into its typed shape.
 *
 * Storage is the only place a payload arrives untyped, so it is normalized
 * once here and every reader downstream gets a complete value. A payload
 * missing what its type requires returns null, which leaves the listing out of
 * the catalog rather than in it half-populated.
 */
export function parseListingPayload<K extends ListingType>(
    type: K,
    raw: string | null,
): ListingPayloadByType[K] | null {
    let parsed: unknown;
    try {
        parsed = raw === null ? null : JSON.parse(raw);
    } catch {
        return null;
    }
    const result = LISTING_PAYLOAD_SCHEMA_BY_TYPE[type].safeParse(parsed);
    return result.success ? (result.data as ListingPayloadByType[K]) : null;
}

export function pendingCommunityEndpointChangeIsReady(
    pendingAt: Date | null,
    now = Date.now(),
): boolean {
    return (
        pendingAt !== null &&
        now >= pendingAt.getTime() + COMMUNITY_ENDPOINT_CHANGE_DELAY_MS
    );
}

export function effectiveCommunityEndpointVisibility(
    visibility: CommunityEndpointVisibility,
    pendingVisibility: CommunityEndpointVisibility | null,
    pendingAt: Date | null,
    now = Date.now(),
): CommunityEndpointVisibility {
    return pendingVisibility &&
        pendingCommunityEndpointChangeIsReady(pendingAt, now)
        ? pendingVisibility
        : visibility;
}

/** Apply only the delayed price policy, preserving newer credentials/settings. */
export function applyPendingProxyPricing(
    current: ProxyListingPayload,
    pending: ProxyListingPayload | null,
): ProxyListingPayload {
    return pending
        ? {
              ...current,
              paidOnly: pending.paidOnly,
              imagePricing: pending.imagePricing,
              prices: pending.prices,
          }
        : current;
}

export function resolveEffectiveProxyListing(
    state: {
        visibility: CommunityEndpointVisibility;
        payload: ProxyListingPayload;
        pendingVisibility: CommunityEndpointVisibility | null;
        pendingPayload: ProxyListingPayload | null;
        pendingAt: Date | null;
    },
    now = Date.now(),
) {
    const pendingAt = state.pendingAt;
    const pendingReady = pendingCommunityEndpointChangeIsReady(pendingAt, now);
    const hasPending =
        pendingAt !== null &&
        (state.pendingVisibility !== null || state.pendingPayload !== null);
    return {
        pendingReady,
        visibility:
            pendingReady && state.pendingVisibility
                ? state.pendingVisibility
                : state.visibility,
        payload: pendingReady
            ? applyPendingProxyPricing(state.payload, state.pendingPayload)
            : state.payload,
        pending:
            !pendingReady && hasPending
                ? {
                      effectiveAt: new Date(
                          pendingAt.getTime() +
                              COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
                      ),
                      visibility: state.pendingVisibility,
                      payload: state.pendingPayload,
                  }
                : null,
    };
}

type CommunityEndpointRuntimeBase = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    title: string;
    description: string | null;
    providerName?: string | null;
    providerUrl?: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    inputModalities: ModelInputModality[] | null;
    // Where the gateway sends the request, and the model name it asks for.
    // All variants resolve these when the row is read, so routing never has
    // to know which kind it is holding.
    baseUrl: string;
    upstreamModel: string;
    visibility: CommunityEndpointVisibility;
    requiredSafetyFeatures?: SafetyFeature[];
    paidOnly: boolean;
    // Exact gateway-side cap per Pollinations user. Null delegates capacity
    // limits to the upstream, whose 429 then remains a model failure.
    perUserRpm: number | null;
    // Community model ids tried in order when this endpoint's upstream fails.
    // A target's own list is never followed: the owner declares the full order.
    fallbacks: string[];
    hiddenAt: number | null;
    hiddenReason: string | null;
} & CommunityEndpointPrices;

/** A third-party server, reached with its registered upstream bearer secret. */
export type ProxyCommunityEndpointRuntime = CommunityEndpointRuntimeBase & {
    type: "proxy";
    bearerTokenCiphertext: string;
    advertised?: CommunityEndpointAdvertised;
};

/** An agent Enter runs on its own runtime, named by its listing id. */
export type PromptAgentCommunityEndpointRuntime =
    CommunityEndpointRuntimeBase & {
        type: "prompt_agent";
    };

/** An agent on the owner's own server, sent a run token instead of a key. */
export type EndpointAgentCommunityEndpointRuntime =
    CommunityEndpointRuntimeBase & {
        type: "endpoint_agent";
    };

export type CommunityEndpointRuntime =
    | ProxyCommunityEndpointRuntime
    | PromptAgentCommunityEndpointRuntime
    | EndpointAgentCommunityEndpointRuntime;

/**
 * Whether calls to this endpoint spend the caller's balance downstream.
 *
 * Both agent kinds do — one runs here, one on the owner's server, and either
 * way the work is charged to whoever called. A proxy never does: its owner
 * pays their own upstream and charges the caller a declared price. This is the
 * fact that decides which credential goes on the wire, so it has one name.
 */
export function usesAgentRunToken(endpoint: CommunityEndpointRuntime): boolean {
    return endpoint.type !== "proxy";
}

export type CommunityModelDefinitionInput = {
    modelId: string;
    addedDate?: number;
    perUserRpm?: number | null;
    title: string;
    description: string | null;
    providerName?: string | null;
    providerUrl?: string | null;
    modality?: CommunityEndpointModality;
    imagePricing?: CommunityEndpointImagePricing;
    inputModalities?: ModelInputModality[] | null;
    requiredSafetyFeatures?: SafetyFeature[];
    fallbacks?: string[];
    advertised?: CommunityEndpointAdvertised | null;
    hidden?: boolean;
    paidOnly?: boolean;
} & CommunityEndpointPrices;

export type CommunityProviderProfile = {
    name: string | null;
    url: string | null;
};

export type CommunityModelParts = {
    ownerGithubUsername: string;
    modelName: string;
};

type CommunityEndpointOwnerLike = {
    githubId?: number | null;
};

export function communityModelId(
    ownerGithubUsername: string,
    modelName: string,
): string {
    return `${ownerGithubUsername}/${modelName}`;
}

export function legacyCommunityModelId(
    ownerGithubUsername: string,
    modelName: string,
): string {
    return `${LEGACY_COMMUNITY_MODEL_PREFIX}${communityModelId(
        ownerGithubUsername,
        modelName,
    )}`;
}

export function normalizeCommunityEndpointBearerToken(value: string): string {
    const token = value.trim().replace(BEARER_PREFIX, "").trim();
    if (!token) throw new Error("API bearer token is required");
    return token;
}

export function communityEndpointErrorDetail(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    if (
        "error" in body &&
        body.error &&
        typeof body.error === "object" &&
        "message" in body.error &&
        typeof body.error.message === "string"
    ) {
        return body.error.message;
    }
    if ("error" in body && typeof body.error === "string") return body.error;
    if ("message" in body && typeof body.message === "string") {
        return body.message;
    }
    return null;
}

export function isCommunityEndpointOwnerAllowed(
    owner: CommunityEndpointOwnerLike | null | undefined,
): boolean {
    return isCommunityModelAllowedGithubId(owner?.githubId);
}

export function parseCommunityModelId(
    model: string,
): CommunityModelParts | null {
    const value = model.startsWith(LEGACY_COMMUNITY_MODEL_PREFIX)
        ? model.slice(LEGACY_COMMUNITY_MODEL_PREFIX.length).trim()
        : model.trim();
    const separator = value.indexOf("/");
    if (separator <= 0) return null;

    const ownerGithubUsername = value.slice(0, separator).trim();
    const modelName = value.slice(separator + 1).trim();
    if (!ownerGithubUsername || !modelName) return null;
    return { ownerGithubUsername, modelName };
}

export function normalizeCommunityProviderUrl(value: string): string {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
        throw new Error("Provider URL must use https");
    }
    if (url.username || url.password) {
        throw new Error("Provider URL cannot include credentials");
    }
    url.hash = "";
    return url.toString();
}

/**
 * Audio duration reported by an OpenAI-compatible transcription response.
 *
 * The three shapes in the wild: gpt-4o-transcribe reports `usage.seconds`,
 * whisper-style servers report `usage.duration`, and stock whisper
 * `verbose_json` puts `duration` at the top level. Returns null when none of
 * them carry a usable number — callers decide what that means, and both the
 * registration probe and the request path treat it as a failure so an endpoint
 * that cannot be metered is never billed at zero.
 */
export function communityTranscriptionSeconds(body: unknown): number | null {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    const usage =
        record.usage && typeof record.usage === "object"
            ? (record.usage as Record<string, unknown>)
            : undefined;
    for (const value of [usage?.duration, usage?.seconds, record.duration]) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return null;
}

export function communityPriceDefinition(
    endpoint: CommunityEndpointPrices,
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing = "request",
): PriceDefinition {
    const pricing: PriceDefinition = {};
    for (const field of communityEndpointPriceFieldsForModality(
        modality,
        imagePricing,
    )) {
        const price = endpoint[field.key];
        // Zero is an intentional rate here (private models, unpriced usage
        // buckets), not a missing one: keep it explicit so billing charges 0
        // instead of warning about a missing conversion rate on every call.
        if (Number.isFinite(price) && price >= 0) {
            pricing[field.usageType] = price;
        }
    }
    return pricing;
}

export function communityModelDefinition(
    endpoint: CommunityModelDefinitionInput,
): ModelDefinition {
    const parsed = parseCommunityModelId(endpoint.modelId);
    const description = endpoint.description?.trim();
    const legacyAlias = parsed
        ? legacyCommunityModelId(parsed.ownerGithubUsername, parsed.modelName)
        : null;
    const aliases =
        legacyAlias && legacyAlias !== endpoint.modelId ? [legacyAlias] : [];
    const modality = normalizeCommunityEndpointModality(endpoint.modality);
    const imagePricing = normalizeCommunityEndpointImagePricing(
        endpoint.imagePricing,
    );
    const spec: CommunityModalitySpec = COMMUNITY_MODALITY_SPEC[modality];
    const isImage = modality === "image";
    // Token-priced image endpoints bill like text models (usage × per-token
    // rates), so only fixed per-request image endpoints are flat-rate.
    const isFlatRateImage = isImage && imagePricing === "request";
    const inputModalities = normalizeCommunityEndpointInputModalities(
        endpoint.inputModalities,
        modality,
    );
    const providerName = endpoint.providerName?.trim();
    const providerUrl = endpoint.providerUrl?.trim();
    const { capabilities = [], ...advertised } =
        normalizeCommunityEndpointAdvertised(endpoint.advertised, modality);
    return {
        aliases,
        provider: "community",
        perUserRpm: endpoint.perUserRpm,
        brand: providerName || "Community",
        brandUrl: providerName && providerUrl ? providerUrl : undefined,
        category: spec.category,
        cost: communityPriceDefinition(endpoint, modality, imagePricing),
        priceMultiplier: 1,
        addedDate: endpoint.addedDate ?? 0,
        title: endpoint.title,
        description: description || undefined,
        inputModalities,
        outputModalities: [...spec.outputModalities],
        ...(spec.restrictDefinitionEndpoints
            ? {
                  supportedEndpoints: communityEndpointSupportedEndpoints(
                      modality,
                      inputModalities,
                  ),
              }
            : {}),
        requiredSafetyFeatures: endpoint.requiredSafetyFeatures,
        hidden: endpoint.hidden,
        ...(endpoint.fallbacks?.length
            ? { fallbacks: endpoint.fallbacks }
            : {}),
        paidOnly: endpoint.paidOnly ?? false,
        alpha: true,
        // Explicit false (not omitted) for token-priced image endpoints: the
        // catalog only renders per-1M prices when flat_rate === false or a
        // prompt token price is set.
        ...(isImage ? { flatRate: isFlatRateImage } : {}),
        ...(capabilities.includes("tool_calling") ? { tools: true } : {}),
        ...(capabilities.includes("reasoning") ? { reasoning: true } : {}),
        ...advertised,
    };
}

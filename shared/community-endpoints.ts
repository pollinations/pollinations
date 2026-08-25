import { z } from "zod";
import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
import { HttpError } from "./http-error.ts";
import { MCP_SERVER_IDS } from "./registry/mcp.ts";
import type { ModelCapability } from "./registry/model-info.ts";
import {
    MODEL_INPUT_MODALITIES,
    type ModelDefinition,
    type ModelInputModality,
    type PriceDefinition,
} from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";
import { readResponseBytes } from "./response-bytes.ts";

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_MODEL_REWARD_RATE = 0.75;
export const COMMUNITY_ENDPOINT_CHANGE_DELAY_MS = 12 * 60 * 60 * 1000;
export const COMMUNITY_ENDPOINT_MODALITIES = [
    "text",
    "image",
    "transcription",
    "video",
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
// Per-second audio (STT/TTS) prices are tiny compared to per-token rates, so
// this ceiling is written per minute and divided down: $0.012/min is ~2x
// OpenAI whisper ($0.006/min) and ~3x the priciest first-party STT model
// (scribe, $0.00367/min). Keep the division visible — a bare 0.006 here reads
// like OpenAI's per-minute rate but would bill 60x that per second.
export const MAX_COMMUNITY_PRICE_PER_SECOND = 0.012 / 60;
export const MAX_COMMUNITY_IMAGE_BYTES = 20 * 1024 * 1024;
// How long we wait on a community endpoint before giving up. Generous because
// these are self-hosted hobby GPUs that cold-start, and in line with the text
// providers (Portkey and Azure both use 290s). Workers impose no wall-clock
// limit of their own, so without this a hung endpoint would hold the request
// open until the caller disconnects.
export const COMMUNITY_ENDPOINT_TIMEOUT_MS = 300_000;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

export type CommunityEndpointModality =
    (typeof COMMUNITY_ENDPOINT_MODALITIES)[number];

export const COMMUNITY_ENDPOINT_INPUT_MODALITIES = {
    text: MODEL_INPUT_MODALITIES,
    image: ["text", "image"],
    transcription: ["audio"],
    video: ["text"],
} as const satisfies Record<
    CommunityEndpointModality,
    readonly ModelInputModality[]
>;

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

const COMMUNITY_VIDEO_PRICE_FIELD = {
    key: "completionVideoPrice",
    usageType: "completionVideoSeconds",
    label: "Generated video",
    priceUnit: "second",
    rawUsagePaths: ["video_duration"],
} as const;

export const COMMUNITY_ENDPOINT_PRICE_FIELDS = [
    ...COMMUNITY_TEXT_PRICE_FIELDS,
    COMMUNITY_IMAGE_PRICE_FIELD,
    COMMUNITY_TRANSCRIPTION_PRICE_FIELD,
    COMMUNITY_VIDEO_PRICE_FIELD,
] as const;

const COMMUNITY_TEXT_ENDPOINT_PRICE_FIELDS =
    COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
        (field) =>
            field.usageType !== "completionImageTokens" &&
            field.usageType !== "promptAudioSeconds",
    );

const COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_IMAGE_PRICE_FIELD,
] as const;

const COMMUNITY_TRANSCRIPTION_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_TRANSCRIPTION_PRICE_FIELD,
] as const;

const COMMUNITY_VIDEO_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_VIDEO_PRICE_FIELD,
] as const;

export function communityEndpointPriceFieldsForModality(
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing = "request",
) {
    if (modality === "transcription") {
        return COMMUNITY_TRANSCRIPTION_ENDPOINT_PRICE_FIELDS;
    }
    if (modality === "video") {
        return COMMUNITY_VIDEO_ENDPOINT_PRICE_FIELDS;
    }
    if (modality !== "image") return COMMUNITY_TEXT_ENDPOINT_PRICE_FIELDS;
    return imagePricing === "tokens"
        ? COMMUNITY_IMAGE_TOKEN_PRICE_FIELDS
        : COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS;
}

export type CommunityEndpointPriceField =
    | (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number]
    | (typeof COMMUNITY_IMAGE_TOKEN_PRICE_FIELDS)[number];

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
    return value === "image" ? "image" : "text";
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
    // input: text for text and image endpoints, audio for transcription.
    // Falling back to a bare "text" would hand a transcription endpoint the
    // one input it cannot accept, which the write path then rejects with a
    // 400 naming an input the owner never chose.
    const permitted = COMMUNITY_ENDPOINT_INPUT_MODALITIES[endpointModality];
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
export type ProxyListingPayload = {
    bearerTokenCiphertext: string;
    // Owner-set: callers may only spend Paid Pollen on this model.
    paidOnly: boolean;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    inputModalities: ModelInputModality[];
    perUserRpm: number | null;
    fallbacks: string[];
    advertised?: CommunityEndpointAdvertised;
    prices: CommunityEndpointPrices;
};

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
    if (parsed === null || typeof parsed !== "object") return null;
    const source = parsed as Record<string, unknown>;

    if (type === "endpoint_agent") {
        const result = EndpointAgentListingPayloadSchema.safeParse(source);
        return result.success ? (result.data as ListingPayloadByType[K]) : null;
    }
    if (type === "prompt_agent") {
        const result = PromptAgentConfigSchema.safeParse(source);
        return result.success ? (result.data as ListingPayloadByType[K]) : null;
    }

    const bearerTokenCiphertext =
        typeof source.bearerTokenCiphertext === "string"
            ? source.bearerTokenCiphertext
            : "";
    if (!bearerTokenCiphertext) return null;
    const modality = normalizeCommunityEndpointModality(
        typeof source.modality === "string" ? source.modality : null,
    );
    return {
        bearerTokenCiphertext,
        paidOnly: source.paidOnly === true,
        modality,
        imagePricing: normalizeCommunityEndpointImagePricing(
            typeof source.imagePricing === "string"
                ? source.imagePricing
                : null,
        ),
        inputModalities: normalizeCommunityEndpointInputModalities(
            Array.isArray(source.inputModalities)
                ? (source.inputModalities as ModelInputModality[])
                : undefined,
            modality,
        ),
        perUserRpm:
            typeof source.perUserRpm === "number" ? source.perUserRpm : null,
        fallbacks: Array.isArray(source.fallbacks)
            ? source.fallbacks.filter(
                  (id): id is string => typeof id === "string",
              )
            : [],
        advertised: normalizeCommunityEndpointAdvertised(
            CommunityEndpointAdvertisedSchema.safeParse(source.advertised).data,
            modality,
        ),
        prices: communityEndpointPrices(
            (typeof source.prices === "object" && source.prices !== null
                ? source.prices
                : {}) as Partial<CommunityEndpointPrices>,
        ),
    } as ListingPayloadByType[K];
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

type CommunityEndpointRuntimeBase = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    // Null on rows created before titles existed; read paths go through
    // communityEndpointTitle() rather than using this directly.
    title: string | null;
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
    title?: string | null;
    description: string | null;
    providerName?: string | null;
    providerUrl?: string | null;
    modality?: CommunityEndpointModality;
    imagePricing?: CommunityEndpointImagePricing;
    inputModalities?: ModelInputModality[] | null;
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

export function normalizeCommunityEndpointBaseUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== "https:") {
        throw new Error("Endpoint URL must use https");
    }
    if (isBlockedHostname(url.hostname)) {
        throw new Error("Endpoint URL cannot target a private host");
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
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

export function normalizeCommunityAssetUrl(
    value: string,
    endpointBaseUrl: string,
): string {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Image URL must use http or https");
    }
    if (url.username || url.password || isBlockedHostname(url.hostname)) {
        throw new Error("Image URL cannot target a private host");
    }
    if (
        url.protocol === "http:" &&
        url.hostname !== new URL(endpointBaseUrl).hostname
    ) {
        throw new Error("HTTP image URL must use the endpoint host");
    }
    url.hash = "";
    return url.toString();
}

/**
 * Pull the first usable image out of an OpenAI images response: inline base64
 * when present, otherwise the URL it points at, fetched under the shared
 * timeout and size cap.
 *
 * Returns null when the body carries no usable image, so each caller can
 * phrase that in its own words. A URL that is unsafe, unreachable, or oversized
 * throws HttpError(502) — the gen funnel renders that status directly, and the
 * enter probe flattens it to a 400 with the same message.
 */
export async function firstCommunityImageBytes(
    body: unknown,
    endpointBaseUrl: string,
): Promise<Uint8Array | null> {
    if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !Array.isArray(body.data)
    ) {
        return null;
    }
    for (const image of body.data) {
        if (!image || typeof image !== "object") continue;
        if (
            "b64_json" in image &&
            typeof image.b64_json === "string" &&
            image.b64_json.length > 0
        ) {
            return decodeCommunityBase64(image.b64_json);
        }
        if (
            "url" in image &&
            typeof image.url === "string" &&
            image.url.length > 0
        ) {
            return fetchCommunityImageBytes(image.url, endpointBaseUrl);
        }
    }
    return null;
}

async function fetchCommunityImageBytes(
    value: string,
    endpointBaseUrl: string,
): Promise<Uint8Array> {
    let url: string;
    try {
        url = normalizeCommunityAssetUrl(value, endpointBaseUrl);
    } catch {
        throw new HttpError("Endpoint returned an unsafe image URL", 502);
    }
    let response: Response;
    try {
        // The URL is validated against https + the private-host blocklist
        // above; following redirects would let the endpoint bounce us to an
        // unvalidated destination.
        response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new HttpError(
            "Endpoint image URL timed out or could not connect",
            502,
            { error: error instanceof Error ? error.message : String(error) },
            url,
        );
    }
    if (!response.ok) {
        throw new HttpError(
            `Endpoint image URL responded ${response.status}`,
            502,
            undefined,
            url,
        );
    }
    return readResponseBytes(
        response,
        MAX_COMMUNITY_IMAGE_BYTES,
        () => new HttpError("Endpoint image is larger than 20 MB", 502),
    );
}

export function decodeCommunityBase64(value: string): Uint8Array | null {
    try {
        const encoded = value
            .replace(/^data:[^,]+,/, "")
            .replace(/\s/g, "")
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const decoded = atob(encoded);
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    } catch {
        return null;
    }
}

export function communityChatCompletionsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/chat/completions`;
}

export function communityImageGenerationsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/images/generations`;
}

export function communityImageEditsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/images/edits`;
}

export function communityVideoGenerationsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/video/generations`;
}

export function communityAudioTranscriptionsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/audio/transcriptions`;
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

export function communityOpenAIBaseUrl(baseUrl: string): string {
    const normalized = normalizeCommunityEndpointBaseUrl(baseUrl);
    for (const suffix of [
        "/chat/completions",
        "/images/generations",
        "/images/edits",
        "/audio/transcriptions",
    ]) {
        if (normalized.endsWith(suffix)) {
            return normalized.slice(0, -suffix.length);
        }
    }
    return normalized;
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

// Titles became a required field after these rows were created, so older
// endpoints have no stored title. Fall back to what the catalog showed before
// the column existed (description, then the model slug) so `/models` output is
// unchanged for un-backfilled rows.
export function communityEndpointTitle(endpoint: {
    modelId: string;
    title?: string | null;
    description?: string | null;
}): string {
    const title = endpoint.title?.trim();
    if (title) return title;
    const description = endpoint.description?.trim();
    if (description) return description;
    return (
        parseCommunityModelId(endpoint.modelId)?.modelName ?? endpoint.modelId
    );
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
    const isImage = modality === "image";
    const isTranscription = modality === "transcription";
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
        category: isImage ? "image" : isTranscription ? "audio" : "text",
        cost: communityPriceDefinition(endpoint, modality, imagePricing),
        priceMultiplier: 1,
        addedDate: endpoint.addedDate ?? 0,
        title: communityEndpointTitle(endpoint),
        description: description || undefined,
        inputModalities,
        outputModalities: isImage ? ["image"] : ["text"],
        hidden: endpoint.hidden,
        ...(endpoint.fallbacks?.length
            ? { fallbacks: endpoint.fallbacks }
            : {}),
        ...(isTranscription
            ? { supportedEndpoints: ["/v1/audio/transcriptions"] }
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

function isBlockedHostname(hostname: string): boolean {
    const host = hostname
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "")
        .toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local")) return true;
    if (host.includes(":")) return true;
    if (host.startsWith("127.") || host.startsWith("10.")) return true;
    if (host.startsWith("169.254.")) return true;
    if (host.startsWith("100.")) {
        const second = Number(host.split(".")[1]);
        if (second >= 64 && second <= 127) return true;
    }
    if (host.startsWith("192.168.")) return true;
    const ipv4 = host.split(".").map(Number);
    if (
        ipv4.length === 4 &&
        ipv4.every(
            (part) => Number.isInteger(part) && part >= 0 && part <= 255,
        ) &&
        (ipv4[0] === 0 ||
            (ipv4[0] ?? 0) >= 224 ||
            (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19)))
    ) {
        return true;
    }
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }
    return false;
}

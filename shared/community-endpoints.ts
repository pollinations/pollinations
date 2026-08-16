import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
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

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_MODEL_REWARD_RATE = 0.75;
export const COMMUNITY_ENDPOINT_MODALITIES = ["text", "image"] as const;
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
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

export type CommunityEndpointModality =
    (typeof COMMUNITY_ENDPOINT_MODALITIES)[number];

export const COMMUNITY_ENDPOINT_INPUT_MODALITIES = {
    text: MODEL_INPUT_MODALITIES,
    image: ["text", "image"],
} as const satisfies Record<
    CommunityEndpointModality,
    readonly ModelInputModality[]
>;

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

export const COMMUNITY_ENDPOINT_PRICE_FIELDS = [
    ...COMMUNITY_TEXT_PRICE_FIELDS,
    COMMUNITY_IMAGE_PRICE_FIELD,
] as const;

const COMMUNITY_TEXT_ENDPOINT_PRICE_FIELDS =
    COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
        (field) => field.usageType !== "completionImageTokens",
    );

const COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS = [
    COMMUNITY_IMAGE_PRICE_FIELD,
] as const;

export function communityEndpointPriceFieldsForModality(
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing = "request",
) {
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

export function normalizeCommunityEndpointModality(
    value: string | null | undefined,
): CommunityEndpointModality {
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
    if (!value?.length) return ["text"];
    const declared = new Set(value);
    const normalized = COMMUNITY_ENDPOINT_INPUT_MODALITIES[
        endpointModality
    ].filter((modality) => declared.has(modality));
    return normalized.length ? [...normalized] : ["text"];
}

// Access/visibility of a registered endpoint. Private is the default; only
// public is allowlist-gated on create or update.
//   private → callable by the owner, listed for the owner, price forced to 0
//   app     → callable by the owner and by any key minted through one of the
//             owner's publishable app keys, and listed for exactly those
//             callers. Open to every account, and owner-priced for external
//             endpoints.
//   public  → callable by anyone, listed in the model catalog, priced,
//             allowlist-gated
// "app" scopes who a model is listed and billed for; it does not keep the
// model secret. The attribution it tests (byopClientKeyId) is verified but
// caller-chosen: any account can mint itself a key attributed to a published
// pk_, so treat "app" as reach, never as an access-control boundary.
// Agents are never priced at any visibility: they spend the caller's balance on
// Pollinations models downstream rather than charging for themselves.
export const COMMUNITY_ENDPOINT_VISIBILITIES = [
    "private",
    "app",
    "public",
] as const;

export type CommunityEndpointVisibility =
    (typeof COMMUNITY_ENDPOINT_VISIBILITIES)[number];

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
    // Both variants resolve these when the row is read, so routing never has
    // to know which kind it is holding.
    baseUrl: string;
    upstreamModel: string;
    visibility: CommunityEndpointVisibility;
    // Exact gateway-side cap per Pollinations user. Null delegates capacity
    // limits to the upstream, whose 429 then remains a model failure.
    perUserRpm: number | null;
    // Community model ids tried in order when this endpoint's upstream fails.
    // A target's own list is never followed: the owner declares the full order.
    fallbackModelIds: string[];
    disabledAt: number | null;
    disabledReason: string | null;
} & CommunityEndpointPrices;

/** A third-party OpenAI-compatible server the owner registered. */
export type ExternalCommunityEndpointRuntime = CommunityEndpointRuntimeBase & {
    kind: "external";
    bearerTokenCiphertext: string;
    /** Admin-granted: may spend an agent run token on the caller's behalf. */
    delegatesGeneration: boolean;
};

/** A managed prompt agent, run by Enter's own agent runtime. */
export type AgentCommunityEndpointRuntime = CommunityEndpointRuntimeBase & {
    kind: "agent";
    agentId: string;
};

export type CommunityEndpointRuntime =
    | ExternalCommunityEndpointRuntime
    | AgentCommunityEndpointRuntime;

/**
 * Whether calls to this endpoint spend the caller's balance downstream.
 *
 * Managed agents always do: they call their base model and tools on the
 * caller's behalf. External endpoints only do so when an admin granted it.
 * Both are barred from the same places — fallback targets, and being called
 * by another run token — so the two cases share one name.
 */
export function isDelegatingEndpoint(
    endpoint: CommunityEndpointRuntime,
): boolean {
    return endpoint.kind === "agent" || endpoint.delegatesGeneration;
}

/** Who is asking, as far as community model access is concerned. */
export type CommunityModelAccess = {
    /** The authenticated Pollinations user, if any. */
    callerUserId?: string;
    /** Owner of the app whose publishable key issued the caller's key. */
    appOwnerUserId?: string | null;
};

/**
 * Whether `access` may see and call `endpoint`.
 *
 * Public is everyone's. Private and app are the owner's; app additionally
 * reaches keys minted through that owner's apps, which is what lets a developer
 * ship a model inside their app without publishing it to the catalog. Both
 * identity terms are truth-checked so an unauthenticated caller — every field
 * undefined — can never match an owner id.
 */
export function canAccessCommunityModel(
    endpoint: { visibility: CommunityEndpointVisibility; ownerUserId: string },
    access: CommunityModelAccess,
): boolean {
    if (endpoint.visibility === "public") return true;
    if (access.callerUserId && endpoint.ownerUserId === access.callerUserId) {
        return true;
    }
    return (
        endpoint.visibility === "app" &&
        !!access.appOwnerUserId &&
        endpoint.ownerUserId === access.appOwnerUserId
    );
}

export type CommunityModelDefinitionInput = {
    modelId: string;
    addedDate?: number;
    title?: string | null;
    description: string | null;
    providerName?: string | null;
    providerUrl?: string | null;
    modality?: CommunityEndpointModality;
    imagePricing?: CommunityEndpointImagePricing;
    inputModalities?: ModelInputModality[] | null;
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

export function communityChatCompletionsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/chat/completions`;
}

export function communityImageGenerationsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/images/generations`;
}

export function communityImageEditsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/images/edits`;
}

export function communityOpenAIBaseUrl(baseUrl: string): string {
    const normalized = normalizeCommunityEndpointBaseUrl(baseUrl);
    for (const suffix of [
        "/chat/completions",
        "/images/generations",
        "/images/edits",
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
        // Zero is an intentional rate here (private models, agents at any
        // visibility, unpriced usage buckets), not a missing one: keep it
        // explicit so billing charges 0
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
    // Token-priced image endpoints bill like text models (usage × per-token
    // rates), so only fixed per-request image endpoints are flat-rate.
    const isFlatRateImage = isImage && imagePricing === "request";
    const inputModalities = normalizeCommunityEndpointInputModalities(
        endpoint.inputModalities,
        modality,
    );
    const providerName = endpoint.providerName?.trim();
    const providerUrl = endpoint.providerUrl?.trim();
    return {
        aliases,
        provider: "community",
        brand: providerName || "Community",
        brandUrl: providerName && providerUrl ? providerUrl : undefined,
        category: isImage ? "image" : "text",
        cost: communityPriceDefinition(endpoint, modality, imagePricing),
        priceMultiplier: 1,
        addedDate: endpoint.addedDate ?? 0,
        title: communityEndpointTitle(endpoint),
        description: description || undefined,
        inputModalities,
        outputModalities: isImage ? ["image"] : ["text"],
        paidOnly: false,
        alpha: true,
        // Explicit false (not omitted) for token-priced image endpoints: the
        // catalog only renders per-1M prices when flat_rate === false or a
        // prompt token price is set.
        ...(isImage ? { flatRate: isFlatRateImage } : {}),
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

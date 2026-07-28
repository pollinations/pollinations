import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
import type { ModelDefinition, PriceDefinition } from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
// Pooled model id for every set of interchangeable community endpoints.
export const COMMUNITY_GROUP_MODEL_PREFIX = "group/";
export const MIN_COMMUNITY_GROUP_MEMBERS = 2;
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

// Access/visibility of a registered endpoint. Private is the default; choosing
// public on create or update is allowlist-gated.
//   private → owner-only callable, shown only to the owner, no owner-set price
//   public  → anyone callable, listed in the model catalog, priced
export const COMMUNITY_ENDPOINT_VISIBILITIES = ["private", "public"] as const;

export type CommunityEndpointVisibility =
    (typeof COMMUNITY_ENDPOINT_VISIBILITIES)[number];

export type CommunityEndpointRuntime = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    // Null on rows created before titles existed; read paths go through
    // communityEndpointTitle() rather than using this directly.
    title: string | null;
    description: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    supportsImageEdits: boolean;
    baseUrl: string;
    upstreamModel: string;
    bearerTokenCiphertext: string;
    visibility: CommunityEndpointVisibility;
    /** Admin-granted: may spend an agent run token on the caller's behalf. */
    delegatesGeneration: boolean;
    disabledAt: number | null;
    disabledReason: string | null;
} & CommunityEndpointPrices;

export type CommunityModelDefinitionInput = {
    modelId: string;
    title?: string | null;
    description: string | null;
    modality?: CommunityEndpointModality;
    imagePricing?: CommunityEndpointImagePricing;
    supportsImageEdits?: boolean;
} & CommunityEndpointPrices;

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

export function communityGroupModelId(modelName: string): string {
    return `${COMMUNITY_GROUP_MODEL_PREFIX}${modelName}`;
}

export function normalizeCommunityEndpointBearerToken(value: string): string {
    const token = value.trim().replace(BEARER_PREFIX, "").trim();
    if (!token) throw new Error("API bearer token is required");
    return token;
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
    // Token-priced image endpoints bill like text models (usage × per-token
    // rates), so only fixed per-request image endpoints are flat-rate.
    const isFlatRateImage = isImage && imagePricing === "request";
    return {
        aliases,
        provider: "community",
        brand: "Community",
        category: isImage ? "image" : "text",
        cost: communityPriceDefinition(endpoint, modality, imagePricing),
        priceMultiplier: 1,
        addedDate: 0,
        title: communityEndpointTitle(endpoint),
        description: description || undefined,
        inputModalities:
            isImage && endpoint.supportsImageEdits
                ? ["text", "image"]
                : ["text"],
        outputModalities: isImage ? ["image"] : ["text"],
        paidOnly: false,
        alpha: true,
        // Explicit false (not omitted) for token-priced image endpoints: the
        // catalog only renders per-1M prices when flat_rate === false or a
        // prompt token price is set.
        ...(isImage ? { flatRate: isFlatRateImage } : {}),
    };
}

/**
 * Everything that decides whether two endpoints can serve the same pooled
 * request. Callers that only need the derived group ids (the API-key permission
 * catalog) can build this from a few columns instead of a full runtime.
 */
export type CommunityGroupCandidate = {
    name: string;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    visibility: CommunityEndpointVisibility;
    disabledAt: number | null;
} & CommunityEndpointPrices;

/**
 * Endpoints group only when they are interchangeable: same callable name, same
 * modality, same image billing mode, and every price field equal. Price
 * equality is what makes the group's advertised price unambiguous and lets any
 * member be billed identically, so the key is derived from
 * COMMUNITY_ENDPOINT_PRICE_FIELDS rather than a hand-listed subset.
 */
export function communityGroupKey(endpoint: CommunityGroupCandidate): string {
    return JSON.stringify([
        endpoint.name,
        endpoint.modality,
        endpoint.imagePricing,
        ...COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => endpoint[field.key]),
    ]);
}

/**
 * Orders two cohorts competing for one `group/<name>` id: the one with more
 * members wins, and an equal-sized tie goes to the cheaper one. Prices compare
 * field by field in COMMUNITY_ENDPOINT_PRICE_FIELDS order, so a new price
 * column joins the comparison automatically.
 *
 * Modality and image-pricing mode are the final tiebreakers. They never decide
 * anything a human would notice, but cohorts differing only in those fields
 * would otherwise compare equal and the winner would fall out of unordered D1
 * row order — the published pool has to be the same on every registry rebuild.
 */
function compareCommunityGroupPools<T extends CommunityGroupCandidate>(
    a: readonly T[],
    b: readonly T[],
): number {
    if (a.length !== b.length) return b.length - a.length;
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        const difference = a[0][field.key] - b[0][field.key];
        if (difference !== 0) return difference;
    }
    return (
        a[0].modality.localeCompare(b[0].modality) ||
        a[0].imagePricing.localeCompare(b[0].imagePricing)
    );
}

/**
 * Buckets endpoints into pools of interchangeable members. A private endpoint
 * is owner-only and a disabled one is broken, so neither can take its turn
 * serving a pooled request.
 *
 * One name publishes at most one pool, because every cohort under a name would
 * otherwise want the same `group/<name>` id. When a name is contested the
 * biggest cohort wins — the pool people actually converged on — and an
 * equal-sized tie goes to the cheaper one. Losing cohorts publish nothing;
 * their members stay individually callable as `owner/name`, so nothing they
 * already had breaks.
 */
export function communityGroupBuckets<T extends CommunityGroupCandidate>(
    endpoints: readonly T[],
): T[][] {
    const buckets = new Map<string, T[]>();
    for (const endpoint of endpoints) {
        if (endpoint.visibility !== "public" || endpoint.disabledAt !== null) {
            continue;
        }
        const key = communityGroupKey(endpoint);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(endpoint);
        else buckets.set(key, [endpoint]);
    }

    const winnerByName = new Map<string, T[]>();
    for (const members of buckets.values()) {
        if (members.length < MIN_COMMUNITY_GROUP_MEMBERS) continue;
        const name = members[0].name;
        const incumbent = winnerByName.get(name);
        if (!incumbent || compareCommunityGroupPools(members, incumbent) < 0) {
            winnerByName.set(name, members);
        }
    }
    return [...winnerByName.values()];
}

/**
 * The endpoints backing a model: one for `owner/name`, every member for a
 * pooled `group/<name>`, none for a static model. Read this instead of
 * `communityEndpoint` — that field alone is unset for a pool, so testing it
 * silently treats a pooled model as a static one.
 */
export function communityModelEndpoints(model: {
    communityEndpoint?: CommunityEndpointRuntime;
    communityGroupMembers?: CommunityEndpointRuntime[];
}): readonly CommunityEndpointRuntime[] {
    return (
        model.communityGroupMembers ??
        (model.communityEndpoint ? [model.communityEndpoint] : [])
    );
}

/** Members rotated left so a request can start at any member of the group. */
export function rotateCommunityGroupMembers(
    members: readonly CommunityEndpointRuntime[],
    startIndex: number,
): CommunityEndpointRuntime[] {
    const offset = startIndex % members.length;
    return [...members.slice(offset), ...members.slice(0, offset)];
}

/**
 * Pooled definition for a set of interchangeable endpoints. Prices are equal by
 * construction (communityGroupKey), so the first member carries every
 * price-bearing field. The legacy `community/...` alias is deliberately not
 * emitted: it names one owner and means nothing for a pool.
 */
export function communityGroupModelDefinition(
    members: readonly CommunityEndpointRuntime[],
): ModelDefinition {
    const first = members[0];
    return {
        ...communityModelDefinition({
            ...first,
            // Only advertise image edits when every member can serve one — any
            // member may take the request after a failover.
            supportsImageEdits: members.every(
                (member) => member.supportsImageEdits,
            ),
        }),
        aliases: [],
        title: first.name,
        description: `Pooled across ${members.length} community providers, with automatic failover between them.`,
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

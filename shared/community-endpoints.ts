import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
import type { ModelDefinition, PriceDefinition } from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_MODEL_REWARD_RATE = 0.75;
// Zero is free; positive owner-declared prices start at this floor.
export const MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS = 0.000001;
export const MIN_COMMUNITY_PRICE_PER_TOKEN =
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS / 1_000_000;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

// Minimum members required to form or maintain a group.
export const MIN_GROUP_MEMBERS = 2;

const COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE = {
    promptTextTokens: { key: "promptTextPrice", label: "Prompt text" },
    promptCachedTokens: { key: "promptCachedPrice", label: "Prompt cached" },
    promptCacheWriteTokens: {
        key: "promptCacheWritePrice",
        label: "Prompt cache write",
    },
    promptAudioTokens: { key: "promptAudioPrice", label: "Prompt audio" },
    promptImageTokens: { key: "promptImagePrice", label: "Prompt image" },
    completionTextTokens: {
        key: "completionTextPrice",
        label: "Completion text",
    },
    completionReasoningTokens: {
        key: "completionReasoningPrice",
        label: "Completion reasoning",
    },
    completionAudioTokens: {
        key: "completionAudioPrice",
        label: "Completion audio",
    },
} as const satisfies Record<
    OpenAIChatUsageType,
    { key: string; label: string }
>;

export const COMMUNITY_ENDPOINT_PRICE_FIELDS = OPENAI_CHAT_USAGE_TYPES.map(
    (usageType) => ({
        usageType,
        rawUsagePaths: OPENAI_CHAT_USAGE_PATHS[usageType],
        ...COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE[usageType],
    }),
) as readonly {
    key: (typeof COMMUNITY_PRICE_FIELD_BY_USAGE_TYPE)[OpenAIChatUsageType]["key"];
    usageType: OpenAIChatUsageType;
    label: string;
    rawUsagePaths: readonly string[];
}[];

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
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    bearerTokenCiphertext: string;
    visibility: CommunityEndpointVisibility;
    disabledAt: number | null;
    disabledReason: string | null;
} & CommunityEndpointPrices;

export type CommunityModelDefinitionInput = {
    modelId: string;
    description: string | null;
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

export function communityChatCompletionsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/chat/completions`;
}

export function communityOpenAIBaseUrl(baseUrl: string): string {
    const normalized = normalizeCommunityEndpointBaseUrl(baseUrl);
    return normalized.endsWith("/chat/completions")
        ? normalized.slice(0, -"/chat/completions".length)
        : normalized;
}

export function communityPriceDefinition(
    endpoint: CommunityEndpointPrices,
): PriceDefinition {
    const pricing: PriceDefinition = {};
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
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
    return {
        aliases,
        provider: "community",
        brand: "Community",
        category: "text",
        cost: communityPriceDefinition(endpoint),
        priceMultiplier: 1,
        addedDate: 0,
        title: description || parsed?.modelName || endpoint.modelId,
        description: description || undefined,
        inputModalities: ["text"],
        outputModalities: ["text"],
        paidOnly: false,
        alpha: true,
    };
}

function isBlockedHostname(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local")) return true;
    if (host === "::1" || host === "[::1]") return true;
    if (host.startsWith("127.") || host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }
    return false;
}

// ── Community Model Groups ──────────────────────────────────────────────

export type CommunityEndpointGroupRow = {
    slug: string;
    displayName: string;
    description: string | null;
    adminUserId: string;
    promptTextPrice: number;
    promptCachedPrice: number;
    promptCacheWritePrice: number;
    promptAudioPrice: number;
    promptImagePrice: number;
    completionTextPrice: number;
    completionReasoningPrice: number;
    completionAudioPrice: number;
    createdAt: Date;
    updatedAt: Date;
};

export type CommunityEndpointGroupRuntime = {
    slug: string;
    displayName: string;
    description: string | null;
    adminUserId: string;
    memberCount: number;
    activeMemberCount: number;
    /** Active (non-disabled) member endpoints for round-robin routing. */
    members: CommunityEndpointRuntime[];
} & CommunityEndpointPrices;

/** Build a group model ID: "group Slug/modelName" → "groupSlug/modelName" */
export function groupModelId(groupSlug: string, modelName: string): string {
    return `${groupSlug}/${modelName}`;
}

/** Parse a group model ID. Returns null if not a group model. */
export function parseGroupModelId(
    modelId: string,
): { groupSlug: string; modelName: string } | null {
    const parts = modelId.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    // Group slugs don't look like GitHub usernames (no uppercase, no underscores
    // in typical community model IDs). This is a heuristic; the catalog is the
    // source of truth for whether something is a group.
    return { groupSlug: parts[0], modelName: parts[1] };
}

/** Check if a group has enough active members to remain active. */
export function isGroupActive(activeMemberCount: number): boolean {
    return activeMemberCount >= MIN_GROUP_MEMBERS;
}

/** Build a group model definition for catalog projection. */
export function groupModelDefinition(
    group: CommunityEndpointGroupRuntime,
    modelName: string,
): ModelDefinition {
    const _modelId = groupModelId(group.slug, modelName);
    return {
        aliases: [],
        provider: "community",
        brand: "Community",
        category: "text",
        cost: communityPriceDefinition(group),
        priceMultiplier: 1,
        addedDate: 0,
        title: group.displayName || modelName,
        description: group.description || undefined,
        inputModalities: ["text"],
        outputModalities: ["text"],
        paidOnly: false,
        alpha: true,
    };
}

// ── Round-Robin Group Router ────────────────────────────────────────────

/** Per-slug round-robin counter (in-memory, resets on cold start). */
const roundRobinCounters = new Map<string, number>();

/**
 * Select the next active member from a group using round-robin.
 * Returns null if no members are available.
 */
export function selectGroupMember(
    group: CommunityEndpointGroupRuntime,
): CommunityEndpointRuntime | null {
    if (group.members.length === 0) return null;

    const counter = roundRobinCounters.get(group.slug) ?? 0;
    const idx = counter % group.members.length;
    roundRobinCounters.set(group.slug, counter + 1);
    return group.members[idx];
}

/**
 * Get all active members from a group, starting from the next round-robin
 * index. Useful for fallback: try each member in order until one succeeds.
 */
export function groupMemberFallbackOrder(
    group: CommunityEndpointGroupRuntime,
): CommunityEndpointRuntime[] {
    if (group.members.length === 0) return [];

    const counter = roundRobinCounters.get(group.slug) ?? 0;
    const start = counter % group.members.length;
    // Reorder: start from next, wrap around
    return [...group.members.slice(start), ...group.members.slice(0, start)];
}

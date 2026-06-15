import { parseGithubIdList } from "./auth/github-id-list.ts";
import type { ModelDefinition, PriceDefinition } from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";

export const COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_ENDPOINT_TIER_GATE_ENABLED = false;
export const COMMUNITY_ENDPOINT_TIERS = ["flower", "nectar", "router"] as const;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

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

export type CommunityEndpointRuntime = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    bearerTokenCiphertext: string;
    contextLength: number | null;
} & CommunityEndpointPrices;

export type CommunityModelParts = {
    ownerGithubUsername: string;
    modelName: string;
};

export type CommunityEndpointAllowlistEnv = {
    COMMUNITY_ENDPOINT_ALLOWED_GITHUB_IDS?: string | null;
};

type CommunityEndpointOwnerLike = {
    githubId?: number | null;
};

export function communityModelId(
    ownerGithubUsername: string,
    modelName: string,
): string {
    return `${COMMUNITY_MODEL_PREFIX}${ownerGithubUsername}/${modelName}`;
}

export function normalizeCommunityEndpointBearerToken(value: string): string {
    const token = value.trim().replace(BEARER_PREFIX, "").trim();
    if (!token) throw new Error("API bearer token is required");
    return token;
}

export function canManageCommunityEndpoints(
    tier: string | null | undefined,
): boolean {
    if (!COMMUNITY_ENDPOINT_TIER_GATE_ENABLED) return true;
    return COMMUNITY_ENDPOINT_TIERS.includes(
        tier as (typeof COMMUNITY_ENDPOINT_TIERS)[number],
    );
}

export function isCommunityEndpointOwnerAllowed(
    env: CommunityEndpointAllowlistEnv | undefined,
    owner: CommunityEndpointOwnerLike | null | undefined,
): boolean {
    const allowed = parseGithubIdList(
        env?.COMMUNITY_ENDPOINT_ALLOWED_GITHUB_IDS,
    );
    const githubId = owner?.githubId;
    return typeof githubId === "number" && allowed.has(githubId);
}

export function parseCommunityModelId(
    model: string,
): CommunityModelParts | null {
    if (!model.startsWith(COMMUNITY_MODEL_PREFIX)) return null;
    const value = model.slice(COMMUNITY_MODEL_PREFIX.length).trim();
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
        if (Number.isFinite(price) && price > 0) {
            pricing[field.usageType] = price;
        }
    }
    return pricing;
}

export function communityModelDefinition(
    endpoint: CommunityEndpointRuntime,
): ModelDefinition<string> {
    return {
        aliases: [],
        modelId: endpoint.modelId,
        provider: "community",
        brand: "Community",
        category: "text",
        cost: communityPriceDefinition(endpoint),
        priceMultiplier: 1,
        addedDate: 0,
        title: endpoint.description?.trim() || endpoint.modelId,
        description: endpoint.description ?? undefined,
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextLength: endpoint.contextLength ?? undefined,
        paidOnly: false,
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

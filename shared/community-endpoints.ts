import { isCommunityModelAllowedGithubId } from "./auth/github-id-list.ts";
import type { ModelDefinition, PriceDefinition } from "./registry/registry.ts";
import {
    OPENAI_CHAT_USAGE_PATHS,
    OPENAI_CHAT_USAGE_TYPES,
    type OpenAIChatUsageType,
} from "./registry/usage-headers.ts";

export const LEGACY_COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_MODEL_REWARD_RATE = 0.75;
export const COMMUNITY_ENDPOINT_MODALITIES = ["text", "image"] as const;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;

export type CommunityEndpointModality =
    (typeof COMMUNITY_ENDPOINT_MODALITIES)[number];

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
    rawUsagePaths: readonly string[];
}[];

const COMMUNITY_IMAGE_PRICE_FIELD = {
    key: "completionImagePrice",
    usageType: "completionImageTokens",
    label: "Generated image",
    rawUsagePaths: ["images"],
} as const;

export const COMMUNITY_ENDPOINT_PRICE_FIELDS = [
    ...COMMUNITY_TEXT_PRICE_FIELDS,
    COMMUNITY_IMAGE_PRICE_FIELD,
] as const;

export const COMMUNITY_TEXT_ENDPOINT_PRICE_FIELDS =
    COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
        (field) => field.usageType !== "completionImageTokens",
    );

export const COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS =
    COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
        (field) => field.usageType === "completionImageTokens",
    );

export function communityEndpointPriceFieldsForModality(
    modality: CommunityEndpointModality,
) {
    return modality === "image"
        ? COMMUNITY_IMAGE_ENDPOINT_PRICE_FIELDS
        : COMMUNITY_TEXT_ENDPOINT_PRICE_FIELDS;
}

export const COMMUNITY_ENDPOINT_PRICE_FIELDS_BY_KEY = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, field]),
) as {
    [K in CommunityEndpointPriceKey]: Extract<
        (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number],
        { key: K }
    >;
};

export type CommunityEndpointPriceField =
    (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number];

export type CommunityEndpointPriceKey = CommunityEndpointPriceField["key"];

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

export function communityEndpointPricesForModality(
    source: Partial<CommunityEndpointPrices>,
    modality: CommunityEndpointModality,
): CommunityEndpointPrices {
    const allowed = new Set(
        communityEndpointPriceFieldsForModality(modality).map(
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

export type CommunityEndpointRuntime = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    description: string | null;
    modality: CommunityEndpointModality;
    baseUrl: string;
    upstreamModel: string;
    bearerTokenCiphertext: string;
    disabledAt: number | null;
    disabledReason: string | null;
} & CommunityEndpointPrices;

export type CommunityModelDefinitionInput = {
    modelId: string;
    description: string | null;
    modality?: CommunityEndpointModality;
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

export function communityImageGenerationsUrl(baseUrl: string): string {
    return `${communityOpenAIBaseUrl(baseUrl)}/images/generations`;
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
    endpoint: CommunityModelDefinitionInput,
): ModelDefinition<string> {
    const parsed = parseCommunityModelId(endpoint.modelId);
    const description = endpoint.description?.trim();
    const legacyAlias = parsed
        ? legacyCommunityModelId(parsed.ownerGithubUsername, parsed.modelName)
        : null;
    const aliases =
        legacyAlias && legacyAlias !== endpoint.modelId ? [legacyAlias] : [];
    const modality = normalizeCommunityEndpointModality(endpoint.modality);
    const isImage = modality === "image";
    return {
        aliases,
        modelId: endpoint.modelId,
        provider: "community",
        brand: "Community",
        category: isImage ? "image" : "text",
        cost: communityPriceDefinition(endpoint),
        priceMultiplier: 1,
        addedDate: 0,
        title: description || parsed?.modelName || endpoint.modelId,
        description: description || undefined,
        inputModalities: ["text"],
        outputModalities: isImage ? ["image"] : ["text"],
        paidOnly: false,
        alpha: true,
        ...(isImage ? { flatRate: true } : {}),
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

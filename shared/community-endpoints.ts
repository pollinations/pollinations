import type { PriceDefinition } from "./registry/registry.ts";

export const COMMUNITY_MODEL_PREFIX = "community/";
export const COMMUNITY_ENDPOINT_TIER_GATE_ENABLED = false;
export const COMMUNITY_ENDPOINT_TIERS = ["flower", "nectar", "router"] as const;
const BEARER_PREFIX = /^Bearer(?:\s+|$)/i;
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;

export type CommunityEndpointRuntime = {
    id: string;
    ownerUserId: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    bearerTokenCiphertext: string;
    promptTextPrice: number;
    completionTextPrice: number;
    contextLength: number | null;
};

export type CommunityModelParts = {
    ownerGithubUsername: string;
    modelName: string;
};

type ChatRequestLike = {
    messages?: unknown;
    max_tokens?: unknown;
    max_completion_tokens?: unknown;
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
    const normalized = normalizeCommunityEndpointBaseUrl(baseUrl);
    return normalized.endsWith("/chat/completions")
        ? normalized
        : `${normalized}/chat/completions`;
}

export function communityPriceDefinition(
    endpoint: Pick<
        CommunityEndpointRuntime,
        "promptTextPrice" | "completionTextPrice"
    >,
): PriceDefinition {
    return {
        promptTextTokens: endpoint.promptTextPrice,
        completionTextTokens: endpoint.completionTextPrice,
    };
}

export function estimateCommunityRequestPrice(
    endpoint: Pick<
        CommunityEndpointRuntime,
        "promptTextPrice" | "completionTextPrice" | "contextLength"
    >,
    request: ChatRequestLike,
): number {
    const promptTokens = estimateTextTokens(request.messages);
    const maxCompletionTokens = getMaxCompletionTokens(endpoint, request);
    return (
        promptTokens * endpoint.promptTextPrice +
        maxCompletionTokens * endpoint.completionTextPrice
    );
}

export function capCommunityUsage(
    endpoint: Pick<CommunityEndpointRuntime, "contextLength">,
    request: ChatRequestLike,
    usage: Record<string, number> | undefined,
): Record<string, number> | undefined {
    if (!usage) return usage;
    if (
        !Number.isFinite(usage.prompt_tokens) ||
        !Number.isFinite(usage.completion_tokens)
    ) {
        return undefined;
    }
    const promptTokens = Math.min(
        usage.prompt_tokens,
        estimateTextTokens(request.messages),
    );
    const completionTokens = Math.min(
        usage.completion_tokens,
        getMaxCompletionTokens(endpoint, request),
    );
    return {
        ...usage,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
    };
}

function getMaxCompletionTokens(
    endpoint: Pick<CommunityEndpointRuntime, "contextLength">,
    request: ChatRequestLike,
): number {
    const requested =
        numberOrNull(request.max_completion_tokens) ??
        numberOrNull(request.max_tokens);
    if (requested != null) return Math.max(0, requested);
    return Math.min(
        endpoint.contextLength ?? DEFAULT_MAX_COMPLETION_TOKENS,
        DEFAULT_MAX_COMPLETION_TOKENS,
    );
}

function estimateTextTokens(value: unknown): number {
    if (value == null) return 0;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return Math.ceil(text.length / 4);
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
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

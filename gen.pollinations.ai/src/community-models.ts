import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    effectiveCommunityEndpointVisibility,
    parseListingPayload,
    resolveEffectiveProxyListing,
    usesAgentRunToken,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import type {
    ModelDefinition,
    ModelInputModality,
} from "@shared/registry/registry.ts";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AgentCatalogConfig } from "./agent-catalog.ts";

const COMMUNITY_TEXT_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];
export function communityTextSupportedEndpoints(): string[] {
    return COMMUNITY_TEXT_ENDPOINTS;
}

export function communityTranscriptionSupportedEndpoints(): string[] {
    return ["/v1/audio/transcriptions"];
}

export function communityVideoSupportedEndpoints(): string[] {
    return ["/v1/images/generations", "/image/{prompt}", "/video/{prompt}"];
}

export function communityEmbeddingSupportedEndpoints(): string[] {
    return ["/v1/embeddings"];
}

export function communityImageSupportedEndpoints(
    inputModalities: readonly ModelInputModality[] = ["text"],
): string[] {
    return [
        "/v1/images/generations",
        ...(inputModalities.includes("image") ? ["/v1/images/edits"] : []),
        "/image/{prompt}",
    ];
}

export type CommunityModelRegistryEntry = {
    id: string;
    aliases: string[];
    info: ModelInfo;
    definition: ModelDefinition;
    communityEndpoint: CommunityEndpointRuntime;
    agentConfig?: AgentCatalogConfig;
};

export type CommunityModelEnv = Pick<
    CloudflareBindings,
    "DB" | "AGENT_RUNTIME_BASE_URL"
>;

export async function getCommunityModelRegistryEntries(
    env: CommunityModelEnv,
): Promise<CommunityModelRegistryEntry[]> {
    const dbBinding = env.DB;
    if (!dbBinding) return [];
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            id: schema.communityEndpoint.id,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            ownerGithubUsername: schema.user.githubUsername,
            providerName: schema.user.communityProviderName,
            providerUrl: schema.user.communityProviderUrl,
            name: schema.communityEndpoint.name,
            title: schema.communityEndpoint.title,
            description: schema.communityEndpoint.description,
            type: schema.communityEndpoint.type,
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            payload: schema.communityEndpoint.payload,
            pendingPayload: schema.communityEndpoint.pendingPayload,
            pendingVisibility: schema.communityEndpoint.pendingVisibility,
            pendingAt: schema.communityEndpoint.pendingAt,
            visibility: schema.communityEndpoint.visibility,
            hiddenAt: schema.communityEndpoint.hiddenAt,
            hiddenReason: schema.communityEndpoint.hiddenReason,
            createdAt: schema.communityEndpoint.createdAt,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): CommunityModelRegistryEntry[] => {
        if (!row.ownerGithubUsername) return [];
        const baseUrl =
            row.type === "prompt_agent"
                ? env.AGENT_RUNTIME_BASE_URL
                : row.baseUrl;
        if (!baseUrl || !row.upstreamModel) return [];
        const modelId = communityModelId(row.ownerGithubUsername, row.name);
        let proxyState: ReturnType<typeof resolveEffectiveProxyListing> | null =
            null;
        if (row.type === "proxy") {
            const currentPayload = parseListingPayload("proxy", row.payload);
            if (!currentPayload) return [];
            proxyState = resolveEffectiveProxyListing({
                visibility: row.visibility,
                payload: currentPayload,
                pendingVisibility: row.pendingVisibility,
                pendingPayload: parseListingPayload(
                    "proxy",
                    row.pendingPayload,
                ),
                pendingAt: row.pendingAt,
            });
        }
        const effectiveVisibility =
            proxyState?.visibility ??
            effectiveCommunityEndpointVisibility(
                row.visibility,
                row.pendingVisibility,
                row.pendingAt,
            );
        const identity = {
            id: row.id,
            ownerUserId: row.ownerUserId,
            modelId,
            name: row.name,
            title: row.title,
            description: row.description,
            providerName: row.providerName,
            providerUrl: row.providerUrl,
            baseUrl,
            upstreamModel: row.upstreamModel,
            visibility: effectiveVisibility,
            hiddenAt: row.hiddenAt ? row.hiddenAt.getTime() : null,
            hiddenReason: row.hiddenReason,
        };
        // An agent charges nothing of its own and fans out to nothing: the
        // caller pays for whatever it consumes downstream. Both agent kinds
        // share empty purchase fields; endpoint agents may override only the
        // gateway's per-user rate limit from their payload.
        const agentDefaults = {
            modality: "text" as const,
            imagePricing: "request" as const,
            inputModalities: null,
            paidOnly: false,
            perUserRpm: null,
            fallbacks: [],
            ...communityEndpointPrices({}),
        };
        // Each arm parses its own payload, so the shape is narrowed to the one
        // its type declares. A payload that cannot be read leaves the listing
        // out of the catalog rather than in it half-populated: an entry
        // missing its target would fail at call time, not registration time.
        let communityEndpoint: CommunityEndpointRuntime;
        let agentConfig: AgentCatalogConfig | undefined;
        switch (row.type) {
            case "prompt_agent": {
                const payload = parseListingPayload(
                    "prompt_agent",
                    row.payload,
                );
                if (!payload) return [];
                agentConfig = {
                    baseModel: payload.baseModel,
                    mcpServers: payload.mcpServers,
                };
                communityEndpoint = {
                    ...identity,
                    ...agentDefaults,
                    type: "prompt_agent",
                };
                break;
            }
            case "endpoint_agent": {
                const payload = parseListingPayload(
                    "endpoint_agent",
                    row.payload,
                );
                if (!payload) return [];
                communityEndpoint = {
                    ...identity,
                    ...agentDefaults,
                    perUserRpm: payload.perUserRpm,
                    type: "endpoint_agent",
                };
                break;
            }
            case "proxy": {
                if (!proxyState) return [];
                const payload = proxyState.payload;
                communityEndpoint = {
                    ...identity,
                    type: "proxy",
                    bearerTokenCiphertext: payload.bearerTokenCiphertext,
                    paidOnly: payload.paidOnly,
                    modality: payload.modality,
                    imagePricing: payload.imagePricing,
                    inputModalities: payload.inputModalities,
                    perUserRpm: payload.perUserRpm,
                    fallbacks: payload.fallbacks,
                    advertised: payload.advertised,
                    ...payload.prices,
                };
            }
        }
        const definition = communityModelDefinition({
            ...communityEndpoint,
            addedDate: row.createdAt.getTime(),
            hidden: communityEndpoint.hiddenAt !== null,
        });
        const info = modelInfoFromDefinition(modelId, definition, {
            community: true,
            agent: usesAgentRunToken(communityEndpoint),
        });
        const pendingPayload = proxyState?.pending?.payload ?? null;
        if (
            proxyState?.pending &&
            row.visibility === "public" &&
            pendingPayload
        ) {
            const pendingDefinition = communityModelDefinition({
                ...communityEndpoint,
                paidOnly: pendingPayload.paidOnly,
                imagePricing: pendingPayload.imagePricing,
                ...pendingPayload.prices,
            });
            info.pending_change = {
                effective_at: proxyState.pending.effectiveAt.toISOString(),
                paid_only: pendingPayload.paidOnly,
                pricing: modelInfoFromDefinition(modelId, pendingDefinition)
                    .pricing,
            };
        }
        return [
            {
                id: modelId,
                aliases: definition.aliases,
                info,
                definition,
                communityEndpoint,
                agentConfig,
            },
        ];
    });
}

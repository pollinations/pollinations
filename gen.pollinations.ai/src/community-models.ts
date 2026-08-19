import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    isDelegatingEndpoint,
    normalizeListingType,
    parseListingPayload,
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
import {
    type AgentCatalogConfig,
    type AgentCatalogEnv,
    agentRuntimeBaseUrl,
    parseAgentCatalogConfig,
} from "./agent-catalog.ts";

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

export type CommunityModelEnv = Pick<CloudflareBindings, "DB"> &
    AgentCatalogEnv;

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
            payload: schema.communityEndpoint.payload,
            agentId: schema.communityEndpoint.agentId,
            agentConfig: schema.agent.config,
            visibility: schema.communityEndpoint.visibility,
            disabledAt: schema.communityEndpoint.disabledAt,
            disabledReason: schema.communityEndpoint.disabledReason,
            createdAt: schema.communityEndpoint.createdAt,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .leftJoin(
            schema.agent,
            eq(schema.communityEndpoint.agentId, schema.agent.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): CommunityModelRegistryEntry[] => {
        if (!row.ownerGithubUsername) return [];
        const modelId = communityModelId(row.ownerGithubUsername, row.name);
        const type = normalizeListingType(row.type);
        const identity = {
            id: row.id,
            ownerUserId: row.ownerUserId,
            modelId,
            name: row.name,
            title: row.title,
            description: row.description,
            providerName: row.providerName,
            providerUrl: row.providerUrl,
            visibility: row.visibility,
            disabledAt: row.disabledAt ? row.disabledAt.getTime() : null,
            disabledReason: row.disabledReason,
        };
        // An agent charges nothing of its own and fans out to nothing: the
        // caller pays for whatever it consumes downstream. Only a proxy has
        // the fields that describe a purchase, so the agent kinds supply the
        // empty values once, here, instead of storing nine zeroes each.
        const agentDefaults = {
            modality: "text" as const,
            imagePricing: "request" as const,
            inputModalities: null,
            perUserRpm: null,
            fallbackModelIds: [],
            ...communityEndpointPrices({}),
        };
        // Each arm parses its own payload, so the shape is narrowed to the one
        // its type declares. A payload that cannot be read leaves the listing
        // out of the catalog rather than in it half-populated: an entry
        // missing its target would fail at call time, not registration time.
        let communityEndpoint: CommunityEndpointRuntime;
        switch (type) {
            case "prompt_agent": {
                if (!row.agentId) return [];
                communityEndpoint = {
                    ...identity,
                    ...agentDefaults,
                    kind: "prompt_agent",
                    baseUrl: agentRuntimeBaseUrl(env),
                    upstreamModel: row.agentId,
                    agentId: row.agentId,
                };
                break;
            }
            case "hosted_agent": {
                const payload = parseListingPayload(
                    "hosted_agent",
                    row.payload,
                );
                if (!payload) return [];
                communityEndpoint = {
                    ...identity,
                    ...agentDefaults,
                    kind: "hosted_agent",
                    baseUrl: payload.baseUrl,
                    upstreamModel: row.name,
                };
                break;
            }
            default: {
                const payload = parseListingPayload("proxy", row.payload);
                if (!payload) return [];
                communityEndpoint = {
                    ...identity,
                    kind: "proxy",
                    baseUrl: payload.baseUrl,
                    upstreamModel: payload.upstreamModel,
                    bearerTokenCiphertext: payload.bearerTokenCiphertext,
                    modality: payload.modality,
                    imagePricing: payload.imagePricing,
                    inputModalities: payload.inputModalities,
                    perUserRpm: payload.perUserRpm,
                    fallbackModelIds: payload.fallbackModelIds,
                    ...payload.prices,
                };
            }
        }
        const definition = communityModelDefinition({
            ...communityEndpoint,
            addedDate: row.createdAt.getTime(),
        });
        return [
            {
                id: modelId,
                aliases: definition.aliases,
                info: modelInfoFromDefinition(modelId, definition, {
                    community: true,
                    agent: isDelegatingEndpoint(communityEndpoint),
                    perUserRpm: communityEndpoint.perUserRpm,
                }),
                definition,
                communityEndpoint,
                // Only a prompt agent wraps a base model, so only it has a
                // catalog config to inherit metadata from.
                agentConfig:
                    communityEndpoint.kind === "prompt_agent"
                        ? (parseAgentCatalogConfig(row.agentConfig) ??
                          undefined)
                        : undefined,
            },
        ];
    });
}

import {
    type CommunityEndpointGroupRuntime,
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    groupModelDefinition,
    groupModelId,
    isGroupActive,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const COMMUNITY_TEXT_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];

export function communityTextSupportedEndpoints(): string[] {
    return COMMUNITY_TEXT_ENDPOINTS;
}

export type CommunityModelRegistryEntry = {
    id: string;
    aliases: string[];
    info: ModelInfo;
    definition: ModelDefinition;
    communityEndpoint: CommunityEndpointRuntime;
    /** Set when this entry represents a group (multi-provider). */
    group?: CommunityEndpointGroupRuntime;
};

export async function getCommunityModelRegistryEntries(
    dbBinding: CloudflareBindings["DB"] | undefined,
): Promise<CommunityModelRegistryEntry[]> {
    if (!dbBinding) return [];
    const db = drizzle(dbBinding, { schema });

    // ── 1. Load all community endpoints + their group memberships ──────
    const rows = await db
        .select({
            id: schema.communityEndpoint.id,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            description: schema.communityEndpoint.description,
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            bearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
            visibility: schema.communityEndpoint.visibility,
            promptTextPrice: schema.communityEndpoint.promptTextPrice,
            promptCachedPrice: schema.communityEndpoint.promptCachedPrice,
            promptCacheWritePrice:
                schema.communityEndpoint.promptCacheWritePrice,
            promptAudioPrice: schema.communityEndpoint.promptAudioPrice,
            promptImagePrice: schema.communityEndpoint.promptImagePrice,
            completionTextPrice: schema.communityEndpoint.completionTextPrice,
            completionReasoningPrice:
                schema.communityEndpoint.completionReasoningPrice,
            completionAudioPrice: schema.communityEndpoint.completionAudioPrice,
            disabledAt: schema.communityEndpoint.disabledAt,
            disabledReason: schema.communityEndpoint.disabledReason,
            groupSlug: schema.communityEndpoint.groupSlug,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    // ── 2. Load all groups ─────────────────────────────────────────────
    const groupRows = await db.select().from(schema.communityEndpointGroup);

    const groupMap = new Map<string, (typeof groupRows)[number]>();
    for (const g of groupRows) {
        groupMap.set(g.slug, g);
    }

    // ── 3. Build endpoint runtimes and group membership buckets ─────────
    type EndpointWithGroup = {
        endpoint: CommunityEndpointRuntime;
        groupSlug: string | null;
        ownerGithubUsername: string;
    };

    const endpoints: EndpointWithGroup[] = [];
    // groupSlug → array of active (non-disabled) endpoints
    const groupActiveMembers = new Map<string, EndpointWithGroup[]>();
    // groupSlug → all endpoints (including disabled)
    const groupAllMembers = new Map<string, EndpointWithGroup[]>();

    for (const row of rows) {
        if (!row.ownerGithubUsername) continue;
        const modelId = communityModelId(row.ownerGithubUsername, row.name);
        const endpoint: CommunityEndpointRuntime = {
            id: row.id,
            ownerUserId: row.ownerUserId,
            modelId,
            name: row.name,
            description: row.description,
            baseUrl: row.baseUrl,
            upstreamModel: row.upstreamModel,
            bearerTokenCiphertext: row.bearerTokenCiphertext,
            visibility: row.visibility,
            disabledAt: row.disabledAt ? row.disabledAt.getTime() : null,
            disabledReason: row.disabledReason,
            ...communityEndpointPrices(row),
        };

        const entry: EndpointWithGroup = {
            endpoint,
            groupSlug: row.groupSlug,
            ownerGithubUsername: row.ownerGithubUsername,
        };

        endpoints.push(entry);

        if (row.groupSlug) {
            if (!groupAllMembers.has(row.groupSlug)) {
                groupAllMembers.set(row.groupSlug, []);
            }
            groupAllMembers.get(row.groupSlug)?.push(entry);

            if (endpoint.disabledAt === null) {
                if (!groupActiveMembers.has(row.groupSlug)) {
                    groupActiveMembers.set(row.groupSlug, []);
                }
                groupActiveMembers.get(row.groupSlug)?.push(entry);
            }
        }
    }

    // ── 4. Build group registry entries (one per active group) ──────────
    const entries: CommunityModelRegistryEntry[] = [];
    const groupedOwnerNames = new Set<string>(); // "ownerUserId/name" for grouped members

    for (const [slug, activeMembers] of groupActiveMembers) {
        if (!isGroupActive(activeMembers.length)) continue;

        const groupRow = groupMap.get(slug);
        if (!groupRow) continue;

        // Use the first active member's model name (groups share the same
        // model name — that's the whole point).
        const modelName = activeMembers[0].endpoint.name;
        const groupModelIdStr = groupModelId(slug, modelName);

        const groupRuntime: CommunityEndpointGroupRuntime = {
            slug: groupRow.slug,
            displayName: groupRow.displayName,
            description: groupRow.description,
            adminUserId: groupRow.adminUserId,
            memberCount: (groupAllMembers.get(slug) || []).length,
            activeMemberCount: activeMembers.length,
            members: activeMembers.map((m) => m.endpoint),
            ...communityEndpointPrices(groupRow),
        };

        const definition = groupModelDefinition(groupRuntime, modelName);
        entries.push({
            id: groupModelIdStr,
            aliases: definition.aliases,
            info: modelInfoFromDefinition(groupModelIdStr, definition, {
                community: true,
                stable: true,
            }),
            definition,
            // Primary endpoint is the first active member (for routing
            // fallback; the actual round-robin dispatches in gen worker).
            communityEndpoint: activeMembers[0].endpoint,
            group: groupRuntime,
        });

        // Mark all members of this group as grouped (their standalone
        // listing will be hidden).
        for (const member of activeMembers) {
            groupedOwnerNames.add(
                `${member.endpoint.ownerUserId}/${member.endpoint.name}`,
            );
        }
        // Also mark disabled members as grouped (they shouldn't appear as
        // standalone either — the group owns the model identity).
        const allMembers = groupAllMembers.get(slug) || [];
        for (const member of allMembers) {
            groupedOwnerNames.add(
                `${member.endpoint.ownerUserId}/${member.endpoint.name}`,
            );
        }
    }

    // ── 5. Add standalone entries (non-grouped or private) ──────────────
    for (const entry of endpoints) {
        const ownerKey = `${entry.endpoint.ownerUserId}/${entry.endpoint.name}`;
        if (groupedOwnerNames.has(ownerKey)) continue;

        const definition = communityModelDefinition(entry.endpoint);
        entries.push({
            id: entry.endpoint.modelId,
            aliases: definition.aliases,
            info: modelInfoFromDefinition(entry.endpoint.modelId, definition, {
                community: true,
            }),
            definition,
            communityEndpoint: entry.endpoint,
        });
    }

    return entries;
}

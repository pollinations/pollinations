import {
    PRICE_CHANGE_DELAY_MS,
    communityEndpointTitle,
    communityModelId,
    normalizeCommunityEndpointAdvertised,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import type * as schema from "@shared/db/better-auth.ts";
import {
    type CommunityEndpointResponse,
    CommunityEndpointResponseSchema,
} from "./schemas.ts";

type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

function pendingIsReady(pendingAt: Date | null): boolean {
    return pendingAt !== null && Date.now() >= pendingAt.getTime() + PRICE_CHANGE_DELAY_MS;
}

export function toCommunityEndpointResponse(
    row: CommunityEndpointRow,
    ownerGithubUsername: string,
    agentRuntimeUrl: string,
): CommunityEndpointResponse {
    const modelId = communityModelId(ownerGithubUsername, row.name);
    const common = {
        id: row.id,
        modelId,
        name: row.name,
        title: communityEndpointTitle({
            modelId,
            title: row.title,
            description: row.description,
        }),
        description: row.description,
        baseUrl: row.type === "prompt_agent" ? agentRuntimeUrl : row.baseUrl,
        upstreamModel: row.upstreamModel,
        visibility: row.visibility,
        hidden: row.hiddenAt !== null,
        hiddenReason: row.hiddenReason,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };

    if (row.type === "prompt_agent") {
        return CommunityEndpointResponseSchema.parse({
            ...common,
            type: row.type,
        });
    }
    if (row.type === "endpoint_agent") {
        const payload = parseListingPayload("endpoint_agent", row.payload);
        if (!payload) {
            throw new Error(`Invalid endpoint_agent payload for ${row.id}`);
        }
        return CommunityEndpointResponseSchema.parse({
            ...common,
            type: row.type,
            perUserRpm: payload.perUserRpm,
        });
    }

    const ready = pendingIsReady(row.pendingAt);

    // If pending is ready, use pending values as the effective current state.
    const effectivePayloadStr = ready && row.pendingPayload ? row.pendingPayload : row.payload;
    const effectiveVisibility = ready && row.pendingVisibility ? row.pendingVisibility : row.visibility;

    const payload = parseListingPayload("proxy", effectivePayloadStr);
    if (!payload) throw new Error(`Invalid proxy payload for ${row.id}`);
    const { bearerTokenCiphertext: _credential, prices, ...proxy } = payload;

    // Include pending info when a change is queued but not yet effective.
    let pending = null;
    if (!ready && row.pendingAt && row.pendingPayload) {
        const pendingPayload = parseListingPayload("proxy", row.pendingPayload);
        if (pendingPayload) {
            const effectiveAt = new Date(row.pendingAt.getTime() + PRICE_CHANGE_DELAY_MS);
            pending = {
                effectiveAt: effectiveAt.toISOString(),
                ...(row.pendingVisibility === "public" ? { visibility: "public" as const } : {}),
                paidOnly: pendingPayload.paidOnly,
                ...pendingPayload.prices,
            };
        }
    }

    return CommunityEndpointResponseSchema.parse({
        ...common,
        visibility: effectiveVisibility,
        type: row.type,
        ...proxy,
        advertised: normalizeCommunityEndpointAdvertised(
            payload.advertised,
            payload.modality,
        ),
        ...prices,
        pending,
    });
}

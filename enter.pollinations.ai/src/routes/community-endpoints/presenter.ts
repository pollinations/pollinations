import {
    applyPendingProxyPricing,
    COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
    communityEndpointTitle,
    communityModelId,
    effectiveCommunityEndpointVisibility,
    normalizeCommunityEndpointAdvertised,
    parseListingPayload,
    pendingCommunityEndpointChangeIsReady,
} from "@shared/community-endpoints.ts";
import type * as schema from "@shared/db/better-auth.ts";
import {
    type CommunityEndpointResponse,
    CommunityEndpointResponseSchema,
} from "./schemas.ts";

type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

export function toCommunityEndpointResponse(
    row: CommunityEndpointRow,
    ownerGithubUsername: string,
    agentRuntimeUrl: string,
): CommunityEndpointResponse {
    const modelId = communityModelId(ownerGithubUsername, row.name);
    const pendingReady = pendingCommunityEndpointChangeIsReady(row.pendingAt);
    const pendingAt = row.pendingAt;
    const hasPending =
        !pendingReady &&
        pendingAt !== null &&
        (row.pendingVisibility !== null || row.pendingPayload !== null);
    const pendingBase = hasPending
        ? {
              effectiveAt: new Date(
                  pendingAt.getTime() + COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
              ).toISOString(),
              ...(row.pendingVisibility === "public"
                  ? { visibility: "public" as const }
                  : {}),
          }
        : null;
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
        visibility: effectiveCommunityEndpointVisibility(
            row.visibility,
            row.pendingVisibility,
            row.pendingAt,
        ),
        pending: pendingBase,
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

    const currentPayload = parseListingPayload("proxy", row.payload);
    if (!currentPayload) {
        throw new Error(`Invalid proxy payload for ${row.id}`);
    }
    const pendingPayload = parseListingPayload("proxy", row.pendingPayload);
    const payload = pendingReady
        ? applyPendingProxyPricing(currentPayload, pendingPayload)
        : currentPayload;
    const { bearerTokenCiphertext: _credential, prices, ...proxy } = payload;
    return CommunityEndpointResponseSchema.parse({
        ...common,
        type: row.type,
        ...proxy,
        advertised: normalizeCommunityEndpointAdvertised(
            payload.advertised,
            payload.modality,
        ),
        ...prices,
        pending:
            pendingBase && pendingPayload
                ? {
                      ...pendingBase,
                      paidOnly: pendingPayload.paidOnly,
                      imagePricing: pendingPayload.imagePricing,
                      ...pendingPayload.prices,
                  }
                : pendingBase,
    });
}

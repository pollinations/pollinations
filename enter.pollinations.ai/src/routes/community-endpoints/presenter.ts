import { communityResponsesUrl } from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
    communityModelId,
    effectiveCommunityEndpointVisibility,
    normalizeCommunityEndpointAdvertised,
    parseListingPayload,
    pendingCommunityEndpointChangeIsReady,
    resolveEffectiveProxyListing,
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
    let proxyState: ReturnType<typeof resolveEffectiveProxyListing> | null =
        null;
    if (row.type === "proxy") {
        const payload = parseListingPayload("proxy", row.payload);
        if (!payload) throw new Error(`Invalid proxy payload for ${row.id}`);
        proxyState = resolveEffectiveProxyListing({
            visibility: row.visibility,
            payload,
            pendingVisibility: row.pendingVisibility,
            pendingPayload: parseListingPayload("proxy", row.pendingPayload),
            pendingAt: row.pendingAt,
        });
    }
    const pendingReady =
        proxyState?.pendingReady ??
        pendingCommunityEndpointChangeIsReady(row.pendingAt);
    const pendingAt = row.pendingAt;
    const hasPending =
        proxyState !== null
            ? proxyState.pending !== null
            : !pendingReady &&
              pendingAt !== null &&
              (row.pendingVisibility !== null || row.pendingPayload !== null);
    const pendingEffectiveAt =
        proxyState?.pending?.effectiveAt ??
        (pendingAt
            ? new Date(pendingAt.getTime() + COMMUNITY_ENDPOINT_CHANGE_DELAY_MS)
            : null);
    const pendingBase =
        hasPending && pendingEffectiveAt
            ? {
                  effectiveAt: pendingEffectiveAt.toISOString(),
                  ...(row.pendingVisibility === "public"
                      ? { visibility: "public" as const }
                      : {}),
              }
            : null;
    const common = {
        id: row.id,
        modelId,
        name: row.name,
        title: row.title,
        description: row.description,
        baseUrl: row.type === "prompt_agent" ? agentRuntimeUrl : row.baseUrl,
        upstreamModel: row.upstreamModel,
        requiredSafetyFeatures: row.requiredSafetyFeatures,
        visibility:
            proxyState?.visibility ??
            effectiveCommunityEndpointVisibility(
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
            responsesUrl: communityResponsesUrl(agentRuntimeUrl),
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
            responsesUrl: payload.responsesUrl,
        });
    }

    if (!proxyState) throw new Error(`Invalid proxy payload for ${row.id}`);
    const payload = proxyState.payload;
    const pendingPayload = proxyState.pending?.payload ?? null;
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

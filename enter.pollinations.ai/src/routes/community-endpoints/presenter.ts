import {
    communityEndpointTitle,
    communityModelId,
    isPendingChangeDue,
    normalizeCommunityEndpointAdvertised,
    PRICE_CHANGE_DELAY_MS,
    parseListingPayload,
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

    const payload = parseListingPayload("proxy", row.payload);
    if (!payload) throw new Error(`Invalid proxy payload for ${row.id}`);
    const { bearerTokenCiphertext: _credential, prices, ...proxy } = payload;

    // Responses always reflect the stored policy; a change that is still
    // waiting out its notice window surfaces only as a pending notice.
    const duePending = isPendingChangeDue(row.pendingAt);
    const pending =
        row.pendingAt !== null && !duePending
            ? {
                  ...(row.pendingVisibility === "public" && {
                      visibility: "public" as const,
                  }),
                  effectiveAt: new Date(
                      row.pendingAt.getTime() + PRICE_CHANGE_DELAY_MS,
                  ).toISOString(),
              }
            : null;

    return CommunityEndpointResponseSchema.parse({
        ...common,
        type: row.type,
        // Owner-facing responses present the submitted target: a queued
        // private-to-public flip reads as public immediately, while the
        // pending notice below tells the owner when model users switch.
        visibility:
            row.pendingVisibility === "public" ? "public" : row.visibility,
        ...proxy,
        advertised: normalizeCommunityEndpointAdvertised(
            payload.advertised,
            payload.modality,
        ),
        ...prices,
        pending,
    });
}

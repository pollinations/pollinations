import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPrices,
    communityModelId,
    effectiveCommunityEndpointVisibility,
    isCommunityFallbackBalanceAllowed,
    isCommunityFallbackPricingAllowed,
    normalizeCommunityEndpointInputModalities,
    parseCommunityModelId,
    parseListingPayload,
    resolveEffectiveProxyListing,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

export type FallbackPrimary = {
    modelId: string;
    ownerUserId: string;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    paidOnly: boolean;
    prices: CommunityEndpointPrices;
    inputModalities?: readonly ModelInputModality[] | null;
};

const SELF_FALLBACK_MESSAGE = "Fallback target cannot be the model itself";

function missingTargetMessage(modelId: string): string {
    return `Fallback target ${modelId} does not exist`;
}

// Private or hidden rows owned by someone else must look identical to a
// missing row. Distinct validation errors would expose whether a model exists.
function shouldConcealTarget(
    primary: FallbackPrimary,
    target: CommunityEndpointRow,
): boolean {
    return (
        target.ownerUserId !== primary.ownerUserId &&
        (effectiveCommunityEndpointVisibility(
            target.visibility,
            target.pendingVisibility,
            target.pendingAt,
        ) === "private" ||
            target.hiddenAt !== null)
    );
}

/** Shared eligibility rule for candidate discovery and write validation. */
export function fallbackTargetRejection(
    primary: FallbackPrimary,
    modelId: string,
    target: CommunityEndpointRow,
): string | null {
    if (modelId === primary.modelId) return SELF_FALLBACK_MESSAGE;
    if (shouldConcealTarget(primary, target))
        return missingTargetMessage(modelId);
    if (target.hiddenAt !== null) {
        return `Fallback target ${modelId} must be listed`;
    }
    if (target.type !== "proxy") {
        return `Fallback target ${modelId} cannot delegate generation`;
    }
    if (
        effectiveCommunityEndpointVisibility(
            target.visibility,
            target.pendingVisibility,
            target.pendingAt,
        ) === "private" &&
        target.ownerUserId !== primary.ownerUserId
    ) {
        return `Fallback target ${modelId} must be public or owned by you`;
    }
    const currentPayload = parseListingPayload("proxy", target.payload);
    if (!currentPayload) {
        return `Fallback target ${modelId} has invalid configuration`;
    }
    const payload = resolveEffectiveProxyListing({
        visibility: target.visibility,
        payload: currentPayload,
        pendingVisibility: target.pendingVisibility,
        pendingPayload: parseListingPayload("proxy", target.pendingPayload),
        pendingAt: target.pendingAt,
    }).payload;
    if (payload.modality !== primary.modality) {
        return `Fallback target ${modelId} is a ${payload.modality} model, not ${primary.modality}`;
    }
    if (
        primary.modality === "image" &&
        payload.imagePricing !== primary.imagePricing
    ) {
        return `Fallback target ${modelId} bills images per ${payload.imagePricing}, not per ${primary.imagePricing}`;
    }
    const primaryInputs = normalizeCommunityEndpointInputModalities(
        primary.inputModalities,
        primary.modality,
    );
    const targetInputs = normalizeCommunityEndpointInputModalities(
        payload.inputModalities,
        payload.modality,
    );
    if (
        primary.modality === "image" &&
        primaryInputs.includes("image") &&
        !targetInputs.includes("image")
    ) {
        return `Fallback target ${modelId} does not support image edits`;
    }
    if (!isCommunityFallbackBalanceAllowed(primary, payload)) {
        return `Fallback target ${modelId} accepts only Paid Pollen, which this model does not require`;
    }
    if (!isCommunityFallbackPricingAllowed(primary.prices, payload.prices)) {
        const excesses = COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
            (field) => payload.prices[field.key] > primary.prices[field.key],
        ).map(
            (field) =>
                `${field.key} (${payload.prices[field.key]}) exceeds this model's (${primary.prices[field.key]})`,
        );
        return `Fallback target ${modelId} ${excesses.join(", ")}`;
    }
    return null;
}

async function resolveFallback(
    db: Db,
    requested: string,
    primary: FallbackPrimary,
): Promise<string> {
    const parsed = parseCommunityModelId(requested);
    if (!parsed) {
        throw new HTTPException(400, {
            message: `Fallback target ${requested} must be a community model id in the form <owner>/<name>`,
        });
    }
    const modelId = communityModelId(
        parsed.ownerGithubUsername,
        parsed.modelName,
    );
    if (modelId === primary.modelId) {
        throw new HTTPException(400, { message: SELF_FALLBACK_MESSAGE });
    }

    const owner = await db.query.user.findFirst({
        columns: { id: true },
        where: eq(schema.user.githubUsername, parsed.ownerGithubUsername),
    });
    const target = owner
        ? await db.query.communityEndpoint.findFirst({
              where: and(
                  eq(schema.communityEndpoint.ownerUserId, owner.id),
                  eq(schema.communityEndpoint.name, parsed.modelName),
              ),
          })
        : undefined;
    if (!target || shouldConcealTarget(primary, target)) {
        throw new HTTPException(400, {
            message: missingTargetMessage(modelId),
        });
    }
    const rejection = fallbackTargetRejection(primary, modelId, target);
    if (rejection) throw new HTTPException(400, { message: rejection });
    return modelId;
}

/** Resolve canonical ids in declared order and reject duplicates. */
export async function resolveFallbacks(
    db: Db,
    requested: string[],
    primary: FallbackPrimary,
): Promise<string[]> {
    const resolved: string[] = [];
    for (const requestedId of requested) {
        const modelId = await resolveFallback(db, requestedId, primary);
        if (resolved.includes(modelId)) {
            throw new HTTPException(400, {
                message: `Fallback target ${modelId} is listed more than once`,
            });
        }
        resolved.push(modelId);
    }
    return resolved;
}

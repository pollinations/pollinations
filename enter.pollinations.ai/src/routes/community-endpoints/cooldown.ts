import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPrices,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import type { ProxyPolicy } from "./proxy-policy.ts";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type CooldownRow = typeof schema.communityEndpointCooldown.$inferSelect;

type CooldownSnapshot = {
    prices: CommunityEndpointPrices;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
};

function parseSnapshot(raw: string): CooldownSnapshot | null {
    try {
        const parsed = JSON.parse(raw) as Partial<CooldownSnapshot>;
        if (!parsed || typeof parsed !== "object") return null;
        return {
            prices: communityEndpointPrices(parsed.prices ?? {}),
            modality: parsed.modality === "image" ? "image" : "text",
            imagePricing:
                parsed.imagePricing === "tokens" ? "tokens" : "request",
        };
    } catch {
        return null;
    }
}

/**
 * Read the surviving cooldown for a model id, deleting it in passing once it
 * has expired so a later create/update never has to think about stale rows.
 */
export async function getActiveCommunityEndpointCooldown(
    db: Db,
    modelId: string,
): Promise<CooldownRow | null> {
    const row = await db.query.communityEndpointCooldown.findFirst({
        where: eq(schema.communityEndpointCooldown.modelId, modelId),
    });
    if (!row) return null;
    if (row.expiresAt.getTime() > Date.now()) return row;
    await db
        .delete(schema.communityEndpointCooldown)
        .where(eq(schema.communityEndpointCooldown.modelId, modelId));
    return null;
}

/**
 * Snapshot a public proxy listing's effective price/paidOnly as it is
 * deleted. Deliberately writes to a table with no foreign key to
 * community_endpoint, so the snapshot outlives the row it was taken from —
 * that survival is what stops delete-then-recreate from skipping the
 * 12-hour price-increase delay.
 */
export async function writeCommunityEndpointCooldown(
    db: Db,
    params: {
        modelId: string;
        ownerUserId: string;
        prices: CommunityEndpointPrices;
        paidOnly: boolean;
        modality: CommunityEndpointModality;
        imagePricing: CommunityEndpointImagePricing;
        expiresAt: Date;
    },
): Promise<void> {
    const snapshot: CooldownSnapshot = {
        prices: params.prices,
        modality: params.modality,
        imagePricing: params.imagePricing,
    };
    const values = {
        ownerUserId: params.ownerUserId,
        priceSnapshot: JSON.stringify(snapshot),
        paidOnlySnapshot: params.paidOnly,
        visibilitySnapshot: "public" as const,
        expiresAt: params.expiresAt,
    };
    await db
        .insert(schema.communityEndpointCooldown)
        .values({ modelId: params.modelId, createdAt: new Date(), ...values })
        .onConflictDoUpdate({
            target: schema.communityEndpointCooldown.modelId,
            set: values,
        });
}

function minPrices(
    a: CommunityEndpointPrices,
    b: CommunityEndpointPrices,
): CommunityEndpointPrices {
    return Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
            field.key,
            Math.min(a[field.key], b[field.key]),
        ]),
    ) as CommunityEndpointPrices;
}

export type StagedCommunityEndpointCreate = {
    immediatePolicy: ProxyPolicy;
    immediateVisibility: CommunityEndpointVisibility;
    /** Present when any requested value exceeds the surviving cooldown. */
    pending: {
        policy: ProxyPolicy;
        // Only set when visibility itself is what exceeded the cooldown, so a
        // pure price/paidOnly stage never claims a visibility change is queued.
        visibility: CommunityEndpointVisibility | null;
    } | null;
};

/**
 * Clamp a fresh creation against a surviving cooldown so deleting a public
 * model and recreating it under the same name cannot skip the delay a normal
 * update would have imposed on the same change. Same/lower price, same
 * paidOnly-or-lower, and re-registering private all pass through immediately;
 * anything higher is clamped to the snapshot now and staged as pending at the
 * requested value, mirroring the update path's delayed-price mechanism.
 */
export function stageCommunityEndpointCreate(
    policy: ProxyPolicy,
    requestedVisibility: CommunityEndpointVisibility,
    cooldown: CooldownRow | null,
): StagedCommunityEndpointCreate {
    const passThrough = {
        immediatePolicy: policy,
        immediateVisibility: requestedVisibility,
        pending: null,
    };
    if (!cooldown || requestedVisibility === "private") return passThrough;

    const snapshot = parseSnapshot(cooldown.priceSnapshot);
    if (!snapshot) return passThrough;

    // Same modality, different image pricing mode (e.g. "request" cents per
    // generation vs "tokens" cents per 1M) reuses the same price field with an
    // incompatible unit, so it can never be compared numerically — treat it as
    // exceeding outright and keep the snapshot's own price live immediately
    // rather than comparing mismatched units.
    const modeChanged =
        policy.modality === snapshot.modality &&
        policy.imagePricing !== snapshot.imagePricing;
    const pricesExceed =
        modeChanged ||
        COMMUNITY_ENDPOINT_PRICE_FIELDS.some(
            (field) => policy.prices[field.key] > snapshot.prices[field.key],
        );
    const paidOnlyExceeds = policy.paidOnly && !cooldown.paidOnlySnapshot;
    const visibilityExceeds =
        requestedVisibility === "public" &&
        cooldown.visibilitySnapshot === "private";

    if (!pricesExceed && !paidOnlyExceeds && !visibilityExceeds) {
        return passThrough;
    }

    const immediatePolicy: ProxyPolicy = {
        ...policy,
        paidOnly: policy.paidOnly && cooldown.paidOnlySnapshot,
        imagePricing: modeChanged ? snapshot.imagePricing : policy.imagePricing,
        prices: modeChanged
            ? snapshot.prices
            : minPrices(policy.prices, snapshot.prices),
    };
    const immediateVisibility: CommunityEndpointVisibility = visibilityExceeds
        ? "private"
        : requestedVisibility;

    return {
        immediatePolicy,
        immediateVisibility,
        pending: {
            policy,
            visibility: visibilityExceeds ? requestedVisibility : null,
        },
    };
}

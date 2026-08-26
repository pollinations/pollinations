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
 * Build (without executing) the upsert that snapshots a public proxy
 * listing's effective price/paidOnly as it is deleted. Deliberately writes
 * to a table with no foreign key to community_endpoint, so the snapshot
 * outlives the row it was taken from — that survival is what stops
 * delete-then-recreate from skipping the 12-hour price-increase delay.
 *
 * Returns an unexecuted query so the caller can run it in the same D1 batch
 * as the endpoint deletion: committing them separately would leave a window
 * where a failed cooldown write (or a create racing in between) lets the
 * model be deleted with no cooldown behind it, reopening the bypass.
 */
export function buildCommunityEndpointCooldownUpsert(
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
) {
    const snapshot: CooldownSnapshot = {
        prices: params.prices,
        modality: params.modality,
        imagePricing: params.imagePricing,
    };
    const values = {
        ownerUserId: params.ownerUserId,
        priceSnapshot: JSON.stringify(snapshot),
        paidOnlySnapshot: params.paidOnly,
        expiresAt: params.expiresAt,
    };
    return db
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
    /** Present when any requested price/paidOnly exceeds the surviving cooldown. */
    pending: ProxyPolicy | null;
};

/**
 * Clamp a fresh creation against a surviving cooldown so deleting a public
 * model and recreating it under the same name cannot skip the delay a normal
 * update would have imposed on the same price/paidOnly change. Same/lower
 * price, same-or-lower paidOnly, and re-registering private all pass through
 * immediately; anything higher is clamped to the snapshot now and staged as
 * pending at the requested value, mirroring the update path's delayed-price
 * mechanism. Visibility itself is never gated here — a cooldown is only ever
 * recorded for an already-public listing, so there is nothing to protect
 * against a private→public jump on create.
 */
export function stageCommunityEndpointCreate(
    policy: ProxyPolicy,
    requestedVisibility: CommunityEndpointVisibility,
    cooldown: CooldownRow | null,
): StagedCommunityEndpointCreate {
    const passThrough = { immediatePolicy: policy, pending: null };
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

    if (!pricesExceed && !paidOnlyExceeds) return passThrough;

    const immediatePolicy: ProxyPolicy = {
        ...policy,
        paidOnly: policy.paidOnly && cooldown.paidOnlySnapshot,
        imagePricing: modeChanged ? snapshot.imagePricing : policy.imagePricing,
        prices: modeChanged
            ? snapshot.prices
            : minPrices(policy.prices, snapshot.prices),
    };

    return { immediatePolicy, pending: policy };
}

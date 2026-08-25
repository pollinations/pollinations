import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    COMMUNITY_MODEL_REWARD_RATE,
    type CommunityEndpointRuntime,
} from "../community-endpoints.ts";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import {
    byopClientAllowsMarkup,
    computeDevCredit,
    MARKUP_PCT,
} from "./markup.ts";
import { roundPollenLedgerAmount } from "./precision.ts";

export type MarkupResolution = {
    devUserId: string;
    devCredit: number;
    markupRate: number;
};

export type CommunityModelRewardResolution = {
    userId: string;
    rewardRate: number;
    credit: number;
};

export type CommunityModelRewardInput = {
    userId: string;
    rewardRate: number;
    /**
     * What to pay the reward on, when that is not what the caller was charged.
     * A fallback owner is paid on their own listing: the caller bought the
     * model they asked for, so rewarding a share of that price would pay the
     * rescuer more than they charge for the same work.
     */
    basePrice?: number;
};

export function selectCommunityModelReward(
    requestedCommunityEndpoint: CommunityEndpointRuntime | null | undefined,
    servedCommunityEndpoint: CommunityEndpointRuntime | null | undefined,
    servedPrice: number | undefined,
): CommunityModelRewardInput | null {
    if (servedCommunityEndpoint?.visibility === "public") {
        return {
            userId: servedCommunityEndpoint.ownerUserId,
            rewardRate: COMMUNITY_MODEL_REWARD_RATE,
            basePrice: servedPrice,
        };
    }

    if (
        requestedCommunityEndpoint?.visibility === "public" &&
        servedCommunityEndpoint?.visibility === "private" &&
        servedCommunityEndpoint.ownerUserId ===
            requestedCommunityEndpoint.ownerUserId
    ) {
        return {
            userId: requestedCommunityEndpoint.ownerUserId,
            rewardRate: COMMUNITY_MODEL_REWARD_RATE,
            basePrice: servedPrice,
        };
    }

    return null;
}

export async function resolveDevMarkup(
    db: DrizzleD1Database,
    byopClientKeyId: string | null | undefined,
    baselinePrice: number,
    payerUserId: string | undefined,
): Promise<MarkupResolution | null> {
    if (!byopClientKeyId || !payerUserId) return null;

    const credit = computeDevCredit(baselinePrice);
    if (credit <= 0) return null;

    const [clientRow] = await db
        .select({
            userId: apikeyTable.userId,
            metadata: apikeyTable.metadata,
            prefix: apikeyTable.prefix,
            enabled: apikeyTable.enabled,
            expiresAt: apikeyTable.expiresAt,
        })
        .from(apikeyTable)
        .where(
            and(
                eq(apikeyTable.id, byopClientKeyId),
                eq(apikeyTable.prefix, "pk"),
                eq(apikeyTable.enabled, true),
                or(
                    isNull(apikeyTable.expiresAt),
                    gt(apikeyTable.expiresAt, new Date()),
                ),
            ),
        )
        .limit(1);

    if (!byopClientAllowsMarkup(clientRow, payerUserId)) return null;

    return {
        devUserId: clientRow.userId,
        devCredit: credit,
        markupRate: MARKUP_PCT,
    };
}

export function resolveCommunityModelReward(
    reward: CommunityModelRewardInput | null | undefined,
    baselinePrice: number,
    payerUserId: string | undefined,
): CommunityModelRewardResolution | null {
    if (!reward || !payerUserId) return null;
    // Never above what was charged: a target repriced between resolving the
    // fallback and settling the request must not pay out more than we took.
    const rewardBase = Math.min(
        reward.basePrice ?? baselinePrice,
        baselinePrice,
    );
    if (rewardBase <= 0 || reward.rewardRate <= 0) return null;

    const credit = roundPollenLedgerAmount(rewardBase * reward.rewardRate);
    if (credit <= 0) return null;

    return {
        userId: reward.userId,
        rewardRate: reward.rewardRate,
        credit,
    };
}

import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    COMMUNITY_MODEL_REWARD_RATE,
    type CommunityEndpointRuntime,
} from "../community-endpoints.ts";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import {
    atomicAdjustApiKeyBalance,
    atomicCreditUserBalance,
    atomicDeductUserBalance,
    type Bucket,
} from "./deduction.ts";
import {
    byopClientAllowsMarkup,
    computeDevCredit,
    MARKUP_PCT,
} from "./markup.ts";
import { roundPollenLedgerAmount } from "./precision.ts";

const log = getLogger(["track", "helpers"]);

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

interface DeductionParams {
    db: DrizzleD1Database;
    isBilledUsage: boolean;
    totalPrice?: number;
    userId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
    apiKeyReservedAmount?: number;
    byopClientKeyId?: string | null;
    modelPaidOnly?: boolean;
    communityModelReward?: CommunityModelRewardInput | null;
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

/**
 * Handles balance deduction and developer credits for billable requests.
 *
 * The pipeline, in order:
 *
 *   1. resolve markup eligibility (DB lookup) and the community reward (pure),
 *   2. compute `billedPrice` (baseline + markup, snapped to ledger precision),
 *   3. deduct the payer (user balance, then API-key budget),
 *   4. credit the dev (BYOP markup) and community owner (reward).
 *
 * Returns `billedPrice` — the rounded amount actually debited from the payer
 * (`totalPrice + devCredit`, snapped to `POLLEN_BILLING_PRECISION`). Callers
 * should use this for analytics/event totals so they match the ledger.
 */
export async function handleBalanceDeduction(params: DeductionParams): Promise<{
    markup: MarkupResolution | null;
    communityModelReward: CommunityModelRewardResolution | null;
    payerBucket: Bucket | null;
    postDeductionPackBalance: number | null;
    billedPrice: number;
}> {
    const {
        db,
        isBilledUsage,
        totalPrice,
        userId,
        apiKeyId,
        apiKeyPollenBalance,
        apiKeyReservedAmount,
        byopClientKeyId,
        modelPaidOnly,
        communityModelReward: communityModelRewardInput,
    } = params;

    if (
        apiKeyId &&
        hasApiKeyBudget(apiKeyPollenBalance) &&
        apiKeyReservedAmount === undefined
    ) {
        throw new Error(
            `API key budget reservation is missing for ${apiKeyId}`,
        );
    }

    if (!isBilledUsage || totalPrice == null || totalPrice === 0) {
        await reconcileApiKeyBalance(
            db,
            apiKeyId,
            apiKeyPollenBalance,
            apiKeyReservedAmount,
            0,
        );
        return {
            markup: null,
            communityModelReward: null,
            payerBucket: null,
            postDeductionPackBalance: null,
            billedPrice: 0,
        };
    }

    // The caller already bears the upstream cost of their own community
    // endpoint. Do not charge them through Pollinations or pay them back a
    // partial reward. The reward input follows the endpoint that actually
    // served the request, so a fallback owned by somebody else is still billed.
    if (communityModelRewardInput?.userId === userId) {
        await reconcileApiKeyBalance(
            db,
            apiKeyId,
            apiKeyPollenBalance,
            apiKeyReservedAmount,
            0,
        );
        return {
            markup: null,
            communityModelReward: null,
            payerBucket: null,
            postDeductionPackBalance: null,
            billedPrice: 0,
        };
    }

    // 1. Resolve the two independent "who else gets money" inputs.
    let markup: MarkupResolution | null;
    try {
        markup = await resolveDevMarkup(
            db,
            byopClientKeyId,
            totalPrice,
            userId,
        );
    } catch (error) {
        await reconcileApiKeyBalance(
            db,
            apiKeyId,
            apiKeyPollenBalance,
            apiKeyReservedAmount,
            0,
        );
        throw error;
    }
    let communityModelReward = resolveCommunityModelReward(
        communityModelRewardInput,
        totalPrice,
        userId,
    );

    // 2. The payer is charged baseline + markup (the community reward is paid
    //    out of the baseline, not added on top of what the payer owes).
    const billedPrice = computeBilledPrice(totalPrice, markup);

    // 3. Deduct the payer. Markup and reward credits go to the same bucket the
    //    payer drew from, so they are only possible once that bucket is known.
    let payerBucket: Bucket | null = null;
    let postDeductionPackBalance: number | null = null;
    let payerDeducted = !userId;

    try {
        if (userId) {
            const deduction = await deductUserBalance(
                db,
                userId,
                billedPrice,
                modelPaidOnly,
            );
            payerBucket = deduction.bucket;
            postDeductionPackBalance = deduction.postDeductionPackBalance;
            payerDeducted = true;
            if (
                deduction.postDeductionBalance != null &&
                deduction.postDeductionBalance < 0
            ) {
                markup = null;
                communityModelReward = null;
                log.warn(
                    "Suppressed generation credits because the payer's {bucket} balance is negative after deduction ({balance})",
                    {
                        bucket: payerBucket,
                        balance: deduction.postDeductionBalance,
                    },
                );
            }
        }

        // API key budgets are decremented by the amount the user authorized the
        // app to spend, including BYOP markup when it applies.
        if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
            await reconcileApiKeyBalance(
                db,
                apiKeyId,
                apiKeyPollenBalance,
                apiKeyReservedAmount,
                billedPrice,
            );
        }

        // 4. Credits. Both require a payer bucket (nothing to net against
        //    otherwise) and write to it so the flows stay in balance.
        if (markup) {
            await creditDev(db, markup, payerBucket);
        }
        if (communityModelReward) {
            await creditCommunityOwner(db, communityModelReward, payerBucket);
        }
    } catch (error) {
        if (!payerDeducted) {
            try {
                await reconcileApiKeyBalance(
                    db,
                    apiKeyId,
                    apiKeyPollenBalance,
                    apiKeyReservedAmount,
                    0,
                );
            } catch (releaseError) {
                log.error(
                    "Failed to release API key reservation after payer deduction failed: {error}",
                    {
                        error:
                            releaseError instanceof Error
                                ? releaseError.message
                                : String(releaseError),
                    },
                );
            }
        }
        logBillingFailure(error, markup, communityModelReward);
        throw error;
    }

    return {
        markup,
        communityModelReward,
        payerBucket,
        postDeductionPackBalance,
        billedPrice,
    };
}

/** Baseline charge + dev markup, snapped to the shared ledger precision. */
function computeBilledPrice(
    totalPrice: number,
    markup: MarkupResolution | null,
): number {
    return roundPollenLedgerAmount(totalPrice + (markup?.devCredit ?? 0));
}

/** Credit the dev the BYOP markup, into the bucket the payer drew from. */
async function creditDev(
    db: DrizzleD1Database,
    markup: MarkupResolution,
    payerBucket: Bucket | null,
): Promise<void> {
    if (!payerBucket) {
        throw new Error("BYOP markup requires a payer balance bucket");
    }
    const creditAmount = roundPollenLedgerAmount(markup.devCredit);
    const { ok } = await atomicCreditUserBalance(
        db,
        markup.devUserId,
        payerBucket,
        creditAmount,
    );
    if (!ok) {
        throw new Error(
            `Dev credit UPDATE affected 0 rows for ${markup.devUserId}`,
        );
    }
    log.debug(
        "Credited {credit} pollen to dev {devUserId} {bucket} balance (markup={pct}%)",
        {
            credit: creditAmount,
            devUserId: markup.devUserId,
            bucket: payerBucket,
            pct: (markup.markupRate * 100).toFixed(0),
        },
    );
}

/** Credit the community model owner their reward, into the payer's bucket. */
async function creditCommunityOwner(
    db: DrizzleD1Database,
    reward: CommunityModelRewardResolution,
    payerBucket: Bucket | null,
): Promise<void> {
    if (!payerBucket) {
        throw new Error(
            "Community model reward requires a payer balance bucket",
        );
    }
    const { ok } = await atomicCreditUserBalance(
        db,
        reward.userId,
        payerBucket,
        reward.credit,
    );
    if (!ok) {
        throw new Error(
            `Community model reward UPDATE affected 0 rows for ${reward.userId}`,
        );
    }
    log.debug(
        "Credited {credit} pollen to community model owner {userId} {bucket} balance (reward={pct}%)",
        {
            credit: reward.credit,
            userId: reward.userId,
            bucket: payerBucket,
            pct: (reward.rewardRate * 100).toFixed(0),
        },
    );
}

/** Log a pipeline failure with the same severity and labels as before. */
function logBillingFailure(
    error: unknown,
    markup: MarkupResolution | null,
    communityModelReward: CommunityModelRewardResolution | null,
): void {
    const message = error instanceof Error ? error.message : String(error);
    const isCommunityCreditFailure =
        error instanceof Error &&
        error.message.startsWith("Community model reward");
    const isDevCreditFailure =
        error instanceof Error && error.message.startsWith("Dev credit");

    if (communityModelReward) {
        if (isCommunityCreditFailure) {
            log.error("Community model reward failed for {userId}: {error}", {
                userId: communityModelReward.userId,
                error: message,
            });
        } else {
            log.error(
                "Failed to bill community model request for owner {userId}: {error}",
                { userId: communityModelReward.userId, error: message },
            );
        }
    }
    if (markup) {
        if (isDevCreditFailure) {
            log.error("Dev credit failed for {devUserId}: {error}", {
                devUserId: markup.devUserId,
                error: message,
            });
        } else {
            log.error(
                "Failed to bill BYOP request for dev {devUserId}: {error}",
                { devUserId: markup.devUserId, error: message },
            );
        }
    }
}

function hasApiKeyBudget(
    balance: number | null | undefined,
): balance is number {
    return typeof balance === "number";
}

async function reconcileApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string | undefined,
    apiKeyPollenBalance: number | null | undefined,
    reservedAmount: number | undefined,
    billedAmount: number,
): Promise<void> {
    if (!apiKeyId || !hasApiKeyBudget(apiKeyPollenBalance)) return;
    if (reservedAmount === undefined) {
        throw new Error(
            `API key budget reservation is missing for ${apiKeyId}`,
        );
    }

    const adjustment = roundPollenLedgerAmount(billedAmount - reservedAmount);
    try {
        const { ok } = await atomicAdjustApiKeyBalance(
            db,
            apiKeyId,
            adjustment,
        );
        if (!ok) {
            throw new Error(
                `API key budget reconciliation affected 0 rows for ${apiKeyId}`,
            );
        }
        log.debug(
            "Reconciled API key {keyId} budget from reserved={reserved} to billed={billed}",
            { keyId: apiKeyId, reserved: reservedAmount, billed: billedAmount },
        );
    } catch (error) {
        log.error("Failed to reconcile API key budget for {keyId}: {error}", {
            keyId: apiKeyId,
            error: error instanceof Error ? error.message : error,
        });
        throw error;
    }
}

async function deductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    modelPaidOnly?: boolean,
): Promise<{
    bucket: Bucket | null;
    postDeductionPackBalance: number | null;
    postDeductionBalance: number | null;
}> {
    try {
        const { ok, bucket, packBalance, postDeductionBalance } =
            await atomicDeductUserBalance(
                db,
                userId,
                amount,
                modelPaidOnly ?? false,
            );
        if (!ok) {
            throw new Error(
                `User balance deduction affected 0 rows for ${userId}`,
            );
        }
        const deductionSource = {
            fromTier: bucket === "tier" ? amount : 0,
            fromPack: bucket === "pack" ? amount : 0,
        };

        log.debug(
            "Decremented {price} pollen from user {userId} (quest: -{fromTier}, pack: -{fromPack})",
            {
                price: amount,
                userId,
                ...deductionSource,
            },
        );
        return {
            bucket,
            postDeductionPackBalance: bucket === "pack" ? packBalance : null,
            postDeductionBalance,
        };
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

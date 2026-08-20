import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { parseMetadata } from "../auth/api-key-metadata.ts";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import {
    atomicCreditUserBalance,
    atomicDeductApiKeyBalance,
    atomicDeductUserBalance,
    type Bucket,
} from "./deduction.ts";
import { computeDevCredit, MARKUP_PCT } from "./markup.ts";
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

export interface DeductionParams {
    db: DrizzleD1Database;
    isBilledUsage: boolean;
    totalPrice?: number;
    userId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
    byopClientKeyId?: string | null;
    modelPaidOnly?: boolean;
    communityModelReward?: CommunityModelRewardInput | null;
}

export type DeductionResult = {
    markup: MarkupResolution | null;
    communityModelReward: CommunityModelRewardResolution | null;
    payerBucket: Bucket | null;
    postDeductionPackBalance: number | null;
    billedPrice: number;
};

export type IdempotentDeductionResult = DeductionResult & {
    committed: boolean;
};

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
        .select({ userId: apikeyTable.userId, metadata: apikeyTable.metadata })
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

    if (!clientRow?.userId) return null;
    if (parseMetadata(clientRow.metadata).earningsEnabled !== true) return null;
    if (clientRow.userId === payerUserId) return null;

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
 * Returns `billedPrice` — the rounded amount actually debited from the payer
 * (`totalPrice + devCredit`, snapped to `POLLEN_BILLING_PRECISION`). Callers
 * should use this for analytics/event totals so they match the ledger.
 */
export async function handleBalanceDeduction(
    params: DeductionParams,
): Promise<DeductionResult> {
    const {
        db,
        isBilledUsage,
        totalPrice,
        userId,
        apiKeyId,
        apiKeyPollenBalance,
        byopClientKeyId,
        modelPaidOnly,
        communityModelReward: communityModelRewardInput,
    } = params;

    if (!isBilledUsage || totalPrice == null || totalPrice === 0) {
        return {
            markup: null,
            communityModelReward: null,
            payerBucket: null,
            postDeductionPackBalance: null,
            billedPrice: 0,
        };
    }

    const resolved = await resolveDevMarkup(
        db,
        byopClientKeyId,
        totalPrice,
        userId,
    );
    const markup: MarkupResolution | null = resolved;
    const communityModelReward = resolveCommunityModelReward(
        communityModelRewardInput,
        totalPrice,
        userId,
    );
    const billedPrice = roundPollenLedgerAmount(
        totalPrice + (markup?.devCredit ?? 0),
    );
    let payerBucket: Bucket | null = null;
    let postDeductionPackBalance: number | null = null;

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
        }

        // API key budgets are decremented by the amount the user authorized the
        // app to spend, including BYOP markup when it applies.
        if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
            await deductApiKeyBalance(db, apiKeyId, billedPrice);
        }

        if (markup) {
            if (!payerBucket) {
                throw new Error("BYOP markup requires a payer balance bucket");
            }
            const creditBucket = payerBucket;
            const creditAmount = roundPollenLedgerAmount(markup.devCredit);
            const { ok } = await atomicCreditUserBalance(
                db,
                markup.devUserId,
                creditBucket,
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
                    bucket: creditBucket,
                    pct: (markup.markupRate * 100).toFixed(0),
                },
            );
        }

        if (communityModelReward) {
            if (!payerBucket) {
                throw new Error(
                    "Community model reward requires a payer balance bucket",
                );
            }
            const creditAmount = communityModelReward.credit;
            const { ok } = await atomicCreditUserBalance(
                db,
                communityModelReward.userId,
                payerBucket,
                creditAmount,
            );
            if (!ok) {
                throw new Error(
                    `Community model reward UPDATE affected 0 rows for ${communityModelReward.userId}`,
                );
            }
            log.debug(
                "Credited {credit} pollen to community model owner {userId} {bucket} balance (reward={pct}%)",
                {
                    credit: creditAmount,
                    userId: communityModelReward.userId,
                    bucket: payerBucket,
                    pct: (communityModelReward.rewardRate * 100).toFixed(0),
                },
            );
        }
    } catch (error) {
        if (communityModelReward) {
            if (
                error instanceof Error &&
                error.message.startsWith("Community model reward")
            ) {
                log.error(
                    "Community model reward failed for {userId}: {error}",
                    {
                        userId: communityModelReward.userId,
                        error: error.message,
                    },
                );
            } else {
                log.error(
                    "Failed to bill community model request for owner {userId}: {error}",
                    {
                        userId: communityModelReward.userId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }
        if (markup) {
            if (
                error instanceof Error &&
                error.message.startsWith("Dev credit")
            ) {
                log.error("Dev credit failed for {devUserId}: {error}", {
                    devUserId: markup.devUserId,
                    error: error.message,
                });
            } else {
                log.error(
                    "Failed to bill BYOP request for dev {devUserId}: {error}",
                    {
                        devUserId: markup.devUserId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }
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

type StoredSettlement = {
    settlementId: string;
    payerUserId: string;
    apiKeyId: string | null;
    basePrice: number;
    billedPrice: number;
    payerBucket: Bucket | null;
    markupJson: string | null;
    communityModelRewardJson: string | null;
    postDeductionPackBalance: number | null;
};

type IdempotentDeductionParams = Omit<DeductionParams, "db"> & {
    d1: D1Database;
    settlementId: string;
};

/**
 * Atomically settles a billable request once. Durable Object alarms are
 * at-least-once, so every update is gated by the server-owned settlement id.
 */
export async function handleBalanceDeductionOnce(
    params: IdempotentDeductionParams,
): Promise<IdempotentDeductionResult> {
    const {
        d1,
        settlementId,
        isBilledUsage,
        totalPrice: rawTotalPrice,
        userId,
        apiKeyId,
        apiKeyPollenBalance,
        byopClientKeyId,
        modelPaidOnly = false,
        communityModelReward: communityModelRewardInput,
    } = params;

    if (!isBilledUsage) {
        return { ...emptyDeduction(), committed: true };
    }
    if (!userId) {
        throw new Error("Billed generation requires a payer user");
    }

    const db = drizzle(d1);
    const basePrice = roundPollenLedgerAmount(rawTotalPrice ?? 0);
    const markup = await resolveDevMarkup(
        db,
        byopClientKeyId,
        basePrice,
        userId,
    );
    const communityModelReward = resolveCommunityModelReward(
        communityModelRewardInput,
        basePrice,
        userId,
    );
    const billedPrice = roundPollenLedgerAmount(
        basePrice + (markup?.devCredit ?? 0),
    );
    const markupJson = markup ? JSON.stringify(markup) : null;
    const communityModelRewardJson = communityModelReward
        ? JSON.stringify(communityModelReward)
        : null;

    if (billedPrice === 0) {
        const result = await d1
            .prepare(
                `INSERT OR IGNORE INTO generation_settlement (
                    settlement_id,
                    payer_user_id,
                    api_key_id,
                    base_price,
                    billed_price,
                    payer_bucket,
                    markup_json,
                    community_model_reward_json,
                    post_deduction_pack_balance,
                    created_at
                ) VALUES (?, ?, ?, 0, 0, NULL, NULL, NULL, NULL, ?)`,
            )
            .bind(settlementId, userId, apiKeyId ?? null, Date.now())
            .run();
        const stored = await requireSettlement(d1, settlementId);
        assertSamePayer(stored, userId, apiKeyId);
        return storedDeduction(stored, (result.meta.changes ?? 0) === 1);
    }

    const hasFiniteApiKeyBudget =
        Boolean(apiKeyId) && typeof apiKeyPollenBalance === "number";
    const dependencyChecks = [
        ...(hasFiniteApiKeyBudget
            ? [
                  "AND EXISTS (SELECT 1 FROM apikey WHERE id = ? AND pollen_balance IS NOT NULL)",
              ]
            : []),
        ...(markup ? ["AND EXISTS (SELECT 1 FROM user WHERE id = ?)"] : []),
        ...(communityModelReward
            ? ["AND EXISTS (SELECT 1 FROM user WHERE id = ?)"]
            : []),
    ].join("\n");
    const dependencyBindings = [
        ...(hasFiniteApiKeyBudget ? [apiKeyId] : []),
        ...(markup ? [markup.devUserId] : []),
        ...(communityModelReward ? [communityModelReward.userId] : []),
    ];

    const statements: D1PreparedStatement[] = [
        d1
            .prepare(
                `INSERT OR IGNORE INTO generation_settlement (
                    settlement_id,
                    payer_user_id,
                    api_key_id,
                    base_price,
                    billed_price,
                    payer_bucket,
                    markup_json,
                    community_model_reward_json,
                    post_deduction_pack_balance,
                    created_at
                )
                SELECT
                    ?,
                    payer.id,
                    ?,
                    ?,
                    ?,
                    CASE
                        WHEN ? = 1 THEN 'pack'
                        WHEN COALESCE(payer.tier_balance, 0) >= ? THEN 'tier'
                        WHEN COALESCE(payer.pack_balance, 0) > 0 THEN 'pack'
                        ELSE 'tier'
                    END,
                    ?,
                    ?,
                    NULL,
                    ?
                FROM user AS payer
                WHERE payer.id = ?
                ${dependencyChecks}`,
            )
            .bind(
                settlementId,
                apiKeyId ?? null,
                basePrice,
                billedPrice,
                modelPaidOnly ? 1 : 0,
                billedPrice,
                markupJson,
                communityModelRewardJson,
                Date.now(),
                userId,
                ...dependencyBindings,
            ),
        d1
            .prepare(
                `UPDATE user
                SET
                    tier_balance = CASE
                        WHEN (SELECT payer_bucket FROM generation_settlement WHERE settlement_id = ?) = 'tier'
                            THEN COALESCE(tier_balance, 0) - ?
                        ELSE tier_balance
                    END,
                    pack_balance = CASE
                        WHEN (SELECT payer_bucket FROM generation_settlement WHERE settlement_id = ?) = 'pack'
                            THEN COALESCE(pack_balance, 0) - ?
                        ELSE pack_balance
                    END
                WHERE id = ? AND changes() = 1`,
            )
            .bind(settlementId, billedPrice, settlementId, billedPrice, userId),
        d1
            .prepare(
                `UPDATE generation_settlement
                SET post_deduction_pack_balance = (
                    SELECT pack_balance FROM user WHERE id = payer_user_id
                )
                WHERE settlement_id = ? AND changes() = 1`,
            )
            .bind(settlementId),
    ];

    if (hasFiniteApiKeyBudget) {
        statements.push(
            d1
                .prepare(
                    `UPDATE apikey
                    SET pollen_balance = pollen_balance - ?
                    WHERE id = ?
                      AND pollen_balance IS NOT NULL
                      AND changes() = 1`,
                )
                .bind(billedPrice, apiKeyId),
        );
    }

    if (markup) {
        statements.push(
            creditStatement(
                d1,
                settlementId,
                markup.devUserId,
                markup.devCredit,
            ),
        );
    }
    if (communityModelReward) {
        statements.push(
            creditStatement(
                d1,
                settlementId,
                communityModelReward.userId,
                communityModelReward.credit,
            ),
        );
    }

    const results = await d1.batch(statements);
    const committed = (results[0]?.meta.changes ?? 0) === 1;
    if (
        committed &&
        results.slice(1).some((result) => result.meta.changes !== 1)
    ) {
        throw new Error(`Generation settlement incomplete for ${settlementId}`);
    }

    const stored = await requireSettlement(d1, settlementId);
    assertSamePayer(stored, userId, apiKeyId);
    if (committed) {
        log.debug(
            "Settled generation {settlementId}: charged {billedPrice} to {userId} from {payerBucket}",
            {
                settlementId,
                billedPrice: stored.billedPrice,
                userId,
                payerBucket: stored.payerBucket,
            },
        );
    }
    return storedDeduction(stored, committed);
}

function creditStatement(
    d1: D1Database,
    settlementId: string,
    userId: string,
    amount: number,
): D1PreparedStatement {
    return d1
        .prepare(
            `UPDATE user
            SET
                tier_balance = CASE
                    WHEN (SELECT payer_bucket FROM generation_settlement WHERE settlement_id = ?) = 'tier'
                        THEN COALESCE(tier_balance, 0) + ?
                    ELSE tier_balance
                END,
                pack_balance = CASE
                    WHEN (SELECT payer_bucket FROM generation_settlement WHERE settlement_id = ?) = 'pack'
                        THEN COALESCE(pack_balance, 0) + ?
                    ELSE pack_balance
                END
            WHERE id = ? AND changes() = 1`,
        )
        .bind(settlementId, amount, settlementId, amount, userId);
}

async function loadSettlement(
    d1: D1Database,
    settlementId: string,
): Promise<StoredSettlement | null> {
    return d1
        .prepare(
            `SELECT
                settlement_id AS settlementId,
                payer_user_id AS payerUserId,
                api_key_id AS apiKeyId,
                base_price AS basePrice,
                billed_price AS billedPrice,
                payer_bucket AS payerBucket,
                markup_json AS markupJson,
                community_model_reward_json AS communityModelRewardJson,
                post_deduction_pack_balance AS postDeductionPackBalance
            FROM generation_settlement
            WHERE settlement_id = ?`,
        )
        .bind(settlementId)
        .first<StoredSettlement>();
}

async function requireSettlement(
    d1: D1Database,
    settlementId: string,
): Promise<StoredSettlement> {
    const stored = await loadSettlement(d1, settlementId);
    if (!stored) {
        throw new Error(
            `Generation settlement dependencies missing for ${settlementId}`,
        );
    }
    return stored;
}

function assertSamePayer(
    stored: StoredSettlement,
    userId: string,
    apiKeyId: string | undefined,
): void {
    if (
        stored.payerUserId !== userId ||
        stored.apiKeyId !== (apiKeyId ?? null)
    ) {
        throw new Error(
            `Settlement ${stored.settlementId} belongs to a different payer`,
        );
    }
}

function storedDeduction(
    stored: StoredSettlement,
    committed: boolean,
): IdempotentDeductionResult {
    return {
        markup: stored.markupJson
            ? (JSON.parse(stored.markupJson) as MarkupResolution)
            : null,
        communityModelReward: stored.communityModelRewardJson
            ? (JSON.parse(
                  stored.communityModelRewardJson,
              ) as CommunityModelRewardResolution)
            : null,
        payerBucket: stored.payerBucket,
        postDeductionPackBalance:
            stored.payerBucket === "pack"
                ? stored.postDeductionPackBalance
                : null,
        billedPrice: stored.billedPrice,
        committed,
    };
}

function emptyDeduction(): DeductionResult {
    return {
        markup: null,
        communityModelReward: null,
        payerBucket: null,
        postDeductionPackBalance: null,
        billedPrice: 0,
    };
}

function hasApiKeyBudget(
    balance: number | null | undefined,
): balance is number {
    return typeof balance === "number";
}

async function deductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<void> {
    try {
        const { ok } = await atomicDeductApiKeyBalance(db, apiKeyId, amount);
        if (!ok) {
            throw new Error(
                `API key budget deduction affected 0 rows for ${apiKeyId}`,
            );
        }
        log.debug("Decremented {price} pollen from API key {keyId} budget", {
            price: amount,
            keyId: apiKeyId,
        });
    } catch (error) {
        log.error("Failed to decrement API key budget for {keyId}: {error}", {
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
}> {
    try {
        const { ok, bucket, packBalance } = await atomicDeductUserBalance(
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
        };
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import type { ModelName } from "../registry/registry.ts";
import { getModelDefinition } from "../registry/registry.ts";
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

export type EarnedCredit = {
    recipientUserId: string;
    amount: number;
    rate: number;
    source: "byop_markup" | "community_endpoint";
    entityId: string;
};

interface DeductionParams {
    db: DrizzleD1Database;
    isBilledUsage: boolean;
    totalPrice?: number;
    userId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
    byopClientKeyId?: string | null;
    modelResolved?: string;
    isPaidOnly?: boolean;
    earnedCredits?: EarnedCredit[];
}

function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
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

/**
 * Handles balance deduction plus earned credits for billable requests.
 * BYOP markup is added to the payer charge; other earned credits are paid from
 * the model price already present in `totalPrice`.
 */
export async function handleBalanceDeduction(params: DeductionParams): Promise<{
    markup: MarkupResolution | null;
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
        byopClientKeyId,
        modelResolved,
        isPaidOnly,
        earnedCredits = [],
    } = params;

    if (!isBilledUsage || totalPrice == null || totalPrice === 0) {
        return {
            markup: null,
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
    const billedPrice = roundPollenLedgerAmount(
        totalPrice + (markup?.devCredit ?? 0),
    );
    const creditsToApply = [
        ...(markup
            ? [
                  {
                      recipientUserId: markup.devUserId,
                      amount: markup.devCredit,
                      rate: markup.markupRate,
                      source: "byop_markup" as const,
                      entityId: byopClientKeyId ?? "",
                  },
              ]
            : []),
        ...earnedCredits,
    ]
        .map((credit) => ({
            ...credit,
            amount: roundPollenLedgerAmount(credit.amount),
        }))
        .filter(
            (credit) => credit.amount > 0 && credit.recipientUserId !== userId,
        );
    let payerBucket: Bucket | null = null;
    let postDeductionPackBalance: number | null = null;

    try {
        if (userId) {
            const deduction = await deductUserBalance(
                db,
                userId,
                billedPrice,
                modelResolved,
                isPaidOnly,
            );
            payerBucket = deduction.bucket;
            postDeductionPackBalance = deduction.postDeductionPackBalance;
        }

        // API key budgets are decremented by the amount the user authorized the
        // app to spend, including BYOP markup when it applies.
        if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
            await deductApiKeyBalance(db, apiKeyId, billedPrice);
        }

        if (creditsToApply.length > 0) {
            if (!payerBucket) {
                throw new Error(
                    "Earned credit requires a payer balance bucket",
                );
            }
            for (const credit of creditsToApply) {
                const { ok } = await atomicCreditUserBalance(
                    db,
                    credit.recipientUserId,
                    payerBucket,
                    credit.amount,
                );
                if (!ok) {
                    throw new Error(
                        `Earned credit UPDATE affected 0 rows for ${credit.recipientUserId}`,
                    );
                }
                log.debug(
                    "Credited {credit} pollen to {recipientUserId} {bucket} balance (source={source}, rate={pct}%)",
                    {
                        credit: credit.amount,
                        recipientUserId: credit.recipientUserId,
                        bucket: payerBucket,
                        source: credit.source,
                        pct: (credit.rate * 100).toFixed(0),
                    },
                );
            }
        }
    } catch (error) {
        if (creditsToApply.length > 0) {
            if (
                error instanceof Error &&
                error.message.startsWith("Earned credit")
            ) {
                log.error("Earned credit failed: {error}", {
                    error: error.message,
                });
            } else {
                log.error(
                    "Failed to bill request with earned credit: {error}",
                    {
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

    return { markup, payerBucket, postDeductionPackBalance, billedPrice };
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
    modelResolved?: string,
    isPaidOnlyOverride?: boolean,
): Promise<{
    bucket: Bucket | null;
    postDeductionPackBalance: number | null;
}> {
    try {
        const isPaidOnly =
            isPaidOnlyOverride ??
            (modelResolved
                ? (getModelDefinition(modelResolved as ModelName).paidOnly ??
                  false)
                : false);

        const { ok, bucket, packBalance } = await atomicDeductUserBalance(
            db,
            userId,
            amount,
            isPaidOnly,
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
            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, pack: -{fromPack})",
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

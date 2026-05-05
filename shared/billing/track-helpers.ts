import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import type { ModelName } from "../registry/registry.ts";
import { getModelDefinition } from "../registry/registry.ts";
import {
    atomicCreditUserBalance,
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    type Bucket,
} from "./deduction.ts";
import { computeDevCredit, MARKUP_PCT } from "./markup.ts";

const log = getLogger(["track", "helpers"]);

export type MarkupResolution = {
    devUserId: string;
    devCredit: number;
    markupPct: number;
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
}

function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed && typeof parsed === "object" ? parsed : {};
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
        markupPct: MARKUP_PCT,
    };
}

/**
 * Handles balance deduction and BYOP dev credit for billable requests.
 */
export async function handleBalanceDeduction(
    params: DeductionParams,
): Promise<{ markup: MarkupResolution | null }> {
    const {
        db,
        isBilledUsage,
        totalPrice,
        userId,
        apiKeyId,
        apiKeyPollenBalance,
        byopClientKeyId,
        modelResolved,
    } = params;

    if (!isBilledUsage || !totalPrice) return { markup: null };

    const resolved = await resolveDevMarkup(
        db,
        byopClientKeyId,
        totalPrice,
        userId,
    );
    const markup: MarkupResolution | null = resolved;
    const billedPrice = totalPrice + (markup?.devCredit ?? 0);
    let payerBucket: Bucket | null = null;

    try {
        if (userId) {
            payerBucket = await deductUserBalance(
                db,
                userId,
                billedPrice,
                modelResolved,
            );
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
            const { ok } = await atomicCreditUserBalance(
                db,
                markup.devUserId,
                creditBucket,
                markup.devCredit,
            );
            if (!ok) {
                throw new Error(
                    `Dev credit UPDATE affected 0 rows for ${markup.devUserId}`,
                );
            }
            log.debug(
                "Credited {credit} pollen to dev {devUserId} {bucket} balance (markup={pct}%)",
                {
                    credit: markup.devCredit,
                    devUserId: markup.devUserId,
                    bucket: creditBucket,
                    pct: (markup.markupPct * 100).toFixed(0),
                },
            );
        }
    } catch (error) {
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

    return { markup };
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
): Promise<Bucket | null> {
    try {
        const isPaidOnly = modelResolved
            ? (getModelDefinition(modelResolved as ModelName).paidOnly ?? false)
            : false;

        if (isPaidOnly) {
            const { ok } = await atomicDeductPaidBalance(db, userId, amount);
            if (!ok) {
                throw new Error(
                    `Paid-only user balance deduction affected 0 rows for ${userId}`,
                );
            }
            log.debug(
                "Decremented {price} pollen from user {userId} (paid-only model, tier excluded)",
                { price: amount, userId },
            );
            return "pack";
        }

        const { ok, bucket } = await atomicDeductUserBalance(
            db,
            userId,
            amount,
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
        return bucket;
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

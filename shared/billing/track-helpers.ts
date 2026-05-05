import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import type { ModelName } from "../registry/registry.ts";
import { getModelDefinition } from "../registry/registry.ts";
import {
    atomicAdjustUserBalance,
    atomicCreditUserBalance,
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
    type UserBalance,
} from "./deduction.ts";
import { BYOP_MARKUP_PCT, computeDevCredit } from "./markup.ts";

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
    userBalanceBeforeDeduction?: UserBalance;
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
        markupPct: BYOP_MARKUP_PCT,
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
        userBalanceBeforeDeduction,
    } = params;

    if (!isBilledUsage || !totalPrice) return { markup: null };

    const resolved = await resolveDevMarkup(
        db,
        byopClientKeyId,
        totalPrice,
        userId,
    );
    let devCredited = false;
    let markup: MarkupResolution | null = resolved;
    if (resolved) {
        try {
            const { ok } = await atomicCreditUserBalance(
                db,
                resolved.devUserId,
                "tier",
                resolved.devCredit,
            );
            if (!ok) {
                log.error(
                    "Dev credit UPDATE affected 0 rows for {devUserId} — skipping markup",
                    { devUserId: resolved.devUserId },
                );
                markup = null;
            } else {
                devCredited = true;
            }
        } catch (error) {
            log.error(
                "Dev credit failed for {devUserId}: {error} — skipping markup",
                {
                    devUserId: resolved.devUserId,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            markup = null;
        }
    }

    const billedPrice = totalPrice + (markup?.devCredit ?? 0);

    try {
        // API key budgets are decremented by the amount the user authorized the
        // app to spend, including BYOP markup when it applies.
        if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
            await deductApiKeyBalance(db, apiKeyId, billedPrice);
        }

        if (userId) {
            await deductUserBalance(
                db,
                userId,
                billedPrice,
                modelResolved,
                userBalanceBeforeDeduction,
            );
        }
    } catch (error) {
        if (devCredited && resolved) {
            try {
                await atomicAdjustUserBalance(
                    db,
                    resolved.devUserId,
                    "tier",
                    -resolved.devCredit,
                );
                log.warn(
                    "Reverted dev credit for {devUserId} after payer debit failure",
                    { devUserId: resolved.devUserId },
                );
            } catch (revertError) {
                log.error(
                    "Failed to revert dev credit for {devUserId}: {error}",
                    {
                        devUserId: resolved.devUserId,
                        error:
                            revertError instanceof Error
                                ? revertError.message
                                : String(revertError),
                    },
                );
            }
        }
        throw error;
    }

    if (markup) {
        log.debug(
            "Credited {credit} pollen to dev {devUserId} (markup={pct}%)",
            {
                credit: markup.devCredit,
                devUserId: markup.devUserId,
                pct: (markup.markupPct * 100).toFixed(0),
            },
        );
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
    userBalanceBeforeDeduction?: UserBalance,
): Promise<void> {
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
            return;
        }

        // Regular deduction flow
        // Note: TOCTOU — balances may shift between this read and the UPDATE in
        // atomicDeductUserBalance due to concurrent requests.  The SQL CASE always
        // picks the correct bucket; only the logged split below may mismatch.
        const balancesBefore =
            userBalanceBeforeDeduction ?? (await getUserBalances(db, userId));
        const deductionSource = identifyDeductionSource(balancesBefore, amount);

        const { ok } = await atomicDeductUserBalance(db, userId, amount);
        if (!ok) {
            throw new Error(
                `User balance deduction affected 0 rows for ${userId}`,
            );
        }

        log.debug(
            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, pack: -{fromPack})",
            {
                price: amount,
                userId,
                ...deductionSource,
            },
        );
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

import { getLogger } from "@logtape/logtape";
import type { ModelName } from "@shared/registry/registry.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { BYOP_MARKUP_PCT, computeDevCredit } from "@/billing-config.ts";
import { apikey as apikeyTable } from "@/db/schema/better-auth.ts";
import {
    atomicAdjustUserBalance,
    atomicCreditUserBalance,
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
} from "./balance-deduction.ts";

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
    apiKeyClientId?: string;
    modelResolved?: string;
}

/**
 * Resolves the dev user id from a BYOP sk_ token's clientId (= pk_ row id).
 * Returns null if the clientId is missing, invalid, or the pk_ row can't be found.
 */
export async function resolveDevMarkup(
    db: DrizzleD1Database,
    apiKeyClientId: string | undefined,
    baselinePrice: number,
): Promise<MarkupResolution | null> {
    if (!apiKeyClientId) return null;
    const credit = computeDevCredit(baselinePrice);
    if (credit <= 0) return null;

    const [clientRow] = await db
        .select({ userId: apikeyTable.userId })
        .from(apikeyTable)
        .where(eq(apikeyTable.id, apiKeyClientId))
        .limit(1);

    if (!clientRow?.userId) return null;

    return {
        devUserId: clientRow.userId,
        devCredit: credit,
        markupPct: BYOP_MARKUP_PCT,
    };
}

/**
 * Handles balance deduction and BYOP dev credit for billable requests.
 *
 * Non-BYOP: deduct baseline from payer + api key budget.
 * BYOP (apiKeyClientId present): deduct billed (baseline × 1+markup) from payer
 * and api key budget; credit markup to dev's dev_balance.
 *
 * Returns the applied markup (if any) so the caller can record it on the
 * generation event. On any billing failure this throws after best-effort
 * compensation so the event is not emitted with a misleading dev credit.
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
        apiKeyClientId,
        modelResolved,
    } = params;

    if (!isBilledUsage || !totalPrice) return { markup: null };

    const resolved = await resolveDevMarkup(db, apiKeyClientId, totalPrice);
    let devCredited = false;
    let markup: MarkupResolution | null = resolved;
    if (resolved) {
        try {
            const { ok } = await atomicCreditUserBalance(
                db,
                resolved.devUserId,
                "dev",
                resolved.devCredit,
            );
            if (!ok) {
                log.error(
                    "Dev credit UPDATE affected 0 rows for {devUserId} — dev row missing, skipping markup",
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
                    error: error instanceof Error ? error.message : error,
                },
            );
            markup = null;
        }
    }

    const billedPrice = totalPrice + (markup?.devCredit ?? 0);

    try {
        // Handle API key budget deduction — docks the full billed amount since
        // the user authorized the app to spend up to this budget, markup
        // included.
        if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
            await deductApiKeyBalance(db, apiKeyId, billedPrice);
        }

        // Handle user balance deduction (full billed amount).
        if (userId) {
            await deductUserBalance(db, userId, billedPrice, modelResolved);
        }
    } catch (error) {
        if (devCredited && resolved) {
            try {
                await atomicAdjustUserBalance(
                    db,
                    resolved.devUserId,
                    "dev",
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
    const { ok } = await atomicDeductApiKeyBalance(
        db,
        apikeyTable,
        apiKeyId,
        amount,
    );
    if (!ok) {
        const error = new Error(
            `API key budget deduction affected 0 rows for ${apiKeyId}`,
        );
        log.error("Failed to decrement API key budget for {keyId}: {error}", {
            keyId: apiKeyId,
            error: error.message,
        });
        throw error;
    }
    log.debug("Decremented {price} pollen from API key {keyId} budget", {
        price: amount,
        keyId: apiKeyId,
    });
}

async function deductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    modelResolved?: string,
): Promise<void> {
    const isPaidOnly = modelResolved
        ? (getModelDefinition(modelResolved as ModelName).paidOnly ?? false)
        : false;

    if (isPaidOnly) {
        const { ok } = await atomicDeductPaidBalance(db, userId, amount);
        if (!ok) {
            const error = new Error(
                `Paid-only user balance deduction affected 0 rows for ${userId}`,
            );
            log.error(
                "Failed to decrement user balance for {userId}: {error}",
                {
                    userId,
                    error: error.message,
                },
            );
            throw error;
        }
        log.debug(
            "Decremented {price} pollen from user {userId} (paid-only model, tier excluded)",
            { price: amount, userId },
        );
        return;
    }

    // Regular deduction flow
    // Note: TOCTOU — balances may shift between this read and the UPDATE in
    // atomicDeductUserBalance due to concurrent requests. The SQL CASE always
    // picks the correct bucket; only the logged split below may mismatch.
    const balancesBefore = await getUserBalances(db, userId);
    const deductionSource = identifyDeductionSource(balancesBefore, amount);
    const { ok } = await atomicDeductUserBalance(db, userId, amount);
    if (!ok) {
        const error = new Error(
            `User balance deduction affected 0 rows for ${userId}`,
        );
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error.message,
        });
        throw error;
    }

    log.debug(
        "Decremented {price} pollen from user {userId} (tier: -{fromTier}, dev: -{fromDev}, pack: -{fromPack})",
        {
            price: amount,
            userId,
            ...deductionSource,
        },
    );
}

import { getLogger } from "@logtape/logtape";
import type { ModelName } from "@shared/registry/registry.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { BYOP_MARKUP_PCT, computeCreatorCredit } from "@/billing-config.ts";
import { apikey as apikeyTable } from "@/db/schema/better-auth.ts";
import {
    atomicCreditUserBalance,
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
} from "./balance-deduction.ts";

const log = getLogger(["track", "helpers"]);

export type MarkupResolution = {
    creatorUserId: string;
    creatorCredit: number;
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
 * Resolves the creator user id from a BYOP sk_ token's clientId (= pk_ row id).
 * Returns null if the clientId is missing, invalid, or the pk_ row can't be found.
 */
export async function resolveCreatorMarkup(
    db: DrizzleD1Database,
    apiKeyClientId: string | undefined,
    baselinePrice: number,
): Promise<MarkupResolution | null> {
    if (!apiKeyClientId) return null;
    const credit = computeCreatorCredit(baselinePrice);
    if (credit <= 0) return null;

    const [clientRow] = await db
        .select({ userId: apikeyTable.userId })
        .from(apikeyTable)
        .where(eq(apikeyTable.id, apiKeyClientId))
        .limit(1);

    if (!clientRow?.userId) return null;

    return {
        creatorUserId: clientRow.userId,
        creatorCredit: credit,
        markupPct: BYOP_MARKUP_PCT,
    };
}

/**
 * Handles balance deduction and BYOP creator credit for billable requests.
 *
 * Non-BYOP: deduct baseline from payer + api key budget.
 * BYOP (apiKeyClientId present): deduct billed (baseline × 1+markup) from payer
 * and api key budget; credit markup to creator's creator_balance.
 *
 * Returns the applied markup (if any) so the caller can record it on the
 * generation event. On credit failure the returned markup is null — the event
 * must reflect what the ledger actually did, not what we attempted.
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

    const resolved = await resolveCreatorMarkup(db, apiKeyClientId, totalPrice);

    // Credit the creator first. If this fails we abort the markup entirely:
    // the payer is still docked the baseline, but creator_credit on the event
    // will be 0 so Tinybird matches the ledger.
    let markup: MarkupResolution | null = resolved;
    if (resolved) {
        try {
            const { ok } = await atomicCreditUserBalance(
                db,
                resolved.creatorUserId,
                "creator",
                resolved.creatorCredit,
            );
            if (!ok) {
                log.error(
                    "Creator credit UPDATE affected 0 rows for {creatorUserId} — creator row missing, skipping markup",
                    { creatorUserId: resolved.creatorUserId },
                );
                markup = null;
            }
        } catch (error) {
            log.error(
                "Creator credit failed for {creatorUserId}: {error} — skipping markup",
                {
                    creatorUserId: resolved.creatorUserId,
                    error: error instanceof Error ? error.message : error,
                },
            );
            markup = null;
        }
    }

    const billedPrice = totalPrice + (markup?.creatorCredit ?? 0);

    // Handle API key budget deduction — docks the full billed amount since the
    // user authorized the app to spend up to this budget, markup included.
    if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
        await deductApiKeyBalance(db, apiKeyId, billedPrice);
    }

    // Handle user balance deduction (full billed amount).
    if (userId) {
        await deductUserBalance(db, userId, billedPrice, modelResolved);
    }

    if (markup) {
        log.debug(
            "Credited {credit} pollen to creator {creatorUserId} (markup={pct}%)",
            {
                credit: markup.creatorCredit,
                creatorUserId: markup.creatorUserId,
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
        await atomicDeductApiKeyBalance(db, apikeyTable, apiKeyId, amount);
        log.debug("Decremented {price} pollen from API key {keyId} budget", {
            price: amount,
            keyId: apiKeyId,
        });
    } catch (error) {
        log.error("Failed to decrement API key budget for {keyId}: {error}", {
            keyId: apiKeyId,
            error: error instanceof Error ? error.message : error,
        });
    }
}

async function deductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    modelResolved?: string,
): Promise<void> {
    try {
        const isPaidOnly = modelResolved
            ? (getModelDefinition(modelResolved as ModelName).paidOnly ?? false)
            : false;

        if (isPaidOnly) {
            await atomicDeductPaidBalance(db, userId, amount);
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
        const balancesBefore = await getUserBalances(db, userId);
        const deductionSource = identifyDeductionSource(balancesBefore, amount);

        await atomicDeductUserBalance(db, userId, amount);

        log.debug(
            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, creator: -{fromCreator}, crypto: -{fromCrypto}, pack: -{fromPack})",
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
    }
}

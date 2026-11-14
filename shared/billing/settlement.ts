// Failed-settlement bookkeeping for post-response billing.
//
// Gen and MCP charge the wallet after the response has been produced. When that
// write fails, the caller has already received the generation, so the charge
// cannot fail the request: it has to be recorded and retried on its own.
//
// The retry is keyed by request id and claims its row before moving money, so a
// replayed or concurrent retry settles a charge at most once. The claim is the
// idempotency guard, not the ledger write itself: `handleBalanceDeduction`
// throws only before the payer debit commits (every post-debit step is already
// best-effort inside it), which is why a claimed row can be replayed safely.

import { getLogger, type Logger } from "@logtape/logtape";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { billingSettlement } from "../db/billing-settlement.ts";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
} from "../events.ts";
import type { Bucket } from "./deduction.ts";
import {
    type CommunityModelRewardInput,
    handleBalanceDeduction,
} from "./track-helpers.ts";

const log = getLogger(["billing", "settlement"]);

export type FailedSettlement = {
    requestId: string;
    userId: string;
    apiKeyId?: string;
    isBilledUsage: boolean;
    totalPrice: number;
    apiKeyPollenBalance?: number | null;
    byopClientKeyId?: string | null;
    modelPaidOnly?: boolean;
    questPollenOnly?: boolean;
    communityModelReward?: CommunityModelRewardInput | null;
    requestPath?: string;
    environment?: string;
};

export type SettlementResult =
    | { outcome: "settled"; billedPrice: number; payerBucket: Bucket | null }
    | { outcome: "failed"; error: Error }
    | { outcome: "skipped" };

/**
 * Records a charge that never reached the ledger. The request id is the
 * primary key, so a duplicate report for the same generation is a no-op.
 *
 * Returns true when this call created the row. A false return means the charge
 * was already recorded (and possibly already retried).
 */
export async function recordFailedSettlement(
    db: DrizzleD1Database,
    settlement: FailedSettlement,
): Promise<boolean> {
    const now = new Date();
    const inserted = await db
        .insert(billingSettlement)
        .values({
            requestId: settlement.requestId,
            userId: settlement.userId,
            apiKeyId: settlement.apiKeyId ?? null,
            isBilledUsage: settlement.isBilledUsage,
            totalPrice: settlement.totalPrice,
            apiKeyPollenBalance: settlement.apiKeyPollenBalance ?? null,
            byopClientKeyId: settlement.byopClientKeyId ?? null,
            modelPaidOnly: settlement.modelPaidOnly ?? false,
            questPollenOnly: settlement.questPollenOnly ?? false,
            communityModelReward: settlement.communityModelReward
                ? JSON.stringify(settlement.communityModelReward)
                : null,
            requestPath: settlement.requestPath ?? null,
            environment: settlement.environment ?? null,
            status: "pending",
            attempts: 0,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ requestId: billingSettlement.requestId });

    return inserted.length > 0;
}

/**
 * Settles one recorded charge at most once.
 *
 * The conditional claim is the whole safety story: only one caller can move a
 * row out of `pending`/`failed`, and a row already `settling` or `settled` is
 * skipped. If the debit fails again the row becomes `failed` and may be tried
 * later; if the process dies mid-flight the row stays `settling` and is never
 * retried automatically, because that is the one state where the money may
 * already have moved.
 */
export async function settleFailedCharge(
    db: DrizzleD1Database,
    requestId: string,
): Promise<SettlementResult> {
    const now = new Date();
    const claimed = await db
        .update(billingSettlement)
        .set({
            status: "settling",
            attempts: sql`${billingSettlement.attempts} + 1`,
            updatedAt: now,
        })
        .where(
            and(
                eq(billingSettlement.requestId, requestId),
                inArray(billingSettlement.status, ["pending", "failed"]),
            ),
        )
        .returning();

    const row = claimed[0];
    if (!row) return { outcome: "skipped" };

    let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>>;
    try {
        deduction = await handleBalanceDeduction({
            db: db as unknown as Parameters<
                typeof handleBalanceDeduction
            >[0]["db"],
            isBilledUsage: row.isBilledUsage,
            totalPrice: row.totalPrice,
            userId: row.userId,
            apiKeyId: row.apiKeyId ?? undefined,
            apiKeyPollenBalance: row.apiKeyPollenBalance,
            // A failed first attempt released the key reservation before it
            // rethrew, so the retry starts from zero and charges the final
            // amount instead of refunding the reservation a second time.
            apiKeyReservedAmount: 0,
            byopClientKeyId: row.byopClientKeyId,
            modelPaidOnly: row.modelPaidOnly,
            questPollenOnly: row.questPollenOnly,
            communityModelReward: parseCommunityModelReward(
                row.communityModelReward,
            ),
        });
    } catch (error) {
        return await markSettlementFailed(db, requestId, error);
    }

    // Deliberately outside the try: the debit has committed by now, so a
    // failure to write `settled` must not turn the row into a retryable
    // `failed`. It stays `settling` and is counted as stale instead.
    const settledAt = new Date();
    await db
        .update(billingSettlement)
        .set({
            status: "settled",
            billedPrice: deduction.billedPrice,
            payerBucket: deduction.payerBucket,
            lastError: null,
            settledAt,
            updatedAt: settledAt,
        })
        .where(
            and(
                eq(billingSettlement.requestId, requestId),
                eq(billingSettlement.status, "settling"),
            ),
        );

    return {
        outcome: "settled",
        billedPrice: deduction.billedPrice,
        payerBucket: deduction.payerBucket,
    };
}

async function markSettlementFailed(
    db: DrizzleD1Database,
    requestId: string,
    error: unknown,
): Promise<SettlementResult> {
    const message = error instanceof Error ? error.message : String(error);
    log.error(
        "Retrying failed settlement for request {requestId} failed: {error}",
        { requestId, error: message },
    );
    await db
        .update(billingSettlement)
        .set({ status: "failed", lastError: message, updatedAt: new Date() })
        .where(
            and(
                eq(billingSettlement.requestId, requestId),
                eq(billingSettlement.status, "settling"),
            ),
        );
    return {
        outcome: "failed",
        error: error instanceof Error ? error : new Error(message),
    };
}

/**
 * Drains recorded charges oldest first. Callers pick the cadence; this is the
 * worker's scheduled handler today, and can also be run by hand when a backlog
 * built up during an outage.
 */
export async function settleFailedCharges(
    db: DrizzleD1Database,
    {
        limit = 20,
        olderThanMs = 0,
        now = new Date(),
    }: { limit?: number; olderThanMs?: number; now?: Date } = {},
): Promise<{ settled: number; failed: number; skipped: number }> {
    const rows = await db
        .select({ requestId: billingSettlement.requestId })
        .from(billingSettlement)
        .where(
            and(
                inArray(billingSettlement.status, ["pending", "failed"]),
                lte(
                    billingSettlement.createdAt,
                    new Date(now.getTime() - olderThanMs),
                ),
            ),
        )
        .orderBy(asc(billingSettlement.createdAt))
        .limit(limit);

    const counts = { settled: 0, failed: 0, skipped: 0 };
    for (const { requestId } of rows) {
        try {
            const result = await settleFailedCharge(db, requestId);
            counts[result.outcome] += 1;
        } catch (error) {
            // A broken row must not stop the sweep; the claim it left behind
            // is counted as stale on the next run instead.
            log.error(
                "Settlement sweep could not process request {requestId}: {error}",
                {
                    requestId,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
        }
    }
    return counts;
}

/**
 * Charges left in `settling` past the cutoff: a worker claimed them and never
 * wrote a result, so it is unknown whether the ledger moved. They are counted
 * instead of retried, so the gap stays visible without risking a double charge.
 */
export async function countStaleSettlements(
    db: DrizzleD1Database,
    { olderThanMs = 10 * 60 * 1000, now = new Date() } = {},
): Promise<number> {
    const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(billingSettlement)
        .where(
            and(
                eq(billingSettlement.status, "settling"),
                lt(
                    billingSettlement.updatedAt,
                    new Date(now.getTime() - olderThanMs),
                ),
            ),
        );
    return row?.count ?? 0;
}

/**
 * Records a missed charge and emits the counting event. Both halves are
 * independent on purpose: the error event is external, so it still lands when
 * D1 itself is the reason the record cannot be written.
 */
export async function reportSettlementFailure(
    db: DrizzleD1Database,
    settlement: FailedSettlement,
    report: {
        environment?: string;
        routePath?: string;
        method?: string;
        status: number;
        durationMs?: number;
        error: unknown;
        userId?: string;
        apiKeyId?: string;
        modelRequested?: string;
        resolvedModelRequested?: string;
    },
    tinybird: { ingestUrl: string; token: string; log: Logger },
): Promise<void> {
    const message =
        report.error instanceof Error
            ? report.error.message
            : String(report.error);

    try {
        const created = await recordFailedSettlement(db, settlement);
        if (!created) {
            log.warn(
                "Failed settlement for request {requestId} was already recorded",
                { requestId: settlement.requestId },
            );
        }
    } catch (recordError) {
        log.error(
            "Could not record failed settlement for request {requestId}: {error}",
            {
                requestId: settlement.requestId,
                error:
                    recordError instanceof Error
                        ? recordError.message
                        : String(recordError),
            },
        );
    }

    await sendErrorEventToTinybird(
        {
            timestamp: new Date().toISOString(),
            kind: "billing_settlement_failed",
            severity: "error",
            request_id: settlement.requestId,
            environment: report.environment,
            route_path: report.routePath,
            method: report.method,
            status: report.status,
            duration_ms: report.durationMs,
            error_code: "BILLING_SETTLEMENT_FAILED",
            error_class:
                report.error instanceof Error ? report.error.name : "Error",
            message,
            model_requested: report.modelRequested,
            resolved_model_requested: report.resolvedModelRequested,
            user_id: report.userId,
            api_key_id: report.apiKeyId,
        },
        getTinybirdDatasourceIngestUrl(tinybird.ingestUrl, "error_event"),
        tinybird.token,
        tinybird.log,
    );
}

function parseCommunityModelReward(
    value: string | null,
): CommunityModelRewardInput | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<CommunityModelRewardInput>;
        if (
            typeof parsed.userId !== "string" ||
            typeof parsed.rewardRate !== "number"
        ) {
            return null;
        }
        return {
            userId: parsed.userId,
            rewardRate: parsed.rewardRate,
            basePrice:
                typeof parsed.basePrice === "number"
                    ? parsed.basePrice
                    : undefined,
        };
    } catch {
        return null;
    }
}

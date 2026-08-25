import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
    serviceAuthorization,
    serviceBillingEvent,
} from "../db/service-billing.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "../schemas/generation-event.ts";
import type {
    ServiceAuthorizeInput,
    ServiceBillableEvent,
    ServiceCancelResult,
    ServiceDenial,
    ServiceSettleError,
    ServiceSettleInput,
} from "../schemas/service-billing.ts";
import { getUserBalance, payerBucketToMeter } from "./balance.ts";
import {
    type BalanceBucket as Bucket,
    selectWalletBucket,
} from "./bucket-selection.ts";
import { withByopMarkup } from "./markup.ts";
import { POLLEN_BILLING_PRECISION } from "./precision.ts";
import {
    resolveCommunityModelReward,
    resolveDevMarkup,
} from "./track-helpers.ts";

/**
 * Service-billing engine: the authorize/settle/cancel state machine behind
 * Enter's ServiceGateway RPC entrypoint, also used in-process by gen (which
 * shares the same D1 database).
 *
 * Money model: authorize picks the one wallet bucket the request pays from
 * and debits the estimate from it (and from a finite key budget) right away —
 * the reserve. Settlement keeps a running total of billed prices on the
 * authorization; the first settle call reconciles the reserve against that
 * total (lower refunds the difference, higher charges it), and later calls
 * charge only what they add. Wallet and key therefore always move by the
 * same amounts, and a request settled as one event, split across calls, or
 * delivered out of order ends in the same place.
 *
 * Every money movement is a single D1 batch — one atomic transaction — with
 * each statement guarded on the ledger state only this batch can create, so
 * a retry after a crash re-runs cleanly and a retry after commit moves no
 * money at all.
 */

/**
 * How long an authorization stays settleable (and its reserve held) before
 * the expiry sweep releases it. 48 hours: services may emit their
 * settlements once a day, and the durable media coordinator's 300-second
 * request lifetime fits with room to spare. After this, settlement is
 * rejected and nothing is charged.
 */
export const SERVICE_AUTHORIZATION_TTL_SECONDS = 48 * 60 * 60;

const P = POLLEN_BILLING_PRECISION;

/** Identity snapshot the authorizing caller has already authenticated. */
export type ServiceAuthorizationIdentity = {
    userId: string;
    userTier: string | null;
    apiKeyId: string;
    apiKeyName: string | null;
    apiKeyType: string | null;
    byopClientKeyId: string | null;
    byopMarkupApplies: boolean;
    /** Finite key budget, or null/undefined when the key is unlimited. */
    apiKeyPollenBalance: number | null | undefined;
};

export type CreateServiceAuthorizationResult =
    | { ok: true; authorizationId: string }
    | { ok: false; denial: ServiceDenial };

export type SettledEventOutcome = {
    eventId: string;
    billedPrice: number;
    payerBucket: Bucket;
    postDeductionPackBalance: number | null;
    /** The derived analytics row for this settlement: one best-effort write, never retried. */
    tinybirdEvent: TinybirdEvent;
};

/** The committed ledger row of one settled event, read back after the batch. */
type SettledLedgerRow = Pick<
    typeof serviceBillingEvent.$inferSelect,
    | "eventId"
    | "billedPrice"
    | "markupRate"
    | "communityRewardUserId"
    | "communityRewardCredit"
    | "communityRewardRate"
>;

export type SettleServiceBillingResult =
    | {
          ok: true;
          userId: string;
          settled: string[];
          duplicates: string[];
          outcomes: SettledEventOutcome[];
      }
    | { ok: false; error: ServiceSettleError };

type AuthorizationRow = typeof serviceAuthorization.$inferSelect;

// Drizzle's `timestamp` mode stores epoch seconds; raw SQL must match it.
function toDbTime(date: Date): number {
    return Math.floor(date.getTime() / 1000);
}

function isUniqueConstraintError(error: unknown): boolean {
    return (
        error instanceof Error &&
        /UNIQUE constraint failed/i.test(
            `${error.message} ${(error.cause as Error | undefined)?.message ?? ""}`,
        )
    );
}

function bucketColumn(bucket: Bucket): "tier_balance" | "pack_balance" {
    return bucket === "tier" ? "tier_balance" : "pack_balance";
}

/**
 * Create an authorization for one service request: pick its wallet bucket
 * and reserve the estimate from that bucket and from a finite key budget.
 * The authorization row and both debits are one atomic batch, and the row
 * only lands while the bucket and the budget cover the estimate at that
 * moment — concurrent requests against one exact balance admit only the
 * funded ones. A unique-index conflict (retried request) aborts the batch
 * before any debit, so retries can never stack reserves.
 */
export async function createServiceAuthorization(
    d1: D1Database,
    identity: ServiceAuthorizationIdentity,
    input: Omit<ServiceAuthorizeInput, "token" | "model">,
): Promise<CreateServiceAuthorizationResult> {
    const estimatedCost = withByopMarkup(
        Math.max(0, input.estimatedPrice),
        identity.byopMarkupApplies,
    );
    const isPaidOnly = input.paidOnly ?? false;

    const hasBudget = typeof identity.apiKeyPollenBalance === "number";
    const now = new Date();
    if (hasBudget) {
        // Release this key's expired reserves before reserving again, so an
        // abandoned request can never cause a false budget denial.
        await expireServiceAuthorizations(d1, now, 20, identity.apiKeyId);
    }

    const balances = await getUserBalance(drizzle(d1), identity.userId);
    const bucket = selectWalletBucket(balances, estimatedCost, isPaidOnly);
    if (!bucket) {
        return {
            ok: false,
            denial: {
                status: 402,
                message: `Insufficient balance. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
            },
        };
    }
    const column = bucketColumn(bucket);

    const authorizationId = crypto.randomUUID();
    // Paid-only stays strict (must hold paid balance); otherwise coverage.
    const funded = [
        `EXISTS (SELECT 1 FROM user WHERE id = ?5
                 AND COALESCE(${column}, 0) ${isPaidOnly ? ">" : ">="} ?13)`,
        ...(hasBudget
            ? [
                  `EXISTS (SELECT 1 FROM apikey WHERE id = ?7
                           AND pollen_balance IS NOT NULL AND pollen_balance >= ?13)`,
              ]
            : []),
    ].join(" AND ");
    const reserved = `EXISTS (SELECT 1 FROM service_authorization WHERE id = ?3)`;
    const statements = [
        d1
            .prepare(
                `INSERT INTO service_authorization (
                    id, service, request_id, request_path,
                    user_id, user_tier, api_key_id, api_key_name, api_key_type,
                    byop_client_key_id, paid_only, api_key_has_budget,
                    reserved_price, charged_price, settled_price, payer_bucket,
                    created_at, expires_at
                )
                SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                    ?13, ?13, 0, ?16, ?14, ?15
                WHERE ${funded}`,
            )
            .bind(
                authorizationId,
                input.service,
                input.requestId,
                input.requestPath,
                identity.userId,
                identity.userTier,
                identity.apiKeyId,
                identity.apiKeyName,
                identity.apiKeyType,
                identity.byopClientKeyId,
                isPaidOnly ? 1 : 0,
                hasBudget ? 1 : 0,
                estimatedCost,
                toDbTime(now),
                toDbTime(now) + SERVICE_AUTHORIZATION_TTL_SECONDS,
                bucket,
            ),
        d1
            .prepare(
                `UPDATE user SET ${column} = ROUND(COALESCE(${column}, 0) - ?2, ${P})
                 WHERE id = ?1 AND ${reserved}`,
            )
            .bind(identity.userId, estimatedCost, authorizationId),
    ];
    if (hasBudget) {
        statements.push(
            d1
                .prepare(
                    `UPDATE apikey SET pollen_balance = ROUND(pollen_balance - ?2, ${P})
                     WHERE id = ?1 AND pollen_balance IS NOT NULL AND ${reserved}`,
                )
                .bind(identity.apiKeyId, estimatedCost, authorizationId),
        );
    }

    try {
        const results = await d1.batch(statements);
        if ((results[0].meta.changes ?? 0) === 0) {
            const keyTooLow =
                hasBudget &&
                (identity.apiKeyPollenBalance as number) < estimatedCost;
            return {
                ok: false,
                denial: {
                    status: 402,
                    message: keyTooLow
                        ? `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen.`
                        : `Insufficient balance. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
                },
            };
        }
    } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // A retried authorize for the same (service, requestId) hands back
        // the existing authorization — but only for the identical request.
        // A different payer, key, path, estimate or paid-only rule under a
        // reused request id is a conflict: an authorization never binds
        // anyone but the credential that created it.
        const existing = await drizzle(d1)
            .select()
            .from(serviceAuthorization)
            .where(
                and(
                    eq(serviceAuthorization.service, input.service),
                    eq(serviceAuthorization.requestId, input.requestId),
                ),
            )
            .get();
        if (!existing) throw error;
        const identical =
            existing.userId === identity.userId &&
            existing.apiKeyId === identity.apiKeyId &&
            existing.requestPath === input.requestPath &&
            existing.paidOnly === isPaidOnly &&
            Math.abs(existing.reservedPrice - estimatedCost) < 1e-9;
        if (!identical) {
            return {
                ok: false,
                denial: {
                    status: 409,
                    message: `Request ${input.requestId} was already authorized for a different request.`,
                },
            };
        }
        return { ok: true, authorizationId: existing.id };
    }

    return { ok: true, authorizationId };
}

/** The financial payload of an event; reusing an id with a different one is a conflict. */
function eventFingerprint(event: ServiceBillableEvent): string {
    return JSON.stringify({
        eventType: event.eventType,
        price: Math.max(0, event.price),
        modelUsed: event.modelUsed ?? null,
        communityReward: event.communityReward
            ? {
                  ownerUserId: event.communityReward.ownerUserId,
                  rewardRate: event.communityReward.rewardRate,
                  basePrice: event.communityReward.basePrice ?? null,
              }
            : null,
    });
}

function closedReason(
    authorization: AuthorizationRow,
    now: Date,
): Extract<ServiceSettleError, `authorization_${string}`> | null {
    if (authorization.canceledAt) return "authorization_canceled";
    if (
        authorization.expiredAt ||
        authorization.expiresAt.getTime() <= now.getTime()
    ) {
        return "authorization_expired";
    }
    return null;
}

/**
 * Settle billable events against an authorization. All events of one call
 * form a single atomic D1 batch. Per event, in delivery order, the batch
 * claims the idempotency row and moves money against the authorization's
 * running total:
 *
 *   - a finite key budget caps the event's charge at what is still covered
 *     by the reserve plus the key's live budget — charges can never exceed
 *     the key's authorization, and a key deleted after authorize settles
 *     within its reserve (the wallet is charged identically, so wallet and
 *     key never disagree),
 *   - the part of the charge the reserve does not cover is debited from the
 *     request's wallet bucket and from the key,
 *   - BYOP markup and community rewards are credited into the payer's
 *     bucket, suppressed when that bucket went negative or the charge was
 *     capped (paying credits out of a shortfall would mint pollen).
 *
 * Then, on the first settle call only, the unused reserve is refunded to the
 * wallet and the key — so a leading zero-price event can neither consume
 * nor refund the reserve before the charged event in the same call.
 *
 * The claim only lands while the authorization is open (not canceled, not
 * expired — checked again inside the batch, so a sweep racing a settlement
 * still yields one outcome), and every later statement is guarded on the
 * event row being 'claimed', which only this batch's own insert can make
 * true: a redelivered settlement is a pure no-op and a mid-batch failure
 * rolls every claim back with the money.
 */
export async function settleServiceBillingEvents(
    d1: D1Database,
    input: ServiceSettleInput,
    options: { environment: string },
): Promise<SettleServiceBillingResult> {
    const db = drizzle(d1);
    const authorization = await db
        .select()
        .from(serviceAuthorization)
        .where(eq(serviceAuthorization.id, input.authorizationId))
        .get();
    if (!authorization) {
        return { ok: false, error: "unknown_authorization" };
    }
    const aid = authorization.id;
    const now = new Date();

    const closed = closedReason(authorization, now);
    if (closed) {
        if (closed === "authorization_expired") {
            // Late settlement of an expired authorization: nothing is
            // charged, and the reserve (if the sweep hasn't yet) goes back.
            await d1.batch(
                releaseStatements(d1, authorization, "expired", now),
            );
        }
        return { ok: false, error: closed };
    }

    // Events already on the ledger: same fingerprint → duplicate (skipped),
    // different fingerprint → conflict (nothing in this call settles).
    const existing = new Map(
        (
            await db
                .select({
                    eventId: serviceBillingEvent.eventId,
                    fingerprint: serviceBillingEvent.fingerprint,
                })
                .from(serviceBillingEvent)
                .where(eq(serviceBillingEvent.authorizationId, aid))
        ).map((row) => [row.eventId, row.fingerprint]),
    );
    const duplicates: string[] = [];
    const pending: ServiceBillableEvent[] = [];
    // Within one call, a repeated event id is one semantic event only if
    // its financial payload is identical; otherwise the whole call is a
    // conflict.
    const seen = new Map<string, string>();
    for (const event of input.events) {
        const fingerprint = eventFingerprint(event);
        const earlier = seen.get(event.eventId);
        if (earlier !== undefined) {
            if (earlier !== fingerprint) {
                return { ok: false, error: "event_conflict" };
            }
            continue;
        }
        seen.set(event.eventId, fingerprint);
        const known = existing.get(event.eventId);
        if (known === undefined) {
            pending.push(event);
        } else if (known === eventFingerprint(event)) {
            duplicates.push(event.eventId);
        } else {
            return { ok: false, error: "event_conflict" };
        }
    }

    const payerBucket = authorization.payerBucket as Bucket;
    const column = bucketColumn(payerBucket);
    const statements: D1PreparedStatement[] = [];
    const plan: { event: ServiceBillableEvent; claimIndex: number }[] = [];

    const claimedGuard = `EXISTS (
        SELECT 1 FROM service_billing_event
        WHERE authorization_id = ?1 AND event_id = ?2 AND status = 'claimed')`;
    const eventField = (field: string, guarded: boolean) =>
        `(SELECT ${field} FROM service_billing_event
          WHERE authorization_id = ?1 AND event_id = ?2${
              guarded ? " AND status = 'claimed'" : ""
})`;
    // What this event adds beyond what the wallet already holds.
    const overage = `ROUND(MAX(0, (
        SELECT settled_price + ${eventField("billed_price", false)} - charged_price
        FROM service_authorization WHERE id = ?1)), ${P})`;

    for (const event of pending) {
        const eid = event.eventId;
        const price = Math.max(0, event.price);
        // The caller already bears the upstream cost of their own community
        // endpoint: don't charge them through Pollinations or pay them back
        // a partial reward (mirrors handleBalanceDeduction).
        const isSelfReward =
            event.communityReward?.ownerUserId === authorization.userId;
        const billable = price > 0 && !isSelfReward;

        const markup = billable
            ? await resolveDevMarkup(
                  db,
                  authorization.byopClientKeyId,
                  price,
                  authorization.userId,
              )
            : null;
        const community = billable
            ? resolveCommunityModelReward(
                  event.communityReward
                      ? {
                            userId: event.communityReward.ownerUserId,
                            rewardRate: event.communityReward.rewardRate,
                            basePrice: event.communityReward.basePrice,
                        }
                      : null,
                  price,
                  authorization.userId,
              )
            : null;
        const billed = billable ? price + (markup?.devCredit ?? 0) : 0;

        // 1. Claim the idempotency row — only while the authorization is
        // still open. Zero changes means an earlier settlement owns this
        // event or the authorization closed underneath us; every later
        // statement is then inert.
        plan.push({ event, claimIndex: statements.length });
        statements.push(
            d1
                .prepare(
                    `INSERT INTO service_billing_event (
                        authorization_id, event_id, event_type, status, fingerprint,
                        price, billed_price, model_used,
                        dev_user_id, dev_credit, markup_rate,
                        community_reward_user_id, community_reward_credit,
                        community_reward_rate, created_at
                    )
                    SELECT ?1, ?2, ?3, 'claimed', ?14, ?4, ROUND(?5, ${P}), ?6,
                        ?7, ?8, ?9, ?10, ?11, ?12, ?13
                    WHERE EXISTS (
                        SELECT 1 FROM service_authorization
                        WHERE id = ?1 AND canceled_at IS NULL
                          AND expired_at IS NULL AND expires_at > ?13)
                    ON CONFLICT (authorization_id, event_id) DO NOTHING`,
                )
                .bind(
                    aid,
                    eid,
                    event.eventType,
                    price,
                    billed,
                    event.modelUsed ?? null,
                    markup?.devUserId ?? null,
                    markup?.devCredit ?? 0,
                    markup?.markupRate ?? 0,
                    community?.userId ?? null,
                    community?.credit ?? 0,
                    community?.rewardRate ?? 0,
                    toDbTime(now),
                    eventFingerprint(event),
                ),
        );

        if (billed > 0 && authorization.apiKeyHasBudget) {
            // 2. Cap the charge at what the key authorized: the reserve
            // still covering this request plus the key's live budget. A
            // deleted key covers nothing beyond the reserve; a budget lifted
            // to NULL since authorize covers everything. When the cap binds
            // we collected less than the full price, so the credits it
            // would have funded are dropped with it.
            const headroom = `CASE
                WHEN NOT EXISTS (SELECT 1 FROM apikey WHERE id = ?3) THEN 0
                WHEN (SELECT pollen_balance FROM apikey WHERE id = ?3) IS NULL
                    THEN billed_price
                ELSE MAX(0, (SELECT pollen_balance FROM apikey WHERE id = ?3))
            END`;
            const cap = `ROUND((SELECT charged_price - settled_price
                                FROM service_authorization WHERE id = ?1)
                               + ${headroom}, ${P})`;
            statements.push(
                d1
                    .prepare(
                        `UPDATE service_billing_event
                         SET dev_user_id = NULL, dev_credit = 0, markup_rate = 0,
                             community_reward_user_id = NULL,
                             community_reward_credit = 0, community_reward_rate = 0
                         WHERE authorization_id = ?1 AND event_id = ?2
                           AND status = 'claimed' AND billed_price > ${cap}`,
                    )
                    .bind(aid, eid, authorization.apiKeyId),
                d1
                    .prepare(
                        `UPDATE service_billing_event
                         SET billed_price = MIN(billed_price, ${cap})
                         WHERE authorization_id = ?1 AND event_id = ?2
                           AND status = 'claimed'`,
                    )
                    .bind(aid, eid, authorization.apiKeyId),
            );
        }

        if (billed > 0) {
            // 3. Debit the payer's wallet bucket for what the reserve does
            // not already cover.
            statements.push(
                d1
                    .prepare(
                        `UPDATE user
                         SET ${column} = ROUND(COALESCE(${column}, 0) - ${overage}, ${P})
                         WHERE id = ?3 AND ${claimedGuard}`,
                    )
                    .bind(aid, eid, authorization.userId),
            );
            // 4. Suppress credits when the payer's bucket went negative:
            // there is nothing real to fund them from.
            if (markup || community) {
                statements.push(
                    d1
                        .prepare(
                            `UPDATE service_billing_event
                             SET dev_user_id = NULL, dev_credit = 0, markup_rate = 0,
                                 community_reward_user_id = NULL,
                                 community_reward_credit = 0,
                                 community_reward_rate = 0
                             WHERE authorization_id = ?1 AND event_id = ?2
                               AND status = 'claimed'
                               AND (SELECT COALESCE(${column}, 0) FROM user
                                    WHERE id = ?3) < 0`,
                        )
                        .bind(aid, eid, authorization.userId),
                );
            }
            // 5./6. Credit dev markup and community reward into the bucket
            // the payer drew from. A zeroed (suppressed/capped) credit or a
            // settled row makes the WHERE false — nothing moves.
            const creditStatement = (field: string, targetUserId: string) =>
                d1
                    .prepare(
                        `UPDATE user
                         SET ${column} = ROUND(COALESCE(${column}, 0)
                             + ${eventField(field, false)}, ${P})
                         WHERE id = ?3 AND ${eventField(field, true)} > 0`,
                    )
                    .bind(aid, eid, targetUserId);
            if (markup) {
                statements.push(
                    creditStatement("dev_credit", markup.devUserId),
                );
            }
            if (community) {
                statements.push(
                    creditStatement(
                        "community_reward_credit",
                        community.userId,
                    ),
                );
            }
            // 7. Move the key budget by exactly what the wallet moved.
            if (authorization.apiKeyHasBudget) {
                statements.push(
                    d1
                        .prepare(
                            `UPDATE apikey
                             SET pollen_balance = ROUND(pollen_balance - ${overage}, ${P})
                             WHERE id = ?3 AND pollen_balance IS NOT NULL
                               AND ${claimedGuard}`,
                        )
                        .bind(aid, eid, authorization.apiKeyId),
                );
            }
        }

        // 8./9. Add the event to the running total and flip it to 'settled'
        // — from here on, every guard above is permanently false.
        statements.push(
            d1
                .prepare(
                    `UPDATE service_authorization
                     SET settled_price = ROUND(settled_price
                             + ${eventField("billed_price", false)}, ${P}),
                         charged_price = ROUND(MAX(charged_price, settled_price
                             + ${eventField("billed_price", false)}), ${P})
                     WHERE id = ?1 AND ${claimedGuard}`,
                )
                .bind(aid, eid),
            d1
                .prepare(
                    `UPDATE service_billing_event SET status = 'settled'
                     WHERE authorization_id = ?1 AND event_id = ?2
                       AND status = 'claimed'`,
                )
                .bind(aid, eid),
        );
    }

    if (!authorization.settledAt) {
        // 10. First settlement: reconcile the reserve against the total —
        // whatever the wallet still holds beyond it goes back to the wallet
        // and the key. Later calls start from a reconciled authorization
        // and charge only what they add.
        const unreconciled = `EXISTS (
            SELECT 1 FROM service_authorization
            WHERE id = ?1 AND settled_at IS NULL AND canceled_at IS NULL
              AND expired_at IS NULL AND expires_at > ?3)`;
        const refund = `(SELECT ROUND(charged_price - settled_price, ${P})
                         FROM service_authorization WHERE id = ?1)`;
        statements.push(
            d1
                .prepare(
                    `UPDATE user
                     SET ${column} = ROUND(COALESCE(${column}, 0) + ${refund}, ${P})
                     WHERE id = ?2 AND ${unreconciled}`,
                )
                .bind(aid, authorization.userId, toDbTime(now)),
        );
        if (authorization.apiKeyHasBudget) {
            statements.push(
                d1
                    .prepare(
                        `UPDATE apikey
                         SET pollen_balance = ROUND(pollen_balance + ${refund}, ${P})
                         WHERE id = ?2 AND pollen_balance IS NOT NULL
                           AND ${unreconciled}`,
                    )
                    .bind(aid, authorization.apiKeyId, toDbTime(now)),
            );
        }
        statements.push(
            d1
                .prepare(
                    `UPDATE service_authorization
                     SET charged_price = settled_price, settled_at = ?2
                     WHERE id = ?1 AND settled_at IS NULL AND canceled_at IS NULL
                       AND expired_at IS NULL AND expires_at > ?2`,
                )
                .bind(aid, toDbTime(now)),
        );
    }

    const settled: string[] = [];
    const outcomes: SettledEventOutcome[] = [];
    const results = statements.length > 0 ? await d1.batch(statements) : [];
    for (const { event, claimIndex } of plan) {
        if ((results[claimIndex].meta.changes ?? 0) === 0) {
            // Lost to a concurrent settlement of the same event, or the
            // authorization closed under us (then no event claimed).
            const claimed = await db
                .select({ fingerprint: serviceBillingEvent.fingerprint })
                .from(serviceBillingEvent)
                .where(
                    and(
                        eq(serviceBillingEvent.authorizationId, aid),
                        eq(serviceBillingEvent.eventId, event.eventId),
                    ),
                )
                .get();
            if (!claimed) {
                const current = await db
                    .select()
                    .from(serviceAuthorization)
                    .where(eq(serviceAuthorization.id, aid))
                    .get();
                return {
                    ok: false,
                    error:
                        (current && closedReason(current, now)) ??
                        "authorization_canceled",
                };
            }
            if (claimed.fingerprint !== eventFingerprint(event)) {
                return { ok: false, error: "event_conflict" };
            }
            duplicates.push(event.eventId);
            continue;
        }
        settled.push(event.eventId);
    }

    if (settled.length > 0) {
        // Report what the batch committed — after the cap, the credit
        // suppression and the reserve reconciliation — not what was planned
        // before it ran.
        const ledger = new Map(
            (
                await db
                    .select({
                        eventId: serviceBillingEvent.eventId,
                        billedPrice: serviceBillingEvent.billedPrice,
                        markupRate: serviceBillingEvent.markupRate,
                        communityRewardUserId:
                            serviceBillingEvent.communityRewardUserId,
                        communityRewardCredit:
                            serviceBillingEvent.communityRewardCredit,
                        communityRewardRate:
                            serviceBillingEvent.communityRewardRate,
                    })
                    .from(serviceBillingEvent)
                    .where(
                        and(
                            eq(serviceBillingEvent.authorizationId, aid),
                            inArray(serviceBillingEvent.eventId, settled),
                        ),
                    )
            ).map((row) => [row.eventId, row]),
        );
        const packBalance =
            payerBucket === "pack"
                ? (await getUserBalance(db, authorization.userId)).packBalance
                : null;
        for (const event of pending) {
            const row = ledger.get(event.eventId);
            if (!row) continue;
            outcomes.push({
                eventId: event.eventId,
                billedPrice: row.billedPrice,
                payerBucket,
                postDeductionPackBalance: packBalance,
                tinybirdEvent: toTinybirdEvent(authorization, event, {
                    environment: options.environment,
                    settledAt: now,
                    ledger: row,
                }),
            });
        }
    }

    return {
        ok: true,
        userId: authorization.userId,
        settled,
        duplicates,
        outcomes,
    };
}

/**
 * Release an unreconciled reserve back to the wallet bucket and the key,
 * then close the authorization with the given reason. The refunds are
 * guarded on the authorization still being open and unsettled, and the
 * close comes last, so within the batch's transaction the money moves
 * exactly once however many cancels, sweeps and late settlements race.
 */
function releaseStatements(
    d1: D1Database,
    authorization: Pick<
        AuthorizationRow,
        "id" | "userId" | "apiKeyId" | "apiKeyHasBudget" | "payerBucket"
    >,
    reason: "canceled" | "expired",
    now: Date,
): D1PreparedStatement[] {
    const column = bucketColumn(authorization.payerBucket as Bucket);
    const unreconciled = `EXISTS (
        SELECT 1 FROM service_authorization
        WHERE id = ?1 AND settled_at IS NULL AND canceled_at IS NULL
          AND expired_at IS NULL)`;
    const held = `(SELECT charged_price FROM service_authorization WHERE id = ?1)`;
    const statements = [
        d1
            .prepare(
                `UPDATE user
                 SET ${column} = ROUND(COALESCE(${column}, 0) + ${held}, ${P})
                 WHERE id = ?2 AND ${unreconciled}`,
            )
            .bind(authorization.id, authorization.userId),
    ];
    if (authorization.apiKeyHasBudget) {
        statements.push(
            d1
                .prepare(
                    `UPDATE apikey
                     SET pollen_balance = ROUND(pollen_balance + ${held}, ${P})
                     WHERE id = ?2 AND pollen_balance IS NOT NULL
                       AND ${unreconciled}`,
                )
                .bind(authorization.id, authorization.apiKeyId),
        );
    }
    statements.push(
        d1
            .prepare(
                `UPDATE service_authorization
                 SET charged_price = 0, ${reason}_at = ?2
                 WHERE id = ?1 AND settled_at IS NULL AND canceled_at IS NULL
                   AND expired_at IS NULL`,
            )
            .bind(authorization.id, toDbTime(now)),
    );
    return statements;
}

/**
 * Abandon an authorization whose work failed: release its reserve.
 * Idempotent; a no-op once settled, canceled, expired, or unknown.
 */
export async function cancelServiceAuthorization(
    d1: D1Database,
    authorizationId: string,
): Promise<ServiceCancelResult> {
    const authorization = await drizzle(d1)
        .select()
        .from(serviceAuthorization)
        .where(eq(serviceAuthorization.id, authorizationId))
        .get();
    if (!authorization) {
        return { ok: true, released: false };
    }
    const results = await d1.batch(
        releaseStatements(d1, authorization, "canceled", new Date()),
    );
    return {
        ok: true,
        released:
            (results[results.length - 1].meta.changes ?? 0) > 0 &&
            authorization.reservedPrice > 0,
    };
}

/**
 * The analytics row for one settled event. Money fields come from the
 * committed ledger row, never from caller telemetry; the caller's telemetry
 * only adds request detail (status, timing, usage, error, fallback...).
 */
function toTinybirdEvent(
    authorization: AuthorizationRow,
    event: ServiceBillableEvent,
    outcome: {
        environment: string;
        settledAt: Date;
        ledger: SettledLedgerRow;
    },
): TinybirdEvent {
    const { ledger } = outcome;
    return {
        // Defaults a service may refine (a service that measured its own
        // work reports its timing), then its telemetry, then everything
        // canonical, which wins: request, identity, event type and money
        // come from the authorization snapshot and the ledger.
        ...priceToEventParams(),
        ...usageToEventParams(),
        totalCost: 0,
        responseStatus: 200,
        startTime: authorization.createdAt,
        endTime: outcome.settledAt,
        responseTime:
            outcome.settledAt.getTime() - authorization.createdAt.getTime(),
        ...event.telemetry,
        id: crypto.randomUUID(),
        requestId: authorization.requestId,
        requestPath: authorization.requestPath,
        environment: outcome.environment,
        eventType: event.eventType,
        userId: authorization.userId,
        userTier: authorization.userTier ?? undefined,
        apiKeyId: authorization.apiKeyId,
        apiKeyName: authorization.apiKeyName ?? undefined,
        apiKeyType:
            (authorization.apiKeyType as TinybirdEvent["apiKeyType"]) ??
            undefined,
        apiKeyClientId: authorization.byopClientKeyId ?? undefined,
        ...(event.modelUsed !== undefined && { modelUsed: event.modelUsed }),
        devPrice: Math.max(0, event.price),
        // A ledger charge is billed usage whatever the producer said; with
        // nothing charged, the producer's own verdict (or silence) stands.
        ...(ledger.billedPrice > 0 && { isBilledUsage: true }),
        ...payerBucketToMeter(authorization.payerBucket as Bucket),
        totalPrice: ledger.billedPrice,
        markupRate: ledger.markupRate,
        communityModelRewardUserId: ledger.communityRewardUserId ?? undefined,
        communityModelRewardRate: ledger.communityRewardRate,
        communityModelRewardAmount: ledger.communityRewardCredit,
    };
}

/**
 * Release reserves whose authorization expired unreconciled — the service
 * died without settling or canceling. Run opportunistically (waitUntil)
 * after gateway calls; Enter runs no crons.
 */
export async function expireServiceAuthorizations(
    d1: D1Database,
    now = new Date(),
    limit = 20,
    apiKeyId?: string,
): Promise<number> {
    const expiredAuthorizations = await drizzle(d1)
        .select()
        .from(serviceAuthorization)
        .where(
            and(
                isNull(serviceAuthorization.settledAt),
                isNull(serviceAuthorization.canceledAt),
                isNull(serviceAuthorization.expiredAt),
                gt(serviceAuthorization.reservedPrice, 0),
                lte(serviceAuthorization.expiresAt, now),
                apiKeyId
                    ? eq(serviceAuthorization.apiKeyId, apiKeyId)
                    : undefined,
            ),
        )
        .limit(limit);
    let expired = 0;
    for (const authorization of expiredAuthorizations) {
        const results = await d1.batch(
            releaseStatements(d1, authorization, "expired", now),
        );
        if ((results[results.length - 1].meta.changes ?? 0) > 0) expired++;
    }
    return expired;
}

/**
 * Delete authorizations, with their events, that expired a full TTL ago.
 * The ledger is an idempotency window, not an archive — Tinybird keeps the
 * history — and at gen's request volume it would otherwise grow without
 * bound. An authorization is only pruned once nothing is outstanding on it
 * (settled, closed, or nothing was reserved), and a late settlement of a
 * pruned authorization is refused as unknown, so nothing is ever charged
 * twice.
 */
export async function pruneServiceAuthorizations(
    d1: D1Database,
    now = new Date(),
    limit = 100,
): Promise<number> {
    const cutoff = toDbTime(
        new Date(now.getTime() - SERVICE_AUTHORIZATION_TTL_SECONDS * 1000),
    );
    const doomed = `SELECT id FROM service_authorization
                    WHERE expires_at <= ?1
                      AND (settled_at IS NOT NULL
                           OR canceled_at IS NOT NULL
                           OR expired_at IS NOT NULL
                           OR reserved_price = 0)
                    LIMIT ?2`;
    const results = await d1.batch([
        d1
            .prepare(
                `DELETE FROM service_billing_event
                 WHERE authorization_id IN (${doomed})`,
            )
            .bind(cutoff, limit),
        d1
            .prepare(
                `DELETE FROM service_authorization WHERE id IN (${doomed})`,
            )
            .bind(cutoff, limit),
    ]);
    return results[1].meta.changes ?? 0;
}

/**
 * Housekeeping every service runs opportunistically after its own billing
 * calls (no service runs crons): release expired reserves, then prune
 * long-expired rows.
 */
export async function sweepServiceBilling(
    d1: D1Database,
    now = new Date(),
): Promise<{ expired: number; pruned: number }> {
    const expired = await expireServiceAuthorizations(d1, now);
    const pruned = await pruneServiceAuthorizations(d1, now);
    return { expired, pruned };
}

import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
    RESERVATION_CANCELED,
    RESERVATION_EXPIRED,
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
    canCoverEstimatedCharge,
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
 * shares the same D1 database). Every money movement is a single D1 batch —
 * one atomic transaction — with each statement guarded on the billing event
 * being in the 'claimed' state, so a retry after a crash re-runs cleanly and
 * a retry after commit moves no money at all.
 */

/**
 * How long an authorization stays settleable (and its reservation held)
 * before the expiry sweep releases it. 48 hours: services may emit their
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
    payerBucket: Bucket | null;
    postDeductionPackBalance: number | null;
    /** The derived analytics row for this settlement: one best-effort write, never retried. */
    tinybirdEvent: TinybirdEvent;
};

/** The committed ledger row of one settled event, read back after the batch. */
type SettledLedgerRow = Pick<
    typeof serviceBillingEvent.$inferSelect,
    | "eventId"
    | "billedPrice"
    | "payerBucket"
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

/**
 * Create an authorization for one service request, reserving the estimate
 * from a finite key budget. Reservation and authorization row are one atomic
 * batch: a unique-index conflict (retried request) rolls the reservation back
 * with the insert, so retries can never stack reservations.
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
        // Release this key's expired reservations before reserving again, so
        // an abandoned request can never cause a false budget denial.
        await expireServiceAuthorizations(d1, now, 20, identity.apiKeyId);
    }

    const balances = await getUserBalance(drizzle(d1), identity.userId);
    if (!canCoverEstimatedCharge(balances, estimatedCost, isPaidOnly)) {
        return {
            ok: false,
            denial: {
                status: 402,
                message: `Insufficient balance. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
            },
        };
    }

    const reserve = hasBudget ? estimatedCost : 0;
    const authorizationId = crypto.randomUUID();
    const insertSql = `
        INSERT INTO service_authorization (
            id, service, request_id, request_path,
            user_id, user_tier, api_key_id, api_key_name, api_key_type,
            byop_client_key_id, paid_only, api_key_has_budget,
            estimated_price, reserved_price, reservation_holder,
            created_at, expires_at
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?16, ?13, NULL, ?14, ?15`;
    const insertParams = [
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
        reserve,
        toDbTime(now),
        toDbTime(now) + SERVICE_AUTHORIZATION_TTL_SECONDS,
        estimatedCost,
    ];

    try {
        if (reserve > 0) {
            // Concurrent authorizations race on this atomic conditional
            // UPDATE, so the sum of live reservations never exceeds the
            // key's budget. The insert only lands when the reservation did
            // (`changes() > 0`); a conflict aborts the whole batch, undoing
            // the reservation with it.
            const results = await d1.batch([
                d1
                    .prepare(
                        `UPDATE apikey
                         SET pollen_balance = ROUND(pollen_balance - ?1, ${P})
                         WHERE id = ?2 AND pollen_balance IS NOT NULL
                           AND pollen_balance >= ?1`,
                    )
                    .bind(reserve, identity.apiKeyId),
                d1
                    .prepare(`${insertSql} WHERE changes() > 0`)
                    .bind(...insertParams),
            ]);
            if ((results[1].meta.changes ?? 0) === 0) {
                return {
                    ok: false,
                    denial: {
                        status: 402,
                        message: `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
                    },
                };
            }
        } else {
            await d1
                .prepare(insertSql)
                .bind(...insertParams)
                .run();
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
            Math.abs(existing.estimatedPrice - estimatedCost) < 1e-9;
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

// Reservation amount this event owns: its full reserved price if it claimed
// the reservation, zero otherwise. ?A = authorization id, ?E = event id.
function reservedExpr(aidParam: string, eidParam: string): string {
    return `(SELECT CASE WHEN reservation_holder = ${eidParam} THEN reserved_price ELSE 0 END
             FROM service_authorization WHERE id = ${aidParam})`;
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

type AuthorizationRow = typeof serviceAuthorization.$inferSelect;

function closedReason(
    authorization: AuthorizationRow,
    now: Date,
): Extract<ServiceSettleError, `authorization_${string}`> | null {
    if (
        authorization.canceledAt ||
        authorization.reservationHolder === RESERVATION_CANCELED
    ) {
        return "authorization_canceled";
    }
    if (
        authorization.reservationHolder === RESERVATION_EXPIRED ||
        authorization.expiresAt.getTime() <= now.getTime()
    ) {
        return "authorization_expired";
    }
    return null;
}

/**
 * Settle billable events against an authorization. All events of one call
 * form a single atomic D1 batch. Per event, the batch claims the idempotency
 * row and moves all money:
 *
 *   - the payer's wallet bucket is picked by the same paid-only/tier/pack
 *     ladder as `atomicDeductUserBalance` and debited,
 *   - a finite key budget is reconciled against the reservation the event
 *     claimed, with the total charge capped at reservation + live budget —
 *     charges can never exceed the key's authorization, and a key deleted
 *     after authorize settles within its reservation (the wallet debit is
 *     capped identically, so wallet and key never disagree),
 *   - BYOP markup and community rewards are credited from the payer's
 *     bucket, suppressed when that bucket went negative or the charge was
 *     capped (paying credits out of a shortfall would mint pollen).
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
            // charged, and the reservation (if the sweep hasn't yet) goes
            // back to the key.
            await d1.batch(
                releaseStatements(d1, authorization, RESERVATION_EXPIRED, null),
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

    const statements: D1PreparedStatement[] = [];
    const plan: {
        event: ServiceBillableEvent;
        claimIndex: number;
        walletIndex: number;
    }[] = [];

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

        const claimedGuard = `EXISTS (
            SELECT 1 FROM service_billing_event
            WHERE authorization_id = ?1 AND event_id = ?2 AND status = 'claimed')`;

        // 1. Claim the idempotency row — only while the authorization is
        // still open. Zero changes means an earlier settlement owns this
        // event or the authorization closed underneath us; every later
        // statement is then inert.
        plan.push({
            event,
            claimIndex: statements.length,
            walletIndex: -1,
        });
        statements.push(
            d1
                .prepare(
                    `INSERT INTO service_billing_event (
                        authorization_id, event_id, event_type, status, fingerprint,
                        price, billed_price, payer_bucket, model_used,
                        dev_user_id, dev_credit, markup_rate,
                        community_reward_user_id, community_reward_credit,
                        community_reward_rate, created_at
                    )
                    SELECT ?1, ?2, ?3, 'claimed', ?15, ?4, ROUND(?5, ${P}), NULL, ?6,
                        ?7, ?8, ?9, ?10, ?11, ?12, ?13
                    WHERE EXISTS (
                        SELECT 1 FROM service_authorization
                        WHERE id = ?1 AND canceled_at IS NULL AND expires_at > ?14
                          AND (reservation_holder IS NULL
                               OR reservation_holder NOT IN (?16, ?17)))
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
                    toDbTime(now),
                    eventFingerprint(event),
                    RESERVATION_CANCELED,
                    RESERVATION_EXPIRED,
                ),
        );

        // 2. Claim the outstanding reservation for this event
        // (compare-and-set on NULL: exactly one claimer ever wins).
        if (authorization.apiKeyHasBudget && authorization.reservedPrice > 0) {
            statements.push(
                d1
                    .prepare(
                        `UPDATE service_authorization SET reservation_holder = ?2
                         WHERE id = ?1 AND reservation_holder IS NULL
                           AND ${claimedGuard}`,
                    )
                    .bind(aid, eid),
            );
        }
        const resv = reservedExpr("?1", "?2");
        // What the key's live budget can still cover beyond the reservation.
        // A deleted key covers nothing (it settles within its reservation);
        // a budget lifted to NULL since authorize covers everything.
        const headroom = `CASE
            WHEN NOT EXISTS (SELECT 1 FROM apikey WHERE id = ?3) THEN 0
            WHEN (SELECT pollen_balance FROM apikey WHERE id = ?3) IS NULL
                THEN billed_price
            ELSE MAX(0, (SELECT pollen_balance FROM apikey WHERE id = ?3))
        END`;
        const cap = `ROUND(${resv} + ${headroom}, ${P})`;

        if (billed > 0 && authorization.apiKeyHasBudget) {
            // 3a/3b. Cap the charge at what the key authorized. When the cap
            // binds we collected less than the full price, so the credits it
            // would have funded are dropped with it.
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

        const eventField = (field: string, guarded: boolean) =>
            `(SELECT ${field} FROM service_billing_event
              WHERE authorization_id = ?1 AND event_id = ?2${
                  guarded ? " AND status = 'claimed'" : ""
})`;

        if (billed > 0) {
            // 4. Pick the payer bucket with the atomicDeductUserBalance
            // ladder: paid-only → pack; tier when it covers; pack when
            // positive; else tier (Quest-Pollen debt, never deeper pack debt).
            statements.push(
                d1
                    .prepare(
                        `UPDATE service_billing_event
                         SET payer_bucket = (
                             SELECT CASE
                                 WHEN ?3 = 1 THEN 'pack'
                                 WHEN COALESCE(u.tier_balance, 0) >=
                                     service_billing_event.billed_price THEN 'tier'
                                 WHEN COALESCE(u.pack_balance, 0) > 0 THEN 'pack'
                                 ELSE 'tier'
                             END FROM user u WHERE u.id = ?4)
                         WHERE authorization_id = ?1 AND event_id = ?2
                           AND status = 'claimed' AND billed_price > 0`,
                    )
                    .bind(
                        aid,
                        eid,
                        authorization.paidOnly ? 1 : 0,
                        authorization.userId,
                    ),
            );
            // 5. Debit the payer's wallet.
            plan[plan.length - 1].walletIndex = statements.length;
            statements.push(
                d1
                    .prepare(
                        `UPDATE user
                         SET tier_balance = CASE
                                 WHEN ${eventField("payer_bucket", true)} = 'tier'
                                 THEN ROUND(COALESCE(tier_balance, 0)
                                     - ${eventField("billed_price", false)}, ${P})
                                 ELSE tier_balance END,
                             pack_balance = CASE
                                 WHEN ${eventField("payer_bucket", true)} = 'pack'
                                 THEN ROUND(COALESCE(pack_balance, 0)
                                     - ${eventField("billed_price", false)}, ${P})
                                 ELSE pack_balance END
                         WHERE id = ?3
                         RETURNING pack_balance AS packBalance,
                             ${eventField("payer_bucket", false)} AS payerBucket,
                             ${eventField("billed_price", false)} AS billedPrice,
                             ${eventField("markup_rate", false)} AS markupRate`,
                    )
                    .bind(aid, eid, authorization.userId),
            );
            // 6. Suppress credits when the payer's bucket went negative:
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
                               AND status = 'claimed' AND payer_bucket IS NOT NULL
                               AND (SELECT CASE
                                       WHEN service_billing_event.payer_bucket = 'tier'
                                       THEN COALESCE(u.tier_balance, 0)
                                       ELSE COALESCE(u.pack_balance, 0) END
                                    FROM user u WHERE u.id = ?3) < 0`,
                        )
                        .bind(aid, eid, authorization.userId),
                );
            }
            // 7./8. Credit dev markup and community reward into the bucket
            // the payer drew from. A zeroed (suppressed/capped) credit or a
            // settled row makes the WHERE false — nothing moves.
            const creditStatement = (field: string, targetUserId: string) =>
                d1
                    .prepare(
                        `UPDATE user
                         SET tier_balance = CASE
                                 WHEN ${eventField("payer_bucket", true)} = 'tier'
                                 THEN ROUND(COALESCE(tier_balance, 0)
                                     + ${eventField(field, false)}, ${P})
                                 ELSE tier_balance END,
                             pack_balance = CASE
                                 WHEN ${eventField("payer_bucket", true)} = 'pack'
                                 THEN ROUND(COALESCE(pack_balance, 0)
                                     + ${eventField(field, false)}, ${P})
                                 ELSE pack_balance END
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
        }

        // 9. Reconcile the key budget with the final charge: debit the part
        // above the claimed reservation, or release the unused part back.
        if (authorization.apiKeyHasBudget) {
            const delta = `ROUND(${eventField("billed_price", false)} - ${resv}, ${P})`;
            statements.push(
                d1
                    .prepare(
                        `UPDATE apikey
                         SET pollen_balance = CASE
                             WHEN ${delta} >= 0
                             THEN MAX(0, ROUND(pollen_balance - ${delta}, ${P}))
                             ELSE ROUND(pollen_balance - ${delta}, ${P})
                         END
                         WHERE id = ?3 AND pollen_balance IS NOT NULL
                           AND ${claimedGuard}`,
                    )
                    .bind(aid, eid, authorization.apiKeyId),
            );
        }

        // 10./11. Stamp the authorization and flip the event to 'settled' —
        // from here on, every guard above is permanently false.
        statements.push(
            d1
                .prepare(
                    `UPDATE service_authorization
                     SET settled_at = COALESCE(settled_at, ?3)
                     WHERE id = ?1 AND ${claimedGuard}`,
                )
                .bind(aid, eid, toDbTime(now)),
            d1
                .prepare(
                    `UPDATE service_billing_event SET status = 'settled'
                     WHERE authorization_id = ?1 AND event_id = ?2
                       AND status = 'claimed'`,
                )
                .bind(aid, eid),
        );
    }

    const settled: string[] = [];
    const outcomes: SettledEventOutcome[] = [];
    if (statements.length > 0) {
        const results = await d1.batch(statements);
        const settledEvents: {
            event: ServiceBillableEvent;
            packBalance: number | null;
        }[] = [];
        for (const { event, claimIndex, walletIndex } of plan) {
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
            const wallet =
                walletIndex >= 0
                    ? (results[walletIndex].results[0] as
                          | { packBalance: number | null }
                          | undefined)
                    : undefined;
            settledEvents.push({
                event,
                packBalance: wallet?.packBalance ?? null,
            });
        }

        // Report what the batch committed — after the cap and the credit
        // suppression — not what was planned before it ran.
        const ledger = new Map(
            (
                await db
                    .select({
                        eventId: serviceBillingEvent.eventId,
                        billedPrice: serviceBillingEvent.billedPrice,
                        payerBucket: serviceBillingEvent.payerBucket,
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
        for (const { event, packBalance } of settledEvents) {
            const row = ledger.get(event.eventId);
            if (!row) {
                throw new Error(
                    `Settled event ${event.eventId} is missing from the ledger`,
                );
            }
            const payerBucket = (row.payerBucket as Bucket | null) ?? null;
            outcomes.push({
                eventId: event.eventId,
                billedPrice: row.billedPrice,
                payerBucket,
                postDeductionPackBalance:
                    payerBucket === "pack" ? packBalance : null,
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

// Release an unclaimed reservation with a sentinel holder. `changes() > 0`
// makes claim-and-release one atomic pair: the refund only happens in the
// batch where this call's own compare-and-set won.
function releaseStatements(
    d1: D1Database,
    authorization: {
        id: string;
        apiKeyId: string;
        reservedPrice: number;
        apiKeyHasBudget: boolean;
    },
    sentinel: string,
    canceledAt: Date | null,
): D1PreparedStatement[] {
    const statements = [
        d1
            .prepare(
                `UPDATE service_authorization
                 SET reservation_holder = ?2,
                     canceled_at = COALESCE(?3, canceled_at)
                 WHERE id = ?1 AND reservation_holder IS NULL
                   AND settled_at IS NULL`,
            )
            .bind(
                authorization.id,
                sentinel,
                canceledAt ? toDbTime(canceledAt) : null,
            ),
    ];
    if (authorization.apiKeyHasBudget && authorization.reservedPrice > 0) {
        statements.push(
            d1
                .prepare(
                    `UPDATE apikey
                     SET pollen_balance = ROUND(pollen_balance + ?2, ${P})
                     WHERE id = ?1 AND pollen_balance IS NOT NULL
                       AND changes() > 0`,
                )
                .bind(authorization.apiKeyId, authorization.reservedPrice),
        );
    }
    return statements;
}

/**
 * Abandon an authorization whose work failed: release its reservation.
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
        releaseStatements(d1, authorization, RESERVATION_CANCELED, new Date()),
    );
    return {
        ok: true,
        released:
            (results[0].meta.changes ?? 0) > 0 &&
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
    const payerBucket = (ledger.payerBucket as Bucket | null) ?? null;
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
        isBilledUsage: ledger.billedPrice > 0,
        ...(payerBucket ? payerBucketToMeter(payerBucket) : {}),
        totalPrice: ledger.billedPrice,
        markupRate: ledger.markupRate,
        communityModelRewardUserId: ledger.communityRewardUserId ?? undefined,
        communityModelRewardRate: ledger.communityRewardRate,
        communityModelRewardAmount: ledger.communityRewardCredit,
    };
}

/**
 * Release reservations whose authorization expired unclaimed — the service
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
                isNull(serviceAuthorization.reservationHolder),
                isNull(serviceAuthorization.settledAt),
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
            releaseStatements(d1, authorization, RESERVATION_EXPIRED, null),
        );
        if ((results[0].meta.changes ?? 0) > 0) expired++;
    }
    return expired;
}

/**
 * Delete authorizations, with their events, that expired a full TTL ago.
 * The ledger is an idempotency window, not an archive — Tinybird keeps the
 * history — and at gen's request volume it would otherwise grow without
 * bound. An authorization is only pruned once nothing is outstanding on it
 * (settled, or its reservation released), and a late settlement of a pruned
 * authorization is refused as unknown, so nothing is ever charged twice.
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
                           OR reservation_holder IS NOT NULL
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
            .prepare(`DELETE FROM service_authorization WHERE id IN (${doomed})`)
            .bind(cutoff, limit),
    ]);
    return results[1].meta.changes ?? 0;
}

/**
 * Housekeeping every service runs opportunistically after its own billing
 * calls (no service runs crons): release expired reservations, then prune
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

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
 * funded ones.
 *
 * A request id already authorized is resolved before any affordability or
 * reservation work: the identical request gets its open
 * authorization back without another debit (so an exact retry after the
 * original reserved the caller's entire balance still succeeds), a
 * different request under the same id is a conflict, and a canceled or
 * expired authorization is never handed back as usable. The unique index
 * covers the race between two first-time authorizes the same way.
 */
export async function createServiceAuthorization(
    d1: D1Database,
    identity: ServiceAuthorizationIdentity,
    input: Omit<ServiceAuthorizeInput, "token" | "model">,
): Promise<CreateServiceAuthorizationResult> {
    const db = drizzle(d1);
    const estimatedCost = withByopMarkup(
        Math.max(0, input.estimatedPrice),
        identity.byopMarkupApplies,
    );
    const isPaidOnly = input.paidOnly ?? false;
    const now = new Date();

    const resolveExisting = (
        existing: AuthorizationRow,
    ): CreateServiceAuthorizationResult => {
        // An authorization never binds anyone but the credential that
        // created it, for the request it was created for.
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
        const closed = closedReason(existing, now);
        if (closed) {
            return {
                ok: false,
                denial: {
                    status: 409,
                    message: `Request ${input.requestId} was already authorized and is ${closed === "authorization_canceled" ? "canceled" : "expired"}.`,
                },
            };
        }
        return { ok: true, authorizationId: existing.id };
    };

    const findExisting = () =>
        db
            .select()
            .from(serviceAuthorization)
            .where(
                and(
                    eq(serviceAuthorization.service, input.service),
                    eq(serviceAuthorization.requestId, input.requestId),
                ),
            )
            .get();
    // Release this user's expired reserves (on any key) before anything
    // else, so an abandoned request can never cause a false denial and a
    // retry of an expired request releases what it held.
    await expireUserServiceAuthorizations(d1, identity.userId, now);

    const existing = await findExisting();
    if (existing) return resolveExisting(existing);

    const hasBudget = typeof identity.apiKeyPollenBalance === "number";
    const balances = await getUserBalance(db, identity.userId);
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
        // Lost the race to a concurrent first-time authorize of the same
        // request: the batch aborted before any debit.
        const raced = await findExisting();
        if (!raced) throw error;
        return resolveExisting(raced);
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
 * form a single atomic D1 batch, and the call is approved as a whole or not
 * at all. The batch, in order:
 *
 *   1. Tentatively claims every distinct event of the call: one ledger row
 *      per event, owned by this call's random token, with its billed price
 *      already rounded to ledger precision. An event another call has
 *      already landed keeps that call's row (ON CONFLICT DO NOTHING).
 *   2. Takes the authorization's approval gate (its settlement token) —
 *      only while the authorization is open and no other call holds it,
 *      only if every event of the call is now on the ledger with exactly
 *      the expected financial fingerprint (an identical concurrent winner
 *      is a duplicate; a different payload is a conflict), and only if the
 *      cost of the rows this token actually owns — the sum of their stored
 *      billed prices — beyond the reserve the request still holds is
 *      covered by the payer's live non-negative wallet bucket and, for a
 *      finite key, by the key's live budget (a deleted key covers nothing
 *      beyond the reserve; a budget lifted to NULL covers everything).
 *   3. Reads the classification of a failed gate from the same transaction
 *      state the gate saw, so the error code never depends on a balance
 *      read after the fact.
 *   4. Guarded on the gate: debits the owned overage once from the wallet
 *      bucket and the key, credits BYOP markup and community rewards per
 *      owned event, adds the owned cost to the running totals, reconciles
 *      the reserve on the first settlement, and flips the owned rows to
 *      settled.
 *   5. Deletes this token's tentative rows if the gate was not taken, and
 *      releases the gate.
 *
 * So a rejected call commits no ledger row and moves no money (its reserve
 * stays held until the service cancels or it expires), a redelivered call
 * is a pure no-op, concurrent deliveries of one event charge it once, and
 * a call racing an identical delivery of some of its events pays only for
 * the events it won. Atomicity is per call: earlier calls stay committed.
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

    // Within one call, a repeated event id is one semantic event only if
    // its financial payload is identical; otherwise the whole call is a
    // conflict.
    const pending: ServiceBillableEvent[] = [];
    const fingerprints = new Map<string, string>();
    for (const event of input.events) {
        const fingerprint = eventFingerprint(event);
        const earlier = fingerprints.get(event.eventId);
        if (earlier !== undefined) {
            if (earlier !== fingerprint) {
                return { ok: false, error: "event_conflict" };
            }
            continue;
        }
        fingerprints.set(event.eventId, fingerprint);
        pending.push(event);
    }

    const payerBucket = authorization.payerBucket as Bucket;
    const column = bucketColumn(payerBucket);
    const token = crypto.randomUUID();
    const hasBudget = authorization.apiKeyHasBudget;

    const billedFor = async (event: ServiceBillableEvent) => {
        const price = Math.max(0, event.price);
        // The caller already bears the upstream cost of their own community
        // endpoint: don't charge them through Pollinations or pay them back
        // a partial reward.
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
        return { price, markup, community, billed };
    };
    const priced = await Promise.all(
        pending.map(async (event) => ({
            event,
            ...(await billedFor(event)),
        })),
    );

    // SQL fragments. Slots: ?1 authorization id, ?2 this call's token; the
    // rest as each statement documents.
    const open = `canceled_at IS NULL AND expired_at IS NULL AND expires_at > ?5`;
    // Every event of the call is on the ledger with the expected payload.
    const fingerprintsMatch = `NOT EXISTS (
        SELECT 1 FROM json_each(?6) AS expected
        WHERE NOT EXISTS (
            SELECT 1 FROM service_billing_event
            WHERE authorization_id = ?1
              AND event_id = json_extract(expected.value, '$.id')
              AND fingerprint = json_extract(expected.value, '$.fp')))`;
    // Cost of the rows this call owns: the sum of their stored, already
    // rounded billed prices — never a total computed before the batch.
    const owned = `(SELECT ROUND(COALESCE(SUM(billed_price), 0), ${P})
                    FROM service_billing_event
                    WHERE authorization_id = ?1 AND claim_token = ?2)`;
    // What the owned cost adds beyond the reserve the request still holds;
    // `remaining` is evaluated against the authorization row.
    const overageBeyond = (remaining: string) =>
        `ROUND(MAX(0, ${owned} - (${remaining})), ${P})`;
    const gateOverage = overageBeyond("charged_price - settled_price");
    const walletCovers = `ROUND(MAX(0, COALESCE(
        (SELECT ${column} FROM user WHERE id = ?3), 0)), ${P}) >= ${gateOverage}`;
    const keyCovers = hasBudget
        ? `(CASE
            WHEN NOT EXISTS (SELECT 1 FROM apikey WHERE id = ?4) THEN 0
            WHEN (SELECT pollen_balance FROM apikey WHERE id = ?4) IS NULL
                THEN ${owned}
            ELSE ROUND(MAX(0, (SELECT pollen_balance FROM apikey WHERE id = ?4)), ${P})
        END) >= ${gateOverage}`
        : "1";
    const gateBinds = [
        aid,
        token,
        authorization.userId,
        hasBudget ? authorization.apiKeyId : null,
        toDbTime(now),
        JSON.stringify(
            pending.map((event) => ({
                id: event.eventId,
                fp: fingerprints.get(event.eventId),
            })),
        ),
    ];
    // This call holds the authorization's approval gate.
    const gated = `EXISTS (SELECT 1 FROM service_authorization
                   WHERE id = ?1 AND settlement_token = ?2)`;
    const moneyOverage = overageBeyond(
        `SELECT charged_price - settled_price
         FROM service_authorization WHERE id = ?1`,
    );

    const statements: D1PreparedStatement[] = [];
    const claims: { event: ServiceBillableEvent; index: number }[] = [];

    // 1. Tentative claims, before any money or totals.
    for (const { event, price, markup, community, billed } of priced) {
        claims.push({ event, index: statements.length });
        statements.push(
            d1
                .prepare(
                    `INSERT INTO service_billing_event (
                        authorization_id, event_id, event_type, status,
                        claim_token, fingerprint, price, billed_price,
                        model_used, dev_user_id, dev_credit, markup_rate,
                        community_reward_user_id, community_reward_credit,
                        community_reward_rate, created_at
                    )
                    SELECT ?1, ?2, ?3, 'claimed', ?15, ?14, ?4, ROUND(?5, ${P}),
                        ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
                    WHERE EXISTS (
                        SELECT 1 FROM service_authorization
                        WHERE id = ?1 AND canceled_at IS NULL
                          AND expired_at IS NULL AND expires_at > ?13)
                    ON CONFLICT (authorization_id, event_id) DO NOTHING`,
                )
                .bind(
                    aid,
                    event.eventId,
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
                    fingerprints.get(event.eventId) as string,
                    token,
                ),
        );
    }

    // 2. The approval gate.
    const gateIndex = statements.length;
    statements.push(
        d1
            .prepare(
                `UPDATE service_authorization SET settlement_token = ?2
                 WHERE id = ?1 AND settlement_token IS NULL AND ${open}
                   AND ${fingerprintsMatch}
                   AND ${walletCovers} AND ${keyCovers}`,
            )
            .bind(...gateBinds),
    );
    // 3. Why the gate was refused, from the state it was evaluated on.
    const verdictIndex = statements.length;
    statements.push(
        d1
            .prepare(
                `SELECT
                    canceled_at IS NOT NULL AS canceled,
                    (expired_at IS NOT NULL OR expires_at <= ?5) AS expired,
                    ${fingerprintsMatch} AS fingerprints_match,
                    ${walletCovers} AS wallet_covers,
                    ${keyCovers} AS key_covers
                 FROM service_authorization WHERE id = ?1`,
            )
            .bind(...gateBinds),
    );

    // 4. Money and totals, all guarded on the gate.
    if (priced.some(({ billed }) => billed > 0)) {
        statements.push(
            d1
                .prepare(
                    `UPDATE user
                     SET ${column} = ROUND(COALESCE(${column}, 0) - ${moneyOverage}, ${P})
                     WHERE id = ?3 AND ${gated}`,
                )
                .bind(aid, token, authorization.userId),
        );
        if (hasBudget) {
            statements.push(
                d1
                    .prepare(
                        `UPDATE apikey
                         SET pollen_balance = ROUND(pollen_balance - ${moneyOverage}, ${P})
                         WHERE id = ?3 AND pollen_balance IS NOT NULL AND ${gated}`,
                    )
                    .bind(aid, token, authorization.apiKeyId),
            );
        }
        // Credits go into the bucket the payer drew from, per owned event.
        // A row this token does not own (a concurrent identical winner)
        // yields NULL here, so nothing moves for it.
        const ownedField = (field: string) =>
            `(SELECT ${field} FROM service_billing_event
              WHERE authorization_id = ?1 AND event_id = ?3 AND claim_token = ?2)`;
        const credit = (eventId: string, field: string, userId: string) =>
            d1
                .prepare(
                    `UPDATE user
                     SET ${column} = ROUND(COALESCE(${column}, 0) + ${ownedField(field)}, ${P})
                     WHERE id = ?4 AND ${ownedField(field)} > 0 AND ${gated}`,
                )
                .bind(aid, token, eventId, userId);
        for (const { event, markup, community } of priced) {
            if (markup) {
                statements.push(
                    credit(event.eventId, "dev_credit", markup.devUserId),
                );
            }
            if (community) {
                statements.push(
                    credit(
                        event.eventId,
                        "community_reward_credit",
                        community.userId,
                    ),
                );
            }
        }
    }
    statements.push(
        d1
            .prepare(
                `UPDATE service_authorization
                 SET settled_price = ROUND(settled_price + ${owned}, ${P}),
                     charged_price = ROUND(MAX(charged_price, settled_price + ${owned}), ${P})
                 WHERE id = ?1 AND settlement_token = ?2`,
            )
            .bind(aid, token),
    );
    if (!authorization.settledAt) {
        // First settlement: reconcile the reserve against the total —
        // whatever the wallet still holds beyond it goes back to the wallet
        // and the key. Later calls start from a reconciled authorization
        // and charge only what they add.
        const unreconciled = `EXISTS (
            SELECT 1 FROM service_authorization
            WHERE id = ?1 AND settlement_token = ?2 AND settled_at IS NULL)`;
        const refund = `(SELECT ROUND(charged_price - settled_price, ${P})
                         FROM service_authorization WHERE id = ?1)`;
        statements.push(
            d1
                .prepare(
                    `UPDATE user
                     SET ${column} = ROUND(COALESCE(${column}, 0) + ${refund}, ${P})
                     WHERE id = ?3 AND ${unreconciled}`,
                )
                .bind(aid, token, authorization.userId),
        );
        if (hasBudget) {
            statements.push(
                d1
                    .prepare(
                        `UPDATE apikey
                         SET pollen_balance = ROUND(pollen_balance + ${refund}, ${P})
                         WHERE id = ?3 AND pollen_balance IS NOT NULL
                           AND ${unreconciled}`,
                    )
                    .bind(aid, token, authorization.apiKeyId),
            );
        }
        statements.push(
            d1
                .prepare(
                    `UPDATE service_authorization
                     SET charged_price = settled_price, settled_at = ?3
                     WHERE id = ?1 AND settlement_token = ?2 AND settled_at IS NULL`,
                )
                .bind(aid, token, toDbTime(now)),
        );
    }
    statements.push(
        d1
            .prepare(
                `UPDATE service_billing_event
                 SET status = 'settled', claim_token = NULL
                 WHERE authorization_id = ?1 AND claim_token = ?2 AND ${gated}`,
            )
            .bind(aid, token),
        // 5. A refused call leaves no claim behind; the gate is released
        // either way.
        d1
            .prepare(
                `DELETE FROM service_billing_event
                 WHERE authorization_id = ?1 AND claim_token = ?2 AND NOT ${gated}`,
            )
            .bind(aid, token),
        d1
            .prepare(
                `UPDATE service_authorization SET settlement_token = NULL
                 WHERE id = ?1 AND settlement_token = ?2`,
            )
            .bind(aid, token),
    );

    const results = await d1.batch(statements);
    if ((results[gateIndex].meta.changes ?? 0) === 0) {
        const verdict = results[verdictIndex].results[0] as
            | {
                  canceled: number;
                  expired: number;
                  fingerprints_match: number;
                  wallet_covers: number;
                  key_covers: number;
              }
            | undefined;
        if (!verdict) return { ok: false, error: "unknown_authorization" };
        if (verdict.canceled)
            return { ok: false, error: "authorization_canceled" };
        if (verdict.expired)
            return { ok: false, error: "authorization_expired" };
        if (!verdict.fingerprints_match) {
            return { ok: false, error: "event_conflict" };
        }
        if (!verdict.wallet_covers) {
            return { ok: false, error: "insufficient_balance" };
        }
        if (!verdict.key_covers)
            return { ok: false, error: "insufficient_budget" };
        throw new Error(
            `Settlement gate of authorization ${aid} refused an approvable call`,
        );
    }

    const settled: string[] = [];
    const duplicates: string[] = [];
    for (const { event, index } of claims) {
        // A claim that did not land was an identical delivery another call
        // already settled (the gate verified its fingerprint).
        if ((results[index].meta.changes ?? 0) === 0) {
            duplicates.push(event.eventId);
        } else {
            settled.push(event.eventId);
        }
    }

    const outcomes: SettledEventOutcome[] = [];
    if (settled.length > 0) {
        // Report what the batch committed, after the reserve reconciliation,
        // not what was planned before it ran.
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
 * after gateway calls; Enter runs no crons. Returns the number released.
 */
export async function expireServiceAuthorizations(
    d1: D1Database,
    now = new Date(),
    limit = 20,
    userId?: string,
): Promise<number> {
    return (await expireBatch(d1, now, limit, userId)).released;
}

async function expireBatch(
    d1: D1Database,
    now: Date,
    limit: number,
    userId?: string,
): Promise<{ selected: number; released: number }> {
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
                userId ? eq(serviceAuthorization.userId, userId) : undefined,
            ),
        )
        .limit(limit);
    let released = 0;
    for (const authorization of expiredAuthorizations) {
        const results = await d1.batch(
            releaseStatements(d1, authorization, "expired", now),
        );
        if ((results[results.length - 1].meta.changes ?? 0) > 0) released++;
    }
    return { selected: expiredAuthorizations.length, released };
}

/**
 * Release every expired reserve of one user before a new authorization
 * checks their affordability. Batched, but continued until this user's
 * expired rows are exhausted: a bound that left some held would falsely
 * deny the very request that triggered the sweep.
 */
async function expireUserServiceAuthorizations(
    d1: D1Database,
    userId: string,
    now: Date,
): Promise<void> {
    const limit = 20;
    let selected = limit;
    while (selected === limit) {
        selected = (await expireBatch(d1, now, limit, userId)).selected;
    }
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

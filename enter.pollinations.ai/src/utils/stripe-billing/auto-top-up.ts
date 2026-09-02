import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
    AUTO_TOP_UP_THRESHOLD_POLLEN,
} from "@shared/billing/auto-top-up.ts";
import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import {
    calculateServiceFeeCents,
    getPollenPackByAmount,
    POLLEN_PACK_LINE_TYPE,
    type PollenPack,
    SERVICE_FEE_LINE_TYPE,
    SERVICE_FEE_NAME,
    SERVICE_FEE_TAX_CODE,
} from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe.ts";
import { isBillingDetailsComplete } from "./billing-details.ts";
import { getBillingOverview } from "./billing-overview.ts";
import {
    AUTO_TOP_UP_ATTEMPT_STATUS,
    AUTO_TOP_UP_CLAIM_TTL_MS,
    AUTO_TOP_UP_PENDING_TTL_MS,
    AUTO_TOP_UP_PURPOSE,
    METADATA_PURPOSE,
    METADATA_USER_ID,
} from "./constants.ts";
import {
    getDefaultPaymentMethod,
    getOrCreateStripeCustomerId,
    getUserStripeBillingRow,
    retrieveActiveCustomer,
} from "./customer.ts";
import { verifyAutoTopUpInvoicePayment } from "./invoice-verification.ts";
import type {
    AutoTopUpAttemptRow,
    AutoTopUpInput,
    AutoTopUpProcessResult,
    BillingOverview,
    PendingAutoTopUpAttempt,
    UserStripeBillingRow,
} from "./types.ts";

type AutoTopUpEligibilityInput = Pick<
    UserStripeBillingRow,
    "autoTopUpEnabled" | "packBalance" | "autoTopUpAmountUsd"
>;

type AutoTopUpEligibility =
    | { eligible: false; reason: "auto top-up disabled" }
    | { eligible: false; reason: "paid balance above threshold" }
    | { eligible: false; reason: "auto top-up pack invalid" }
    | { eligible: true; pack: PollenPack };

function getAutoTopUpEligibility(
    user: AutoTopUpEligibilityInput,
): AutoTopUpEligibility {
    if (!user.autoTopUpEnabled) {
        return { eligible: false, reason: "auto top-up disabled" };
    }

    if ((user.packBalance ?? 0) > AUTO_TOP_UP_THRESHOLD_POLLEN) {
        return { eligible: false, reason: "paid balance above threshold" };
    }

    const pack = getPollenPackByAmount(user.autoTopUpAmountUsd);
    return pack
        ? { eligible: true, pack }
        : { eligible: false, reason: "auto top-up pack invalid" };
}

export async function updateAutoTopUpSettings(
    env: CloudflareBindings,
    userId: string,
    input: AutoTopUpInput,
): Promise<
    | { ok: true; overview: BillingOverview }
    | { ok: false; status: 400 | 403; error: string }
> {
    if (!input.enabled) {
        await env.DB.prepare(
            `UPDATE user
                SET auto_top_up_enabled = 0
                WHERE id = ?`,
        )
            .bind(userId)
            .run();

        return { ok: true, overview: await getBillingOverview(env, userId) };
    }

    const user = await getUserStripeBillingRow(env.DB, userId);
    if (user.stripePaymentRestriction) {
        return {
            ok: false,
            status: 403,
            error: "Payments are unavailable for this account.",
        };
    }

    const pack =
        typeof input.packAmountUsd === "number"
            ? getPollenPackByAmount(input.packAmountUsd)
            : undefined;
    if (
        !pack ||
        pack.amountUsd < AUTO_TOP_UP_PACK_MIN_USD ||
        pack.amountUsd > AUTO_TOP_UP_PACK_MAX_USD
    ) {
        return {
            ok: false,
            status: 400,
            error: "Invalid auto top-up pack amount.",
        };
    }

    const packAmountUsd = pack.amountUsd;

    const stripe = createStripeClient(env);
    const customerId = await getOrCreateStripeCustomerId(env, userId);
    const customer = await retrieveActiveCustomer(stripe, customerId);
    if (!customer) {
        return {
            ok: false,
            status: 400,
            error: "Stripe customer is unavailable. Update your payment method before enabling auto top-up.",
        };
    }
    const paymentMethod = await getDefaultPaymentMethod(stripe, customer);

    if (!paymentMethod) {
        return {
            ok: false,
            status: 400,
            error: "Add a default payment method in Stripe before enabling auto top-up.",
        };
    }

    if (!isBillingDetailsComplete(customer, paymentMethod)) {
        return {
            ok: false,
            status: 400,
            error: "Add billing details in Stripe before enabling auto top-up.",
        };
    }

    await env.DB.prepare(
        `UPDATE user
            SET auto_top_up_enabled = 1,
                auto_top_up_amount_usd = ?
            WHERE id = ?`,
    )
        .bind(packAmountUsd, userId)
        .run();

    return { ok: true, overview: await getBillingOverview(env, userId) };
}

export async function processAutoTopUpForUser(
    env: CloudflareBindings,
    userId: string,
): Promise<AutoTopUpProcessResult> {
    const user = await getUserStripeBillingRow(env.DB, userId);

    if (user.stripePaymentRestriction) {
        return { status: "skipped", reason: "payments restricted" };
    }

    const eligibility = getAutoTopUpEligibility(user);
    if (!eligibility.eligible) {
        return { status: "skipped", reason: eligibility.reason };
    }

    const { pack } = eligibility;

    await expireStaleClaimedAttempts(env.DB, userId);

    const pendingAttempt = await findPendingAutoTopUpAttempt(env.DB, userId);
    if (pendingAttempt) {
        const staleResolution = await reconcileStalePendingAttempt(
            env,
            pendingAttempt,
        );
        if (staleResolution !== "none") {
            return {
                status: "skipped",
                reason: `stale auto top-up invoice reconciled (${pendingAttempt.stripeInvoiceId ?? pendingAttempt.id})`,
            };
        }

        return {
            status: "skipped",
            reason: `auto top-up already pending (${pendingAttempt.stripeInvoiceId ?? pendingAttempt.id})`,
        };
    }

    const attemptId = crypto.randomUUID();
    const claimed = await claimAutoTopUpAttempt(env.DB, {
        attemptId,
        userId,
        amountUsd: pack.amountUsd,
    });
    if (!claimed) {
        return {
            status: "skipped",
            reason: "auto top-up already attempted recently",
        };
    }

    let createdInvoiceId: string | null = null;
    try {
        const stripe = createStripeClient(env);
        const customerId = user.stripeCustomerId;
        if (!customerId) {
            await failAttempt(env.DB, attemptId, "missing Stripe customer");
            await disableAutoTopUp(env.DB, userId);
            return {
                status: "skipped",
                reason: "missing Stripe customer",
            };
        }
        const customer = await retrieveActiveCustomer(stripe, customerId);
        if (!customer) {
            await failAttempt(env.DB, attemptId, "deleted Stripe customer");
            await disableAutoTopUp(env.DB, userId);
            return {
                status: "skipped",
                reason: "deleted Stripe customer",
            };
        }
        const paymentMethod = await getDefaultPaymentMethod(stripe, customer);

        if (!paymentMethod) {
            await failAttempt(
                env.DB,
                attemptId,
                "missing default payment method",
            );
            await disableAutoTopUp(env.DB, userId);
            return {
                status: "skipped",
                reason: "missing default payment method",
            };
        }

        if (!isBillingDetailsComplete(customer, paymentMethod)) {
            await failAttempt(env.DB, attemptId, "missing billing details");
            await disableAutoTopUp(env.DB, userId);
            return { status: "skipped", reason: "missing billing details" };
        }

        const idempotencyKey = createAutoTopUpIdempotencyKey(attemptId);
        const metadata = {
            [METADATA_USER_ID]: userId,
            [METADATA_PURPOSE]: AUTO_TOP_UP_PURPOSE,
            autoTopUpAttemptId: attemptId,
        };

        // auto_advance: false keeps collection explicit: one manual pay()
        // attempt, then webhooks own successful crediting.
        const invoice = await stripe.invoices.create(
            {
                customer: customerId,
                currency: "usd",
                collection_method: "charge_automatically",
                auto_advance: false,
                automatic_tax: { enabled: true },
                default_payment_method: paymentMethod.id,
                description: pack.checkoutName,
                metadata,
                rendering: {
                    amount_tax_display: "exclude_tax",
                },
            },
            { idempotencyKey: `${idempotencyKey}:invoice` },
        );
        createdInvoiceId = invoice.id;

        await setAutoTopUpAttemptInvoice(env.DB, attemptId, invoice.id);

        await stripe.invoiceItems.create(
            {
                customer: customerId,
                invoice: invoice.id,
                amount: pack.amountUsd * 100,
                currency: "usd",
                description: pack.checkoutName,
                tax_behavior: "exclusive",
                tax_code: pack.taxCode,
                metadata: {
                    ...metadata,
                    line_type: POLLEN_PACK_LINE_TYPE,
                    packKey: pack.packKey,
                },
            },
            { idempotencyKey: `${idempotencyKey}:pack-item` },
        );

        const serviceFeeCents = calculateServiceFeeCents(pack.amountUsd * 100);
        await stripe.invoiceItems.create(
            {
                customer: customerId,
                invoice: invoice.id,
                amount: serviceFeeCents,
                currency: "usd",
                description: SERVICE_FEE_NAME,
                tax_behavior: "exclusive",
                tax_code: SERVICE_FEE_TAX_CODE,
                metadata: {
                    ...metadata,
                    line_type: SERVICE_FEE_LINE_TYPE,
                    serviceFeeCents: String(serviceFeeCents),
                },
            },
            { idempotencyKey: `${idempotencyKey}:service-fee-item` },
        );

        const finalized = await stripe.invoices.finalizeInvoice(
            invoice.id,
            {},
            { idempotencyKey: `${idempotencyKey}:finalize` },
        );
        try {
            await stripe.invoices.pay(
                finalized.id,
                {},
                { idempotencyKey: `${idempotencyKey}:pay` },
            );
        } catch (error) {
            console.warn("[auto-top-up] invoice payment left pending", {
                invoiceId: finalized.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return { status: "created", invoiceId: finalized.id };
    } catch (error) {
        const disableAfterFailure = shouldDisableAutoTopUpAfterFailure(error);
        const message =
            error instanceof Error ? error.message : "Auto top-up failed.";
        await failAttempt(env.DB, attemptId, message);
        if (createdInvoiceId) {
            await cleanupFailedAutoTopUpInvoice(env, createdInvoiceId);
        }
        if (disableAfterFailure) {
            await disableAutoTopUp(env.DB, userId);
        }
        return { status: "failed", reason: message };
    }
}

export async function creditAutoTopUpInvoice(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
): Promise<
    | { credited: true; pollenCredited: number }
    | { credited: false; reason: string }
> {
    const metadata = invoice.metadata ?? {};
    if (metadata[METADATA_PURPOSE] !== AUTO_TOP_UP_PURPOSE) {
        return { credited: false, reason: "not an auto top-up invoice" };
    }

    const attempt = await getAutoTopUpAttemptByInvoiceId(env.DB, invoice.id);
    if (!attempt) {
        return { credited: false, reason: "unknown auto top-up attempt" };
    }

    if (attempt.status === AUTO_TOP_UP_ATTEMPT_STATUS.PAID) {
        return { credited: false, reason: "invoice already credited" };
    }

    const verification = await verifyAutoTopUpInvoicePayment(
        env,
        invoice,
        attempt,
    );
    if (!verification.ok) {
        console.warn("[auto-top-up] invoice verification failed", {
            invoiceId: invoice.id,
            attemptId: attempt.id,
            reason: verification.reason,
            invoiceStatus: invoice.status,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
            expectedAmountCents: attempt.amountUsd * 100,
            expectedCurrency: "usd",
        });
        await markAttemptFailedByInvoice(
            env.DB,
            invoice.id,
            `verification mismatch: ${verification.reason}`,
        );
        return { credited: false, reason: verification.reason };
    }

    const now = Date.now();
    const [attemptUpdate] = await env.DB.batch([
        env.DB.prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET status = ?,
                    completed_at = ?,
                    updated_at = ?,
                    failure_reason = NULL
                WHERE stripe_invoice_id = ?
                    AND status IN (?, ?)`,
        ).bind(
            AUTO_TOP_UP_ATTEMPT_STATUS.PAID,
            now,
            now,
            invoice.id,
            AUTO_TOP_UP_ATTEMPT_STATUS.PENDING,
            AUTO_TOP_UP_ATTEMPT_STATUS.FAILED,
        ),
        env.DB.prepare(
            `UPDATE user
                SET pack_balance = ROUND(
                    COALESCE(pack_balance, 0) + ?,
                    ${POLLEN_BILLING_PRECISION}
                )
                WHERE id = ?
                    AND EXISTS (
                        SELECT 1
                        FROM stripe_auto_top_up_attempt
                        WHERE stripe_invoice_id = ?
                            AND user_id = ?
                            AND status = ?
                            AND completed_at = ?
                    )`,
        ).bind(
            attempt.amountUsd,
            attempt.userId,
            invoice.id,
            attempt.userId,
            AUTO_TOP_UP_ATTEMPT_STATUS.PAID,
            now,
        ),
    ]);

    const attemptChanges = attemptUpdate.meta.changes ?? 0;
    if (attemptChanges === 0) {
        return { credited: false, reason: "invoice already credited" };
    }

    return { credited: true, pollenCredited: attempt.amountUsd };
}

export async function markAutoTopUpInvoiceFailed(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
    reason: string,
    options: { cleanupInvoice?: boolean; disableAutoTopUp?: boolean } = {},
): Promise<void> {
    const metadata = invoice.metadata ?? {};
    if (metadata[METADATA_PURPOSE] !== AUTO_TOP_UP_PURPOSE) return;
    if (!invoice.id) return;

    // Off-session SCA emits payment_failed while the PaymentIntent still
    // requires action. Keep only those invoices recoverable; ordinary declines
    // fall through to cleanup below. API 2025-12-15.clover no longer surfaces
    // `invoice.payment_intent`; resolve via `invoice.payments` instead.
    if (options.cleanupInvoice !== false && invoice.status === "open") {
        const paymentIntent = await retrieveInvoicePaymentIntent(
            env,
            invoice.id,
        );
        if (paymentIntent?.status === "requires_action") return;
    }

    if (options.cleanupInvoice !== false) {
        await cleanupFailedAutoTopUpInvoice(env, invoice.id);
    }

    const attempt = await markAttemptFailedByInvoice(
        env.DB,
        invoice.id,
        reason,
    );

    if (options.disableAutoTopUp !== false && attempt) {
        await disableAutoTopUp(env.DB, attempt.userId);
    }
}

async function retrieveInvoicePaymentIntent(
    env: CloudflareBindings,
    invoiceId: string,
): Promise<Stripe.PaymentIntent | null> {
    const stripe = createStripeClient(env);
    const expanded = (await stripe.invoices.retrieve(invoiceId, {
        expand: ["payments.data.payment.payment_intent"],
    })) as Stripe.Invoice & {
        payments?: {
            data?: Array<{
                payment?: {
                    payment_intent?: Stripe.PaymentIntent | string | null;
                };
            }>;
        };
    };
    const pi = expanded.payments?.data?.[0]?.payment?.payment_intent;
    return pi && typeof pi === "object" ? pi : null;
}

async function findPendingAutoTopUpAttempt(
    db: D1Database,
    userId: string,
): Promise<PendingAutoTopUpAttempt | null> {
    return (
        (await db
            .prepare(
                `SELECT id,
                        stripe_invoice_id AS stripeInvoiceId,
                        status,
                        updated_at AS updatedAt
                    FROM stripe_auto_top_up_attempt
                    WHERE user_id = ?
                        AND status IN (?, ?)
                    ORDER BY created_at DESC
                    LIMIT 1`,
            )
            .bind(
                userId,
                AUTO_TOP_UP_ATTEMPT_STATUS.CLAIMED,
                AUTO_TOP_UP_ATTEMPT_STATUS.PENDING,
            )
            .first<PendingAutoTopUpAttempt>()) ?? null
    );
}

async function expireStaleClaimedAttempts(
    db: D1Database,
    userId: string,
): Promise<void> {
    const claimCutoff = Date.now() - AUTO_TOP_UP_CLAIM_TTL_MS;
    await db
        .prepare(
            `DELETE FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                    AND status = ?
                    AND created_at <= ?`,
        )
        .bind(userId, AUTO_TOP_UP_ATTEMPT_STATUS.CLAIMED, claimCutoff)
        .run();
}

async function reconcileStalePendingAttempt(
    env: CloudflareBindings,
    attempt: PendingAutoTopUpAttempt,
): Promise<"none" | "paid" | "failed"> {
    if (attempt.status !== AUTO_TOP_UP_ATTEMPT_STATUS.PENDING) return "none";
    if (!attempt.stripeInvoiceId) return "none";
    if (attempt.updatedAt > Date.now() - AUTO_TOP_UP_PENDING_TTL_MS) {
        return "none";
    }

    try {
        const stripe = createStripeClient(env);
        const invoice = await stripe.invoices.retrieve(attempt.stripeInvoiceId);

        if (invoice.status === "paid") {
            const result = await creditAutoTopUpInvoice(env, invoice);
            return result.credited ? "paid" : "failed";
        }

        if (invoice.status === "draft" || invoice.status === "open") {
            await cleanupRetrievedAutoTopUpInvoice(stripe, invoice);
            await markAttemptFailedByInvoice(
                env.DB,
                attempt.stripeInvoiceId,
                "Auto top-up invoice expired.",
            );
            return "failed";
        }

        if (invoice.status === "void" || invoice.status === "uncollectible") {
            await markAttemptFailedByInvoice(
                env.DB,
                attempt.stripeInvoiceId,
                "Stripe invoice can no longer be collected.",
            );
            return "failed";
        }
    } catch (error) {
        console.warn("[auto-top-up] stale pending reconciliation failed", {
            attemptId: attempt.id,
            invoiceId: attempt.stripeInvoiceId,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return "none";
}

async function claimAutoTopUpAttempt(
    db: D1Database,
    input: {
        attemptId: string;
        userId: string;
        amountUsd: number;
    },
): Promise<boolean> {
    const now = Date.now();
    const result = await db
        .prepare(
            `INSERT INTO stripe_auto_top_up_attempt (
                id,
                user_id,
                stripe_invoice_id,
                amount_usd,
                status,
                created_at,
                updated_at
            )
            SELECT ?, ?, NULL, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1
                FROM user
                WHERE id = ?
                    AND auto_top_up_enabled = 1
                    AND stripe_payment_restriction IS NULL
                    AND auto_top_up_amount_usd IS NOT NULL
                    AND COALESCE(pack_balance, 0) <= ?
            )
            AND NOT EXISTS (
                SELECT 1
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                    AND status IN (?, ?)
            )`,
        )
        .bind(
            input.attemptId,
            input.userId,
            input.amountUsd,
            AUTO_TOP_UP_ATTEMPT_STATUS.CLAIMED,
            now,
            now,
            input.userId,
            AUTO_TOP_UP_THRESHOLD_POLLEN,
            input.userId,
            AUTO_TOP_UP_ATTEMPT_STATUS.CLAIMED,
            AUTO_TOP_UP_ATTEMPT_STATUS.PENDING,
        )
        .run();

    return (result.meta.changes ?? 0) === 1;
}

async function setAutoTopUpAttemptInvoice(
    db: D1Database,
    attemptId: string,
    invoiceId: string,
): Promise<void> {
    const result = await db
        .prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET stripe_invoice_id = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                    AND status = ?`,
        )
        .bind(
            invoiceId,
            AUTO_TOP_UP_ATTEMPT_STATUS.PENDING,
            Date.now(),
            attemptId,
            AUTO_TOP_UP_ATTEMPT_STATUS.CLAIMED,
        )
        .run();

    if ((result.meta.changes ?? 0) !== 1) {
        throw new Error(
            `Auto top-up attempt ${attemptId} could not be linked to invoice ${invoiceId}`,
        );
    }
}

async function getAutoTopUpAttemptByInvoiceId(
    db: D1Database,
    invoiceId: string,
): Promise<AutoTopUpAttemptRow | null> {
    return (
        (await db
            .prepare(
                `SELECT id,
                    user_id AS userId,
                    stripe_invoice_id AS stripeInvoiceId,
                    amount_usd AS amountUsd,
                    status
                FROM stripe_auto_top_up_attempt
                WHERE stripe_invoice_id = ?
                LIMIT 1`,
            )
            .bind(invoiceId)
            .first<AutoTopUpAttemptRow>()) ?? null
    );
}

async function failAttempt(
    db: D1Database,
    attemptId: string,
    reason: string,
): Promise<void> {
    const now = Date.now();
    await db
        .prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET status = ?,
                    failure_reason = ?,
                    updated_at = ?,
                    completed_at = ?
                WHERE id = ?
                    AND status NOT IN (?, ?)`,
        )
        .bind(
            AUTO_TOP_UP_ATTEMPT_STATUS.FAILED,
            reason,
            now,
            now,
            attemptId,
            AUTO_TOP_UP_ATTEMPT_STATUS.PAID,
            AUTO_TOP_UP_ATTEMPT_STATUS.FAILED,
        )
        .run();
}

async function markAttemptFailedByInvoice(
    db: D1Database,
    invoiceId: string,
    reason: string,
): Promise<{ id: string; userId: string } | null> {
    const now = Date.now();
    return (
        (await db
            .prepare(
                `UPDATE stripe_auto_top_up_attempt
                    SET status = ?,
                        failure_reason = ?,
                        updated_at = ?,
                        completed_at = ?
                    WHERE stripe_invoice_id = ?
                        AND status NOT IN (?, ?)
                    RETURNING id, user_id AS userId`,
            )
            .bind(
                AUTO_TOP_UP_ATTEMPT_STATUS.FAILED,
                reason,
                now,
                now,
                invoiceId,
                AUTO_TOP_UP_ATTEMPT_STATUS.PAID,
                AUTO_TOP_UP_ATTEMPT_STATUS.FAILED,
            )
            .first<{ id: string; userId: string }>()) ?? null
    );
}

async function cleanupFailedAutoTopUpInvoice(
    env: CloudflareBindings,
    invoiceId: string,
): Promise<void> {
    try {
        const stripe = createStripeClient(env);
        const invoice = await stripe.invoices.retrieve(invoiceId);
        await cleanupRetrievedAutoTopUpInvoice(stripe, invoice);
    } catch (error) {
        console.warn(
            `[auto-top-up] failed to cleanup invoice ${invoiceId}:`,
            error instanceof Error ? error.message : String(error),
        );
    }
}

async function cleanupRetrievedAutoTopUpInvoice(
    stripe: Stripe,
    invoice: Stripe.Invoice,
): Promise<void> {
    if (invoice.status === "paid") return;
    if (invoice.status === "void" || invoice.status === "uncollectible") {
        return;
    }

    if (invoice.status === "draft") {
        await stripe.invoices.del(invoice.id);
        return;
    }

    if (invoice.status === "open") {
        await stripe.invoices.voidInvoice(invoice.id);
    }
}

async function disableAutoTopUp(db: D1Database, userId: string): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_enabled = 0
                WHERE id = ?`,
        )
        .bind(userId)
        .run();
}

function createAutoTopUpIdempotencyKey(attemptId: string): string {
    return `pollinations:auto-top-up:${attemptId}`;
}

function shouldDisableAutoTopUpAfterFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const stripeType = (error as { type?: unknown }).type;
    return stripeType === "StripeInvalidRequestError";
}

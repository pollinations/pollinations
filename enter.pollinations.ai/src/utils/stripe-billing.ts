import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
    AUTO_TOP_UP_THRESHOLD_POLLEN,
} from "@shared/billing/auto-top-up.ts";
import type Stripe from "stripe";
import { getPollenPack } from "@/pollen-packs.ts";
import { createStripeClient } from "./stripe.ts";

const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
const METADATA_USER_ID = "pollinations_user_id";
const METADATA_PURPOSE = "pollinations_purpose";
const AUTO_TOP_UP_PURPOSE = "auto_top_up";
const AUTO_TOP_UP_CLAIM_TTL_MS = 5 * 60 * 1000;
const AUTO_TOP_UP_REQUIRES_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED = "claimed";
const AUTO_TOP_UP_ATTEMPT_STATUS_FAILED = "failed";
const AUTO_TOP_UP_ATTEMPT_STATUS_PAID = "paid";
const AUTO_TOP_UP_ATTEMPT_STATUS_PENDING = "pending";
const AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION = "requires_action";
const BILLING_PORTAL_CONFIGURATION_METADATA_KEY = "pollinations_portal";
const BILLING_PORTAL_CONFIGURATION_METADATA_VALUE = "billing_details_v1";
const BILLING_PORTAL_CONFIGURATION_NAME = "Pollinations Billing Portal";
const BILLING_PORTAL_HEADLINE =
    "Manage your payment methods, billing details, and invoices.";
const BILLING_PORTAL_CUSTOMER_UPDATES = [
    "name",
    "address",
    "tax_id",
] satisfies Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[];

const DEFAULT_AUTO_TOP_UP_AMOUNT_USD = 20;

type UserStripeBillingDbRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: number | null;
    autoTopUpAmountUsd: number | null;
};

type UserStripeBillingRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: boolean;
    autoTopUpAmountUsd: number | null;
};

type PendingAutoTopUpAttempt = {
    id: string;
    stripeInvoiceId: string | null;
};

type AutoTopUpAttemptRow = {
    id: string;
    userId: string;
    stripeInvoiceId: string | null;
    amountUsd: number;
    pollenGrant: number;
    status: string;
    expectedAmountCents: number;
    expectedCurrency: string;
};

type AutoTopUpInput = {
    enabled: boolean;
    packAmountUsd?: number;
};

export type AutoTopUpIssue = {
    kind: "failed" | "requires_action";
    reason: string;
    occurredAt: string;
};

export type BillingOverview = {
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        lastIssue: AutoTopUpIssue | null;
    };
    paymentMethod: {
        hasDefault: boolean;
        brand: string | null;
        last4: string | null;
    };
    billingDetails: {
        name: string | null;
        email: string | null;
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
    } | null;
    billingDetailsComplete: boolean;
};

type AutoTopUpProcessResult =
    | { status: "skipped"; reason: string }
    | { status: "created"; invoiceId: string }
    | { status: "failed"; reason: string };

export async function getOrCreateStripeCustomerId(
    env: CloudflareBindings,
    userId: string,
): Promise<string> {
    const user = await getUserStripeBillingRow(env.DB, userId);

    if (user.stripeCustomerId) return user.stripeCustomerId;

    const stripe = createStripeClient(env);
    const customer = await stripe.customers.create(
        {
            email: user.email,
            name: user.name,
            metadata: {
                [METADATA_USER_ID]: user.id,
            },
        },
        {
            idempotencyKey: `pollinations:${user.id}:stripe-customer:${CUSTOMER_CREATE_IDEMPOTENCY_VERSION}`,
        },
    );

    await env.DB.prepare(
        "UPDATE user SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL",
    )
        .bind(customer.id, user.id)
        .run();

    const updated = await getUserStripeBillingRow(env.DB, userId);
    return updated.stripeCustomerId ?? customer.id;
}

export async function getBillingOverview(
    env: CloudflareBindings,
    userId: string,
): Promise<BillingOverview> {
    const stripe = createStripeClient(env);
    const user = await getUserStripeBillingRow(env.DB, userId);
    const customer = user.stripeCustomerId
        ? await retrieveActiveCustomer(stripe, user.stripeCustomerId)
        : null;
    const paymentMethod = customer
        ? await getDefaultCardPaymentMethod(stripe, customer)
        : null;
    const billingDetailsComplete = customer
        ? isBillingDetailsComplete(customer, paymentMethod)
        : false;
    const autoTopUpEnabled =
        user.autoTopUpEnabled && !!paymentMethod && billingDetailsComplete;

    const lastIssue = await getLastAutoTopUpIssue(env.DB, userId);

    return {
        autoTopUp: {
            enabled: autoTopUpEnabled,
            thresholdPollen: AUTO_TOP_UP_THRESHOLD_POLLEN,
            packAmountUsd:
                user.autoTopUpAmountUsd ?? DEFAULT_AUTO_TOP_UP_AMOUNT_USD,
            lastIssue,
        },
        paymentMethod: paymentMethod
            ? {
                  hasDefault: true,
                  brand: paymentMethod.card?.brand ?? "card",
                  last4: paymentMethod.card?.last4 ?? null,
              }
            : { hasDefault: false, brand: null, last4: null },
        billingDetails: customer
            ? getBillingDetailsSummary(customer, paymentMethod)
            : null,
        billingDetailsComplete,
    };
}

export async function createBillingPortalSession(
    env: CloudflareBindings,
    userId: string,
): Promise<Stripe.BillingPortal.Session> {
    const stripe = createStripeClient(env);
    const customer = await getOrCreateStripeCustomerId(env, userId);
    const returnUrl = getBillingReturnUrl(env);
    const configuration = await ensureBillingPortalConfiguration(
        stripe,
        returnUrl,
        env.STRIPE_AUTO_TOP_UP_PMC_ID || undefined,
    );

    return stripe.billingPortal.sessions.create({
        customer,
        configuration,
        return_url: returnUrl,
    });
}

async function ensureBillingPortalConfiguration(
    stripe: Stripe,
    returnUrl: string,
    paymentMethodConfiguration: string | undefined,
): Promise<string> {
    const configurations = await stripe.billingPortal.configurations.list({
        active: true,
        limit: 100,
    });
    const existing = configurations.data.find(
        (configuration) =>
            configuration.metadata?.[
                BILLING_PORTAL_CONFIGURATION_METADATA_KEY
            ] === BILLING_PORTAL_CONFIGURATION_METADATA_VALUE,
    );

    if (existing) {
        if (
            isBillingPortalConfigurationCurrent(
                existing,
                paymentMethodConfiguration,
            )
        ) {
            return existing.id;
        }

        const updated = await stripe.billingPortal.configurations.update(
            existing.id,
            createBillingPortalConfigurationParams(
                returnUrl,
                paymentMethodConfiguration,
            ),
        );
        return updated.id;
    }

    const created = await stripe.billingPortal.configurations.create(
        createBillingPortalConfigurationParams(
            returnUrl,
            paymentMethodConfiguration,
        ),
        {
            idempotencyKey: `pollinations:stripe-billing-portal:${BILLING_PORTAL_CONFIGURATION_METADATA_VALUE}`,
        },
    );
    return created.id;
}

function createBillingPortalConfigurationParams(
    returnUrl: string,
    paymentMethodConfiguration: string | undefined,
): Stripe.BillingPortal.ConfigurationCreateParams {
    return {
        name: BILLING_PORTAL_CONFIGURATION_NAME,
        default_return_url: returnUrl,
        business_profile: {
            headline: BILLING_PORTAL_HEADLINE,
        },
        metadata: {
            [BILLING_PORTAL_CONFIGURATION_METADATA_KEY]:
                BILLING_PORTAL_CONFIGURATION_METADATA_VALUE,
        },
        features: {
            customer_update: {
                enabled: true,
                allowed_updates: BILLING_PORTAL_CUSTOMER_UPDATES,
            },
            invoice_history: {
                enabled: true,
            },
            payment_method_update: {
                enabled: true,
                ...(paymentMethodConfiguration && {
                    payment_method_configuration: paymentMethodConfiguration,
                }),
            },
        },
    };
}

function isBillingPortalConfigurationCurrent(
    configuration: Stripe.BillingPortal.Configuration,
    paymentMethodConfiguration: string | undefined,
): boolean {
    if (configuration.business_profile.headline !== BILLING_PORTAL_HEADLINE) {
        return false;
    }

    const customerUpdate = configuration.features.customer_update;
    if (!customerUpdate.enabled) return false;

    const allowedUpdates = new Set(customerUpdate.allowed_updates);
    if (
        !BILLING_PORTAL_CUSTOMER_UPDATES.every((update) =>
            allowedUpdates.has(update),
        )
    ) {
        return false;
    }

    const currentPmc =
        configuration.features.payment_method_update
            .payment_method_configuration;
    return (currentPmc ?? undefined) === paymentMethodConfiguration;
}

export async function updateAutoTopUpSettings(
    env: CloudflareBindings,
    userId: string,
    input: AutoTopUpInput,
): Promise<
    | { ok: true; overview: BillingOverview }
    | { ok: false; status: 400; error: string }
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

    const pack = getPollenPack(String(input.packAmountUsd));
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
    const paymentMethod = await getDefaultCardPaymentMethod(stripe, customer);

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

    if (!user.autoTopUpEnabled) {
        return { status: "skipped", reason: "auto top-up disabled" };
    }

    const threshold = AUTO_TOP_UP_THRESHOLD_POLLEN;
    const amountUsd = user.autoTopUpAmountUsd;
    if (amountUsd == null) {
        return { status: "skipped", reason: "auto top-up not configured" };
    }

    if ((user.packBalance ?? 0) > threshold) {
        return { status: "skipped", reason: "paid balance above threshold" };
    }

    const pack = getPollenPack(String(amountUsd));
    if (!pack) {
        await disableAutoTopUp(env.DB, userId);
        return { status: "failed", reason: "invalid pack amount" };
    }

    await expireStaleClaimedAttempts(env.DB, userId);

    const expiredRequiresActionAttempt = await expireStaleRequiresActionAttempt(
        env.DB,
        userId,
    );
    if (expiredRequiresActionAttempt) {
        await cleanupFailedAutoTopUpInvoice(env, expiredRequiresActionAttempt);
        await disableAutoTopUp(env.DB, userId);
        return {
            status: "skipped",
            reason: `previous auto top-up authentication expired (${expiredRequiresActionAttempt})`,
        };
    }

    const pendingAttempt = await findPendingAutoTopUpAttempt(env.DB, userId);
    if (pendingAttempt) {
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
        pollenGrant: pack.pollenGrant,
        expectedAmountCents: pack.amountUsd * 100,
        expectedCurrency: "usd",
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
            await disableAutoTopUpAndClearClaim(env.DB, userId);
            return {
                status: "skipped",
                reason: "missing Stripe customer",
            };
        }
        const customer = await retrieveActiveCustomer(stripe, customerId);
        if (!customer) {
            await failAttempt(env.DB, attemptId, "deleted Stripe customer");
            await disableAutoTopUpAndClearClaim(env.DB, userId);
            return {
                status: "skipped",
                reason: "deleted Stripe customer",
            };
        }
        const paymentMethod = await getDefaultCardPaymentMethod(
            stripe,
            customer,
        );

        if (!paymentMethod) {
            await failAttempt(
                env.DB,
                attemptId,
                "missing default payment method",
            );
            await disableAutoTopUpAndClearClaim(env.DB, userId);
            return {
                status: "skipped",
                reason: "missing default payment method",
            };
        }

        if (!isBillingDetailsComplete(customer, paymentMethod)) {
            await failAttempt(env.DB, attemptId, "missing billing details");
            await disableAutoTopUpAndClearClaim(env.DB, userId);
            return { status: "skipped", reason: "missing billing details" };
        }

        const idempotencyKey = createAutoTopUpIdempotencyKey(attemptId);
        const metadata = {
            [METADATA_USER_ID]: userId,
            [METADATA_PURPOSE]: AUTO_TOP_UP_PURPOSE,
            autoTopUpAttemptId: attemptId,
            packAmount: String(pack.amountUsd),
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
                tax_behavior: "inclusive",
                tax_code: pack.taxCode,
                metadata,
            },
            { idempotencyKey: `${idempotencyKey}:item` },
        );

        const finalized = await stripe.invoices.finalizeInvoice(
            invoice.id,
            {},
            { idempotencyKey: `${idempotencyKey}:finalize` },
        );
        const paid = await stripe.invoices.pay(
            finalized.id,
            {},
            { idempotencyKey: `${idempotencyKey}:pay` },
        );

        // Credit synchronously now that Stripe has confirmed the charge.
        // Webhook (`invoice.paid` / `invoice.payment_succeeded`) is the safety
        // net: it short-circuits on attempt.status === 'paid' so it can never
        // double-credit. Isolated try/catch so an inline-credit failure does
        // NOT trigger the outer Stripe-error catch (which would void an
        // already-charged invoice and lose the user's money).
        try {
            const creditResult = await creditAutoTopUpInvoice(env, paid);
            if (!creditResult.credited) {
                console.warn(
                    "[auto-top-up] inline credit skipped; webhook will retry",
                    {
                        invoiceId: paid.id,
                        attemptId,
                        reason: creditResult.reason,
                    },
                );
            }
        } catch (creditError) {
            console.error(
                "[auto-top-up] inline credit threw; webhook will recover",
                {
                    invoiceId: paid.id,
                    attemptId,
                    error:
                        creditError instanceof Error
                            ? creditError.message
                            : String(creditError),
                },
            );
        }

        return { status: "created", invoiceId: paid.id };
    } catch (error) {
        // SCA / 3DS path: the bank requires the user to authenticate this
        // charge. The invoice is finalized but unpaid; Stripe will email the
        // customer a link to the hosted invoice URL where they can complete
        // 3DS. Mark the attempt as `requires_action` (not `failed`), do NOT
        // void the invoice (it must stay payable for the user to complete
        // auth), and do NOT disable auto top-up. The 24h expiry sweep will
        // clean up if the user never authenticates.
        if (isSCARequiredError(error) && createdInvoiceId) {
            try {
                const stripe = createStripeClient(env);
                const invoice =
                    await stripe.invoices.retrieve(createdInvoiceId);
                await markAutoTopUpInvoiceRequiresAction(env, invoice);
                return {
                    status: "skipped",
                    reason: "requires authentication",
                };
            } catch (recoveryError) {
                // If we can't retrieve the invoice or mark requires_action,
                // fall through to the regular failure path so we don't leave
                // the attempt in a stuck `pending` state.
                console.error(
                    "[auto-top-up] SCA recovery failed; falling back to failure path",
                    {
                        invoiceId: createdInvoiceId,
                        attemptId,
                        error:
                            recoveryError instanceof Error
                                ? recoveryError.message
                                : String(recoveryError),
                    },
                );
            }
        }

        const message =
            error instanceof Error ? error.message : "Auto top-up failed.";
        await failAttempt(env.DB, attemptId, message);
        if (createdInvoiceId) {
            await cleanupFailedAutoTopUpInvoice(env, createdInvoiceId);
        }
        if (shouldDisableAutoTopUpAfterFailure(error)) {
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

    if (!invoice.id) {
        return { credited: false, reason: "missing auto top-up metadata" };
    }

    const attempt = await getAutoTopUpAttemptByInvoiceId(env.DB, invoice.id);
    if (!attempt) {
        return { credited: false, reason: "unknown auto top-up attempt" };
    }

    if (attempt.status === AUTO_TOP_UP_ATTEMPT_STATUS_PAID) {
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
            expectedAmountCents: attempt.expectedAmountCents,
            expectedCurrency: attempt.expectedCurrency,
        });
        await markAttemptFailedByInvoice(
            env.DB,
            invoice.id,
            `verification mismatch: ${verification.reason}`,
        );
        return { credited: false, reason: verification.reason };
    }

    const now = Date.now();
    const [attemptUpdate, userUpdate] = await env.DB.batch([
        env.DB.prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET status = ?,
                    completed_at = ?,
                    updated_at = ?,
                    failure_reason = NULL
                WHERE stripe_invoice_id = ?
                    AND status IN (?, ?, ?)`,
        ).bind(
            AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
            now,
            now,
            invoice.id,
            AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
            AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
        ),
        env.DB.prepare(
            `UPDATE user
                SET pack_balance = COALESCE(pack_balance, 0) + ?,
                    auto_top_up_claimed_at = NULL
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
            attempt.pollenGrant,
            attempt.userId,
            invoice.id,
            attempt.userId,
            AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
            now,
        ),
    ]);

    const attemptChanges = attemptUpdate.meta.changes ?? 0;
    const userChanges = userUpdate.meta.changes ?? 0;

    if (attemptChanges === 0) {
        return { credited: false, reason: "invoice already credited" };
    }

    if (userChanges !== 1) {
        // D1 batch only rolls back when a statement *errors*; a 0-row UPDATE
        // user is a successful statement and the paid transition has already
        // committed. A subsequent throw alone would be unsafe — the next
        // webhook delivery would short-circuit on status='paid' and leave
        // the user uncredited. Manually revert the attempt to 'pending' so
        // Stripe retries can converge. Gate the revert on (status='paid'
        // AND completed_at = our now) so we only undo our own transition.
        const rollback = await env.DB.prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET status = ?,
                    completed_at = NULL,
                    updated_at = ?,
                    failure_reason = ?
                WHERE stripe_invoice_id = ?
                    AND status = ?
                    AND completed_at = ?`,
        )
            .bind(
                AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
                Date.now(),
                "balance update missed; awaiting webhook retry",
                invoice.id,
                AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
                now,
            )
            .run();
        console.error(
            "[auto-top-up] credit balance update missed; reverted attempt for retry",
            {
                invoiceId: invoice.id,
                attemptId: attempt.id,
                userId: attempt.userId,
                attemptChanges,
                userChanges,
                rolledBack: rollback.meta.changes ?? 0,
            },
        );
        throw new Error(
            `Auto top-up credit failed for invoice ${invoice.id}: balance update did not match`,
        );
    }

    return { credited: true, pollenCredited: attempt.pollenGrant };
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

    if (options.cleanupInvoice !== false) {
        await cleanupFailedAutoTopUpInvoice(env, invoice.id);
    }

    const attempt = await markAttemptFailedByInvoice(
        env.DB,
        invoice.id,
        reason,
    );

    let userIdToDisable = attempt?.userId ?? null;
    if (!attempt) {
        // Worker-crash recovery: a previous delivery may have transitioned
        // the attempt to 'failed' but died before the disable side-effect
        // ran. markAttemptFailedByInvoice excludes 'failed' from its
        // WHERE NOT IN, so it returned null. Look up the row directly so
        // disable can still run on retry. Gate on status='failed' so
        // already-paid attempts don't accidentally disable the user.
        const existingFailed = await env.DB.prepare(
            `SELECT user_id AS userId
                FROM stripe_auto_top_up_attempt
                WHERE stripe_invoice_id = ?
                    AND status = ?
                LIMIT 1`,
        )
            .bind(invoice.id, AUTO_TOP_UP_ATTEMPT_STATUS_FAILED)
            .first<{ userId: string }>();
        userIdToDisable = existingFailed?.userId ?? null;
    }

    if (options.disableAutoTopUp !== false && userIdToDisable) {
        await disableAutoTopUpAndClearClaim(env.DB, userIdToDisable);
    }
}

export async function markAutoTopUpInvoiceRequiresAction(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
): Promise<void> {
    const metadata = invoice.metadata ?? {};
    if (metadata[METADATA_PURPOSE] !== AUTO_TOP_UP_PURPOSE) return;

    const userId = metadata[METADATA_USER_ID];
    if (!invoice.id || !userId) return;

    const hostedInvoiceUrl =
        typeof invoice.hosted_invoice_url === "string"
            ? invoice.hosted_invoice_url
            : null;
    const reason = hostedInvoiceUrl
        ? `Stripe requires additional payment authentication before auto top-up can complete. Complete payment in Stripe: ${hostedInvoiceUrl}`
        : "Stripe requires additional payment authentication before auto top-up can complete.";

    const now = Date.now();
    const attempt = await env.DB.prepare(
        `UPDATE stripe_auto_top_up_attempt
            SET status = ?,
                failure_reason = ?,
                updated_at = ?,
                completed_at = NULL
            WHERE stripe_invoice_id = ?
                AND status NOT IN ('paid', ?)
            RETURNING id, status`,
    )
        .bind(
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
            reason,
            now,
            invoice.id,
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
        )
        .first<{ id: string }>();

    if (!attempt) return;
}

async function getUserStripeBillingRow(
    db: D1Database,
    userId: string,
): Promise<UserStripeBillingRow> {
    const user = await db
        .prepare(
            `SELECT id,
                name,
                email,
                pack_balance AS packBalance,
                stripe_customer_id AS stripeCustomerId,
                auto_top_up_enabled AS autoTopUpEnabled,
                auto_top_up_amount_usd AS autoTopUpAmountUsd
            FROM user
            WHERE id = ?
            LIMIT 1`,
        )
        .bind(userId)
        .first<UserStripeBillingDbRow>();

    if (!user) {
        throw new Error("User not found");
    }

    return {
        ...user,
        autoTopUpEnabled: user.autoTopUpEnabled === 1,
    };
}

async function retrieveActiveCustomer(
    stripe: Stripe,
    customerId: string,
): Promise<Stripe.Customer | null> {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
        return null;
    }
    return customer;
}

function getStripeId(value: string | { id?: string } | null | undefined) {
    return typeof value === "string" ? value : (value?.id ?? null);
}

async function getDefaultCardPaymentMethod(
    stripe: Stripe,
    customer: Stripe.Customer,
): Promise<Stripe.PaymentMethod | null> {
    const paymentMethodId = getStripeId(
        customer.invoice_settings?.default_payment_method,
    );
    if (!paymentMethodId) return null;

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.type !== "card" || !paymentMethod.card) return null;
    return paymentMethod;
}

function isBillingDetailsComplete(
    customer: Stripe.Customer,
    paymentMethod: Stripe.PaymentMethod | null,
): boolean {
    const details = getBillingDetailsSummary(customer, paymentMethod);
    return !!details?.name && isTaxLocationComplete(details);
}

function isTaxLocationComplete(
    details: NonNullable<BillingOverview["billingDetails"]>,
): boolean {
    const country = details.country?.toUpperCase();
    if (!country) return false;

    if (country === "US") {
        return !!details.postalCode;
    }

    if (country === "CA" || country === "IN") {
        return !!(details.postalCode || details.state);
    }

    return true;
}

function getBillingDetailsSummary(
    customer: Stripe.Customer,
    paymentMethod: Stripe.PaymentMethod | null,
): BillingOverview["billingDetails"] {
    const paymentAddress = paymentMethod?.billing_details?.address;
    const customerAddress = customer.address;

    return {
        name: firstString(
            customer.business_name,
            customer.name,
            paymentMethod?.billing_details?.name,
        ),
        email: firstString(
            customer.email,
            paymentMethod?.billing_details?.email,
        ),
        line1: firstString(customerAddress?.line1, paymentAddress?.line1),
        line2: firstString(customerAddress?.line2, paymentAddress?.line2),
        city: firstString(customerAddress?.city, paymentAddress?.city),
        state: firstString(customerAddress?.state, paymentAddress?.state),
        postalCode: firstString(
            customerAddress?.postal_code,
            paymentAddress?.postal_code,
        ),
        country: firstString(customerAddress?.country, paymentAddress?.country),
    };
}

function firstString(
    ...values: Array<string | null | undefined>
): string | null {
    return values.find((value) => typeof value === "string" && value) ?? null;
}

async function findPendingAutoTopUpAttempt(
    db: D1Database,
    userId: string,
): Promise<PendingAutoTopUpAttempt | null> {
    const requiresActionCutoff =
        Date.now() - AUTO_TOP_UP_REQUIRES_ACTION_TTL_MS;
    return (
        (await db
            .prepare(
                `SELECT id, stripe_invoice_id AS stripeInvoiceId
                    FROM stripe_auto_top_up_attempt
                    WHERE user_id = ?
                        AND (
                            status = ?
                            OR status = ?
                            OR (status = ? AND updated_at > ?)
                        )
                    ORDER BY created_at DESC
                    LIMIT 1`,
            )
            .bind(
                userId,
                AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
                AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
                AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
                requiresActionCutoff,
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
        .bind(userId, AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED, claimCutoff)
        .run();
}

async function expireStaleRequiresActionAttempt(
    db: D1Database,
    userId: string,
): Promise<string | null> {
    const now = Date.now();
    const requiresActionCutoff = now - AUTO_TOP_UP_REQUIRES_ACTION_TTL_MS;
    return (
        (
            await db
                .prepare(
                    `UPDATE stripe_auto_top_up_attempt
                    SET status = ?,
                        failure_reason = ?,
                        updated_at = ?,
                        completed_at = ?
                    WHERE user_id = ?
                        AND status = ?
                        AND updated_at <= ?
                    RETURNING id, stripe_invoice_id AS stripeInvoiceId`,
                )
                .bind(
                    AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
                    "Auto top-up payment authentication expired.",
                    now,
                    now,
                    userId,
                    AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
                    requiresActionCutoff,
                )
                .first<{ stripeInvoiceId: string }>()
        )?.stripeInvoiceId ?? null
    );
}

async function claimAutoTopUpAttempt(
    db: D1Database,
    input: {
        attemptId: string;
        userId: string;
        amountUsd: number;
        pollenGrant: number;
        expectedAmountCents: number;
        expectedCurrency: string;
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
                pollen_grant,
                expected_amount_cents,
                expected_currency,
                status,
                created_at,
                updated_at
            )
            SELECT ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1
                FROM user
                WHERE id = ?
                    AND auto_top_up_enabled = 1
                    AND auto_top_up_amount_usd IS NOT NULL
                    AND COALESCE(pack_balance, 0) <= ?
            )
            AND NOT EXISTS (
                SELECT 1
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                    AND status IN (?, ?, ?)
            )`,
        )
        .bind(
            input.attemptId,
            input.userId,
            input.amountUsd,
            input.pollenGrant,
            input.expectedAmountCents,
            input.expectedCurrency,
            AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
            now,
            now,
            input.userId,
            AUTO_TOP_UP_THRESHOLD_POLLEN,
            input.userId,
            AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
            AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
        )
        .run();

    if ((result.meta.changes ?? 0) !== 1) return false;

    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_claimed_at = ?
                WHERE id = ?`,
        )
        .bind(now, input.userId)
        .run();

    return true;
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
            AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
            Date.now(),
            attemptId,
            AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
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
                    pollen_grant AS pollenGrant,
                    status,
                    expected_amount_cents AS expectedAmountCents,
                    expected_currency AS expectedCurrency
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
            AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
            reason,
            now,
            now,
            attemptId,
            AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
            AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
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
                AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
                reason,
                now,
                now,
                invoiceId,
                AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
                AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
            )
            .first<{ id: string; userId: string }>()) ?? null
    );
}

async function verifyAutoTopUpInvoicePayment(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
    attempt: AutoTopUpAttemptRow,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (invoice.status !== "paid") {
        return { ok: false, reason: "invoice status is not paid" };
    }

    if (invoice.amount_paid !== attempt.expectedAmountCents) {
        return { ok: false, reason: "amount mismatch" };
    }

    if (invoice.currency !== attempt.expectedCurrency) {
        return { ok: false, reason: "currency mismatch" };
    }

    const paymentIntentVerification = await verifySucceededInvoicePaymentIntent(
        env,
        invoice.id,
        attempt,
    );
    if (!paymentIntentVerification.ok) {
        return paymentIntentVerification;
    }

    return { ok: true };
}

async function verifySucceededInvoicePaymentIntent(
    env: CloudflareBindings,
    invoiceId: string,
    attempt: AutoTopUpAttemptRow,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const stripe = createStripeClient(env);
    let startingAfter: string | undefined;
    let sawSucceededPaymentIntent = false;

    do {
        const page = await stripe.invoicePayments.list({
            invoice: invoiceId,
            limit: 100,
            ...(startingAfter && { starting_after: startingAfter }),
        });

        for (const payment of page.data) {
            if (payment.status !== "paid") continue;
            if (payment.payment.type !== "payment_intent") continue;
            const paymentIntentId = getStripeId(payment.payment.payment_intent);
            if (!paymentIntentId) continue;

            const paymentIntent =
                await stripe.paymentIntents.retrieve(paymentIntentId);
            if (paymentIntent.status !== "succeeded") {
                continue;
            }

            sawSucceededPaymentIntent = true;
            if (payment.amount_paid !== attempt.expectedAmountCents) {
                return {
                    ok: false,
                    reason: "payment intent amount mismatch",
                };
            }
            if (payment.currency !== attempt.expectedCurrency) {
                return {
                    ok: false,
                    reason: "payment intent currency mismatch",
                };
            }

            return { ok: true };
        }

        const lastPayment = page.data.at(-1);
        startingAfter =
            page.has_more && lastPayment ? lastPayment.id : undefined;
    } while (startingAfter);

    return {
        ok: false,
        reason: sawSucceededPaymentIntent
            ? "payment intent payment mismatch"
            : "missing succeeded payment intent",
    };
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
        try {
            await stripe.invoices.del(invoice.id);
        } catch (error) {
            console.warn(
                `[auto-top-up] failed to delete draft invoice ${invoice.id}:`,
                error instanceof Error ? error.message : String(error),
            );
            const latest = await stripe.invoices.retrieve(invoice.id);
            if (latest.status !== "draft") {
                await cleanupRetrievedAutoTopUpInvoice(stripe, latest);
            }
        }
        return;
    }

    if (invoice.status === "open") {
        try {
            await stripe.invoices.voidInvoice(invoice.id);
        } catch (error) {
            if (!isStripeInvalidRequestError(error)) {
                console.warn(
                    `[auto-top-up] failed to void open invoice ${invoice.id}:`,
                    error instanceof Error ? error.message : String(error),
                );
                return;
            }
            const latest = await stripe.invoices.retrieve(invoice.id);
            console.warn("[auto-top-up] invoice changed during void cleanup", {
                invoiceId: invoice.id,
                status: latest.status,
            });
            if (latest.status !== "open") {
                await cleanupRetrievedAutoTopUpInvoice(stripe, latest);
            }
        }
    }
}

async function getLastAutoTopUpIssue(
    db: D1Database,
    userId: string,
): Promise<AutoTopUpIssue | null> {
    const row = await db
        .prepare(
            `SELECT status, failure_reason, completed_at, updated_at, created_at
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                ORDER BY COALESCE(completed_at, updated_at, created_at) DESC
                LIMIT 1`,
        )
        .bind(userId)
        .first<{
            status: string;
            failure_reason: string | null;
            completed_at: number | null;
            updated_at: number | null;
            created_at: number;
        }>();
    if (!row) return null;
    if (row.status !== "failed" && row.status !== "requires_action") {
        return null;
    }
    const occurredAtMs = row.completed_at ?? row.updated_at ?? row.created_at;
    return {
        kind: row.status,
        reason: row.failure_reason ?? "Auto top-up could not be completed.",
        occurredAt: new Date(occurredAtMs).toISOString(),
    };
}

async function disableAutoTopUp(db: D1Database, userId: string): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_enabled = 0
                WHERE id = ?
                    AND auto_top_up_enabled = 1`,
        )
        .bind(userId)
        .run();
}

async function disableAutoTopUpAndClearClaim(
    db: D1Database,
    userId: string,
): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_enabled = 0,
                    auto_top_up_claimed_at = NULL
                WHERE id = ?`,
        )
        .bind(userId)
        .run();
}

function createAutoTopUpIdempotencyKey(attemptId: string): string {
    return `pollinations:auto-top-up:${attemptId}`;
}

function getBillingReturnUrl(env: CloudflareBindings): string {
    const baseUrl = env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
    const url = new URL(baseUrl);
    url.searchParams.set("stripe_billing_return", "true");
    return url.toString();
}

function shouldDisableAutoTopUpAfterFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    if (isSCARequiredError(error)) return false;
    const stripeType = (error as { type?: unknown }).type;
    return (
        stripeType === "StripeCardError" ||
        stripeType === "StripeInvalidRequestError"
    );
}

/**
 * Detects when a Stripe error indicates the bank requires the cardholder to
 * complete Strong Customer Authentication (3DS) before the charge can settle.
 * Common in EU/UK under PSD2 even when off-session consent has been recorded.
 *
 * Surface signals (any one is sufficient):
 *  - error.code === "invoice_payment_intent_requires_action"
 *  - error.code === "authentication_required"
 *  - error.code === "payment_intent_authentication_failure"
 *  - error.payment_intent.status === "requires_action"
 *  - error.raw.code === any of the above
 */
function isSCARequiredError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as {
        code?: unknown;
        payment_intent?: { status?: unknown };
        raw?: { code?: unknown; payment_intent?: { status?: unknown } };
    };
    const codes = new Set([
        "invoice_payment_intent_requires_action",
        "authentication_required",
        "payment_intent_authentication_failure",
    ]);
    if (typeof e.code === "string" && codes.has(e.code)) return true;
    if (typeof e.raw?.code === "string" && codes.has(e.raw.code)) return true;
    if (e.payment_intent?.status === "requires_action") return true;
    if (e.raw?.payment_intent?.status === "requires_action") return true;
    return false;
}

function isStripeInvalidRequestError(error: unknown): boolean {
    return (
        !!error &&
        typeof error === "object" &&
        (error as { type?: unknown }).type === "StripeInvalidRequestError"
    );
}

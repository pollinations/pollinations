import {
    AUTO_TOP_UP_PACK_MAX_USD,
    AUTO_TOP_UP_PACK_MIN_USD,
    AUTO_TOP_UP_THRESHOLD_POLLEN,
} from "@shared/billing/auto-top-up.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type Stripe from "stripe";
import { getPollenPack, type PollenPack } from "@/pollen-packs.ts";
import { createStripeClient } from "./stripe.ts";

const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
const METADATA_USER_ID = "pollinations_user_id";
const METADATA_PURPOSE = "pollinations_purpose";
const AUTO_TOP_UP_PURPOSE = "auto_top_up";
const AUTO_TOP_UP_CLAIM_TTL_MS = 5 * 60 * 1000;
const AUTO_TOP_UP_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED = "claimed";
const AUTO_TOP_UP_ATTEMPT_STATUS_FAILED = "failed";
const AUTO_TOP_UP_ATTEMPT_STATUS_PAID = "paid";
const AUTO_TOP_UP_ATTEMPT_STATUS_PENDING = "pending";
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
    status: string;
    updatedAt: number;
};

type AutoTopUpAttemptRow = {
    id: string;
    userId: string;
    stripeInvoiceId: string | null;
    amountUsd: number;
    pollenGrant: number;
    status: string;
};

type AutoTopUpInput = {
    enabled: boolean;
    packAmountUsd?: number;
};

export type AutoTopUpIssue =
    | {
          kind: "failed";
          reason: string;
          occurredAt: string;
      }
    | {
          kind: "pending_payment";
          invoiceUrl: string;
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
        ? await getDefaultPaymentMethod(stripe, customer)
        : null;
    const billingDetailsComplete = customer
        ? isBillingDetailsComplete(customer, paymentMethod)
        : false;
    const autoTopUpEnabled =
        user.autoTopUpEnabled && !!paymentMethod && billingDetailsComplete;

    const lastIssue = await getLastAutoTopUpIssue(env.DB, stripe, userId);

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

    if (!user.autoTopUpEnabled) {
        return { status: "skipped", reason: "auto top-up disabled" };
    }

    const threshold = AUTO_TOP_UP_THRESHOLD_POLLEN;
    if ((user.packBalance ?? 0) > threshold) {
        return { status: "skipped", reason: "paid balance above threshold" };
    }

    const pack = getPollenPack(String(user.autoTopUpAmountUsd)) as PollenPack;

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
        pollenGrant: pack.pollenGrant,
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

    if (attempt.status === AUTO_TOP_UP_ATTEMPT_STATUS_PAID) {
        return { credited: false, reason: "invoice already credited" };
    }

    const verification = verifyAutoTopUpInvoicePayment(invoice, attempt);
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
            AUTO_TOP_UP_ATTEMPT_STATUS_PAID,
            now,
            now,
            invoice.id,
            AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
            AUTO_TOP_UP_ATTEMPT_STATUS_FAILED,
        ),
        env.DB.prepare(
            `UPDATE user
                SET pack_balance = COALESCE(pack_balance, 0) + ?
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
    if (attemptChanges === 0) {
        return { credited: false, reason: "invoice already credited" };
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

    // An open invoice is still collectible in Stripe. Keep it pending so the
    // customer can complete payment there; terminal webhooks or stale
    // reconciliation will settle the local attempt.
    if (
        options.cleanupInvoice !== false &&
        options.disableAutoTopUp !== false &&
        invoice.status === "open"
    ) {
        const existing = await env.DB.prepare(
            `SELECT status
                FROM stripe_auto_top_up_attempt
                WHERE stripe_invoice_id = ?
                LIMIT 1`,
        )
            .bind(invoice.id)
            .first<{ status: string }>();
        if (existing?.status === AUTO_TOP_UP_ATTEMPT_STATUS_PENDING) return;
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

async function getUserStripeBillingRow(
    db: D1Database,
    userId: string,
): Promise<UserStripeBillingRow> {
    const [user] = await drizzle(db)
        .select({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            packBalance: userTable.packBalance,
            stripeCustomerId: userTable.stripeCustomerId,
            autoTopUpEnabled: userTable.autoTopUpEnabled,
            autoTopUpAmountUsd: userTable.autoTopUpAmountUsd,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    if (!user) {
        throw new Error("User not found");
    }

    return user;
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

async function getDefaultPaymentMethod(
    stripe: Stripe,
    customer: Stripe.Customer,
): Promise<Stripe.PaymentMethod | null> {
    const paymentMethodId = getStripeId(
        customer.invoice_settings?.default_payment_method,
    );
    if (!paymentMethodId) return null;

    return stripe.paymentMethods.retrieve(paymentMethodId);
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
                AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
                AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
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

async function reconcileStalePendingAttempt(
    env: CloudflareBindings,
    attempt: PendingAutoTopUpAttempt,
): Promise<"none" | "paid" | "failed"> {
    if (attempt.status !== AUTO_TOP_UP_ATTEMPT_STATUS_PENDING) return "none";
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
        pollenGrant: number;
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
                status,
                created_at,
                updated_at
            )
            SELECT ?, ?, NULL, ?, ?, ?, ?, ?
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
                    AND status IN (?, ?)
            )`,
        )
        .bind(
            input.attemptId,
            input.userId,
            input.amountUsd,
            input.pollenGrant,
            AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
            now,
            now,
            input.userId,
            AUTO_TOP_UP_THRESHOLD_POLLEN,
            input.userId,
            AUTO_TOP_UP_ATTEMPT_STATUS_CLAIMED,
            AUTO_TOP_UP_ATTEMPT_STATUS_PENDING,
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

function verifyAutoTopUpInvoicePayment(
    invoice: Stripe.Invoice,
    attempt: AutoTopUpAttemptRow,
): { ok: true } | { ok: false; reason: string } {
    if (invoice.status !== "paid") {
        return { ok: false, reason: "invoice status is not paid" };
    }

    if (invoice.amount_paid !== attempt.amountUsd * 100) {
        return { ok: false, reason: "amount mismatch" };
    }

    if (invoice.currency !== "usd") {
        return { ok: false, reason: "currency mismatch" };
    }

    return { ok: true };
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

async function getLastAutoTopUpIssue(
    db: D1Database,
    stripe: Stripe,
    userId: string,
): Promise<AutoTopUpIssue | null> {
    const row = await db
        .prepare(
            `SELECT status, failure_reason, completed_at, updated_at, created_at, stripe_invoice_id
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
            stripe_invoice_id: string | null;
        }>();
    if (!row) return null;
    const occurredAtMs = row.completed_at ?? row.updated_at ?? row.created_at;
    if (row.status === AUTO_TOP_UP_ATTEMPT_STATUS_PENDING) {
        if (!row.stripe_invoice_id) return null;
        try {
            const invoice = await stripe.invoices.retrieve(
                row.stripe_invoice_id,
            );
            if (
                invoice.status === "open" &&
                typeof invoice.hosted_invoice_url === "string"
            ) {
                return {
                    kind: "pending_payment",
                    invoiceUrl: invoice.hosted_invoice_url,
                    occurredAt: new Date(occurredAtMs).toISOString(),
                };
            }
        } catch (error) {
            console.warn("[auto-top-up] pending invoice lookup failed", {
                invoiceId: row.stripe_invoice_id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
    if (row.status !== AUTO_TOP_UP_ATTEMPT_STATUS_FAILED) {
        return null;
    }
    return {
        kind: "failed",
        reason: row.failure_reason ?? "Auto top-up could not be completed.",
        occurredAt: new Date(occurredAtMs).toISOString(),
    };
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

function getBillingReturnUrl(env: CloudflareBindings): string {
    const baseUrl = env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
    const url = new URL(baseUrl);
    url.searchParams.set("stripe_billing_return", "true");
    return url.toString();
}

function shouldDisableAutoTopUpAfterFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    if (isHardAuthenticationFailure(error)) return true;
    if (isSCARequiredError(error)) return false;
    const stripeType = (error as { type?: unknown }).type;
    return (
        stripeType === "StripeCardError" ||
        stripeType === "StripeInvalidRequestError"
    );
}

function isHardAuthenticationFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as { code?: unknown; raw?: { code?: unknown } };
    return (
        e.code === "payment_intent_authentication_failure" ||
        e.raw?.code === "payment_intent_authentication_failure"
    );
}

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
    ]);
    if (typeof e.code === "string" && codes.has(e.code)) return true;
    if (typeof e.raw?.code === "string" && codes.has(e.raw.code)) return true;
    if (e.payment_intent?.status === "requires_action") return true;
    if (e.raw?.payment_intent?.status === "requires_action") return true;
    return false;
}

import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import type Stripe from "stripe";
import { getPollenPack } from "@/pollen-packs.ts";
import { createStripeClient } from "./stripe.ts";

const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
const METADATA_USER_ID = "pollinations_user_id";
const METADATA_PURPOSE = "pollinations_purpose";
const AUTO_TOP_UP_PURPOSE = "auto_top_up";
const AUTO_TOP_UP_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const AUTO_TOP_UP_BACKOFF_MS = [
    60 * 60 * 1000, // 1h after 1st consecutive failure
    4 * 60 * 60 * 1000, // 4h after 2nd
    24 * 60 * 60 * 1000, // 24h after 3rd
];
const AUTO_TOP_UP_MIN_BACKOFF_MS = AUTO_TOP_UP_BACKOFF_MS[0];
const AUTO_TOP_UP_MAX_CONSECUTIVE_FAILURES = AUTO_TOP_UP_BACKOFF_MS.length + 1;
const AUTO_TOP_UP_ATTEMPT_STATUS_FAILED = "failed";
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

export const AUTO_TOP_UP_PACK_AMOUNTS = [5, 10, 20, 50, 100] as const;
export const DEFAULT_AUTO_TOP_UP_AMOUNT_USD = 20;

type UserStripeBillingDbRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: number | boolean | null;
    autoTopUpAmountUsd: number | null;
    autoTopUpLastAttemptAt: number | string | null;
};

type UserStripeBillingRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: boolean;
    autoTopUpAmountUsd: number | null;
    autoTopUpLastAttemptAt: number | null;
};

type PendingAutoTopUpAttempt = {
    id: string;
    stripeInvoiceId: string;
};

type AutoTopUpAttemptCreditRow = {
    id: string;
    userId: string;
    pollenGrant: number;
};

type AutoTopUpAttemptStatusRow = {
    id: string;
    status: string;
};

export type BillingPortalFlow = "default" | "payment_method_update";

export type AutoTopUpInput = {
    enabled: boolean;
    packAmountUsd: number;
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
        lastAttemptAt: string | null;
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
    | { status: "credited"; invoiceId: string; pollenCredited: number }
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
        ? isBillingDetailsComplete(customer)
        : false;
    let autoTopUpEnabled = user.autoTopUpEnabled;
    if (autoTopUpEnabled && (!paymentMethod || !billingDetailsComplete)) {
        await disableAutoTopUp(env.DB, userId);
        autoTopUpEnabled = false;
    }

    const lastIssue = await getLastAutoTopUpIssue(env.DB, userId);

    return {
        autoTopUp: {
            enabled: autoTopUpEnabled,
            thresholdPollen: AUTO_TOP_UP_THRESHOLD_POLLEN,
            packAmountUsd:
                user.autoTopUpAmountUsd ?? DEFAULT_AUTO_TOP_UP_AMOUNT_USD,
            lastAttemptAt: user.autoTopUpLastAttemptAt
                ? new Date(user.autoTopUpLastAttemptAt).toISOString()
                : null,
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
    flow: BillingPortalFlow = "default",
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
        ...(flow === "payment_method_update" && {
            flow_data: {
                type: "payment_method_update" as const,
                after_completion: {
                    type: "redirect" as const,
                    redirect: { return_url: returnUrl },
                },
            },
        }),
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
    const validationError = validateAutoTopUpInput(input);
    if (validationError) {
        return { ok: false, status: 400, error: validationError };
    }

    const packAmountUsd = input.packAmountUsd;

    if (input.enabled) {
        const stripe = createStripeClient(env);
        const customerId = await getOrCreateStripeCustomerId(env, userId);
        const customer = await retrieveActiveCustomer(stripe, customerId);
        const paymentMethod = await getDefaultCardPaymentMethod(
            stripe,
            customer,
        );

        if (!paymentMethod) {
            return {
                ok: false,
                status: 400,
                error: "Add a default payment method in Stripe before enabling auto top-up.",
            };
        }

        if (!isBillingDetailsComplete(customer)) {
            return {
                ok: false,
                status: 400,
                error: "Add billing details in Stripe before enabling auto top-up.",
            };
        }
    }

    await env.DB.prepare(
        `UPDATE user
            SET auto_top_up_enabled = ?,
                auto_top_up_amount_usd = ?,
                auto_top_up_last_attempt_at = NULL
            WHERE id = ?`,
    )
        .bind(input.enabled ? 1 : 0, packAmountUsd, userId)
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

    const consecutiveFailures = await countConsecutiveAutoTopUpFailures(
        env.DB,
        userId,
    );
    const retryMsRemaining = getAutoTopUpRetryMsRemaining(
        user.autoTopUpLastAttemptAt,
        consecutiveFailures,
    );
    if (retryMsRemaining > 0) {
        return {
            status: "skipped",
            reason: `auto top-up attempt cooldown (${Math.ceil(retryMsRemaining / 60_000)}m remaining)`,
        };
    }

    const pack = getPollenPack(String(amountUsd));
    if (!pack) {
        await disableAutoTopUp(env.DB, userId);
        return { status: "failed", reason: "invalid pack amount" };
    }

    const pendingAttempt = await findPendingAutoTopUpAttempt(env.DB, userId);
    if (pendingAttempt) {
        return {
            status: "skipped",
            reason: `auto top-up already pending (${pendingAttempt.stripeInvoiceId})`,
        };
    }

    const claimed = await claimAutoTopUpAttempt(env.DB, userId);
    if (!claimed) {
        return {
            status: "skipped",
            reason: "auto top-up already attempted recently",
        };
    }

    let createdInvoiceId: string | null = null;
    try {
        const stripe = createStripeClient(env);
        const customerId = await getOrCreateStripeCustomerId(env, userId);
        const customer = await retrieveActiveCustomer(stripe, customerId);
        const paymentMethod = await getDefaultCardPaymentMethod(
            stripe,
            customer,
        );

        if (!paymentMethod) {
            await disableAutoTopUp(env.DB, userId);
            return {
                status: "skipped",
                reason: "missing default payment method",
            };
        }

        if (!isBillingDetailsComplete(customer)) {
            await disableAutoTopUp(env.DB, userId);
            return { status: "skipped", reason: "missing billing details" };
        }

        const idempotencyKey = createAutoTopUpIdempotencyKey(userId, amountUsd);
        const metadata = {
            [METADATA_USER_ID]: userId,
            [METADATA_PURPOSE]: AUTO_TOP_UP_PURPOSE,
            packAmount: String(pack.amountUsd),
        };

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

        createdInvoiceId = invoice.id;
        await ensureAutoTopUpAttempt(env.DB, {
            invoiceId: invoice.id,
            userId,
            amountUsd: pack.amountUsd,
            pollenGrant: pack.pollenGrant,
            status: "pending",
        });

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

        if (paid.status === "paid") {
            const credit = await creditAutoTopUpInvoice(env, paid);
            if (credit.credited) {
                return {
                    status: "credited",
                    invoiceId: paid.id,
                    pollenCredited: credit.pollenCredited,
                };
            }
        }

        return { status: "created", invoiceId: paid.id };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Auto top-up failed.";
        await failPendingAutoTopUpAttempts(env.DB, userId, message);
        // Stripe does not always fire payment_failed for SCA-blocked off-session
        // invoices (they sit in requires_action waiting for user action that
        // will not come). Void here so the customer portal stays clean.
        if (createdInvoiceId) {
            await voidAutoTopUpInvoice(env, createdInvoiceId);
        }
        await recordAutoTopUpFailureAndMaybeDisable(env.DB, userId);
        return { status: "failed", reason: message };
    }
}

export async function processDueAutoTopUps(
    env: CloudflareBindings,
    limit = 50,
): Promise<AutoTopUpProcessResult[]> {
    const { results: users } = await env.DB.prepare(
        `SELECT id
            FROM user
            WHERE auto_top_up_enabled = 1
                AND auto_top_up_amount_usd IS NOT NULL
                AND COALESCE(pack_balance, 0) <= ?
                AND (
                    auto_top_up_last_attempt_at IS NULL
                    OR auto_top_up_last_attempt_at <= ?
                )
            LIMIT ?`,
    )
        .bind(
            AUTO_TOP_UP_THRESHOLD_POLLEN,
            Date.now() - AUTO_TOP_UP_MIN_BACKOFF_MS,
            limit,
        )
        .all<{ id: string }>();

    const results: AutoTopUpProcessResult[] = [];
    for (const user of users ?? []) {
        results.push(await processAutoTopUpForUser(env, user.id));
    }
    return results;
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

    const userId = metadata[METADATA_USER_ID];
    const pack = metadata.packAmount
        ? getPollenPack(metadata.packAmount)
        : null;
    if (!invoice.id || !userId || !pack) {
        return { credited: false, reason: "missing auto top-up metadata" };
    }

    await ensureAutoTopUpAttempt(env.DB, {
        invoiceId: invoice.id,
        userId,
        amountUsd: pack.amountUsd,
        pollenGrant: pack.pollenGrant,
        status: "pending",
    });

    const now = Date.now();
    const attempt = await env.DB.prepare(
        `UPDATE stripe_auto_top_up_attempt
            SET status = 'paid',
                failure_reason = NULL,
                completed_at = ?,
                updated_at = ?
            WHERE stripe_invoice_id = ? AND status <> 'paid'
            RETURNING id, user_id AS userId, pollen_grant AS pollenGrant`,
    )
        .bind(now, now, invoice.id)
        .first<AutoTopUpAttemptCreditRow>();

    if (!attempt) {
        return { credited: false, reason: "invoice already credited" };
    }

    await env.DB.prepare(
        `UPDATE user
            SET pack_balance = COALESCE(pack_balance, 0) + ?,
                auto_top_up_last_attempt_at = NULL
            WHERE id = ?`,
    )
        .bind(attempt.pollenGrant, attempt.userId)
        .run();

    return { credited: true, pollenCredited: attempt.pollenGrant };
}

export async function markAutoTopUpInvoiceFailed(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
    reason: string,
): Promise<void> {
    const metadata = invoice.metadata ?? {};
    if (metadata[METADATA_PURPOSE] !== AUTO_TOP_UP_PURPOSE) return;

    const userId = metadata[METADATA_USER_ID];
    const pack = metadata.packAmount
        ? getPollenPack(metadata.packAmount)
        : null;
    if (!invoice.id || !userId || !pack) return;

    await ensureAutoTopUpAttempt(env.DB, {
        invoiceId: invoice.id,
        userId,
        amountUsd: pack.amountUsd,
        pollenGrant: pack.pollenGrant,
        status: "pending",
    });

    const now = Date.now();
    const attempt = await env.DB.prepare(
        `UPDATE stripe_auto_top_up_attempt
            SET status = ?,
                failure_reason = ?,
                updated_at = ?,
                completed_at = ?
            WHERE stripe_invoice_id = ? AND status <> 'paid'
            RETURNING id, status`,
    )
        .bind(AUTO_TOP_UP_ATTEMPT_STATUS_FAILED, reason, now, now, invoice.id)
        .first<AutoTopUpAttemptStatusRow>();

    if (!attempt) return;

    await voidAutoTopUpInvoice(env, invoice.id);
    await preserveAutoTopUpLastAttemptAt(env.DB, userId, now);
    await recordAutoTopUpFailureAndMaybeDisable(env.DB, userId);
}

export async function markAutoTopUpInvoiceRequiresAction(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
): Promise<void> {
    const metadata = invoice.metadata ?? {};
    if (metadata[METADATA_PURPOSE] !== AUTO_TOP_UP_PURPOSE) return;

    const userId = metadata[METADATA_USER_ID];
    const pack = metadata.packAmount
        ? getPollenPack(metadata.packAmount)
        : null;
    if (!invoice.id || !userId || !pack) return;

    const hostedInvoiceUrl =
        typeof invoice.hosted_invoice_url === "string"
            ? invoice.hosted_invoice_url
            : null;
    const reason = hostedInvoiceUrl
        ? `Stripe requires additional payment authentication before auto top-up can complete. Complete payment in Stripe: ${hostedInvoiceUrl}`
        : "Stripe requires additional payment authentication before auto top-up can complete.";

    await ensureAutoTopUpAttempt(env.DB, {
        invoiceId: invoice.id,
        userId,
        amountUsd: pack.amountUsd,
        pollenGrant: pack.pollenGrant,
        status: "pending",
    });

    const now = Date.now();
    const attempt = await env.DB.prepare(
        `UPDATE stripe_auto_top_up_attempt
            SET status = ?,
                failure_reason = ?,
                updated_at = ?,
                completed_at = ?
            WHERE stripe_invoice_id = ?
                AND status NOT IN ('paid', ?)
            RETURNING id, status`,
    )
        .bind(
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
            reason,
            now,
            now,
            invoice.id,
            AUTO_TOP_UP_ATTEMPT_STATUS_REQUIRES_ACTION,
        )
        .first<AutoTopUpAttemptStatusRow>();

    if (!attempt) return;

    await voidAutoTopUpInvoice(env, invoice.id);
    // requires_action leaves the attempt timestamp in place so the next retry
    // waits for the normal auto top-up attempt window. It does not count toward
    // the consecutive-failure disable threshold.
    await preserveAutoTopUpLastAttemptAt(env.DB, userId, now);
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
                auto_top_up_amount_usd AS autoTopUpAmountUsd,
                auto_top_up_last_attempt_at AS autoTopUpLastAttemptAt
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
        autoTopUpEnabled:
            user.autoTopUpEnabled === true || user.autoTopUpEnabled === 1,
        autoTopUpLastAttemptAt: coerceTimestampMs(user.autoTopUpLastAttemptAt),
    };
}

async function retrieveActiveCustomer(
    stripe: Stripe,
    customerId: string,
): Promise<Stripe.Customer> {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
        throw new Error("Stripe customer was deleted");
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

function isBillingDetailsComplete(customer: Stripe.Customer): boolean {
    return (
        !!(customer.business_name || customer.name) &&
        !!customer.address?.country
    );
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

function validateAutoTopUpInput(input: AutoTopUpInput): string | null {
    if (
        !(AUTO_TOP_UP_PACK_AMOUNTS as readonly number[]).includes(
            input.packAmountUsd,
        )
    ) {
        return "Invalid auto top-up pack amount.";
    }
    return null;
}

async function findPendingAutoTopUpAttempt(
    db: D1Database,
    userId: string,
): Promise<PendingAutoTopUpAttempt | null> {
    return (
        (await db
            .prepare(
                `SELECT id, stripe_invoice_id AS stripeInvoiceId
                    FROM stripe_auto_top_up_attempt
                    WHERE user_id = ? AND status = 'pending'
                    ORDER BY created_at DESC
                    LIMIT 1`,
            )
            .bind(userId)
            .first<PendingAutoTopUpAttempt>()) ?? null
    );
}

async function ensureAutoTopUpAttempt(
    db: D1Database,
    input: {
        invoiceId: string;
        userId: string;
        amountUsd: number;
        pollenGrant: number;
        status: string;
    },
): Promise<void> {
    const now = Date.now();
    await db
        .prepare(
            `INSERT OR IGNORE INTO stripe_auto_top_up_attempt (
                id,
                user_id,
                stripe_invoice_id,
                amount_usd,
                pollen_grant,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            crypto.randomUUID(),
            input.userId,
            input.invoiceId,
            input.amountUsd,
            input.pollenGrant,
            input.status,
            now,
            now,
        )
        .run();
}

async function voidAutoTopUpInvoice(
    env: CloudflareBindings,
    invoiceId: string,
): Promise<void> {
    try {
        const stripe = createStripeClient(env);
        await stripe.invoices.voidInvoice(invoiceId);
    } catch (error) {
        // Voiding can fail if the invoice is already void/paid or if a
        // concurrent webhook handled it. Failing to void should not block the
        // failure-handling path that already updated our internal attempt row.
        console.warn(
            `[auto-top-up] failed to void invoice ${invoiceId}:`,
            error instanceof Error ? error.message : String(error),
        );
    }
}

async function getLastAutoTopUpIssue(
    db: D1Database,
    userId: string,
): Promise<AutoTopUpIssue | null> {
    const row = await db
        .prepare(
            `SELECT status, failure_reason, completed_at, created_at
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                ORDER BY COALESCE(completed_at, created_at) DESC
                LIMIT 1`,
        )
        .bind(userId)
        .first<{
            status: string;
            failure_reason: string | null;
            completed_at: number | null;
            created_at: number;
        }>();
    if (!row) return null;
    if (row.status !== "failed" && row.status !== "requires_action") {
        return null;
    }
    const occurredAtMs = row.completed_at ?? row.created_at;
    return {
        kind: row.status,
        reason: row.failure_reason ?? "Auto top-up could not be completed.",
        occurredAt: new Date(occurredAtMs).toISOString(),
    };
}

async function recordAutoTopUpFailureAndMaybeDisable(
    db: D1Database,
    userId: string,
): Promise<void> {
    const consecutiveFailures = await countConsecutiveAutoTopUpFailures(
        db,
        userId,
    );
    if (consecutiveFailures < AUTO_TOP_UP_MAX_CONSECUTIVE_FAILURES) return;

    await disableAutoTopUp(db, userId);
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

async function countConsecutiveAutoTopUpFailures(
    db: D1Database,
    userId: string,
): Promise<number> {
    // Pending attempts have completed_at = NULL. SQLite sorts NULLs first
    // ascending and last descending, so with `completed_at DESC` they fall to
    // the bottom of the window and never preempt a real terminal status. The
    // streak breaks on any non-'failed' row ('paid', 'requires_action',
    // 'pending'), so SCA prompts and successes both reset the counter.
    const { results } = await db
        .prepare(
            `SELECT id, status
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                ORDER BY completed_at DESC, created_at DESC
                LIMIT ?`,
        )
        .bind(userId, AUTO_TOP_UP_MAX_CONSECUTIVE_FAILURES)
        .all<AutoTopUpAttemptStatusRow>();

    let consecutiveFailures = 0;
    for (const attempt of results ?? []) {
        if (attempt.status !== AUTO_TOP_UP_ATTEMPT_STATUS_FAILED) break;
        consecutiveFailures += 1;
    }
    return consecutiveFailures;
}

async function failPendingAutoTopUpAttempts(
    db: D1Database,
    userId: string,
    reason: string,
): Promise<void> {
    const now = Date.now();
    await db
        .prepare(
            `UPDATE stripe_auto_top_up_attempt
                SET status = 'failed',
                    failure_reason = ?,
                    updated_at = ?,
                    completed_at = ?
                WHERE user_id = ? AND status = 'pending'`,
        )
        .bind(reason, now, now, userId)
        .run();
}

function coerceTimestampMs(value: number | string | null): number | null {
    if (value == null) return null;

    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function getAutoTopUpBackoffMs(consecutiveFailures: number): number {
    if (consecutiveFailures <= 0) return AUTO_TOP_UP_MIN_BACKOFF_MS;
    const idx = Math.min(
        consecutiveFailures - 1,
        AUTO_TOP_UP_BACKOFF_MS.length - 1,
    );
    return AUTO_TOP_UP_BACKOFF_MS[idx];
}

function getAutoTopUpRetryMsRemaining(
    lastAttemptAt: number | null,
    consecutiveFailures: number,
): number {
    if (!lastAttemptAt) return 0;
    const backoff = getAutoTopUpBackoffMs(consecutiveFailures);
    return Math.max(0, lastAttemptAt + backoff - Date.now());
}

async function claimAutoTopUpAttempt(
    db: D1Database,
    userId: string,
): Promise<boolean> {
    const now = Date.now();
    const retryCutoff = now - AUTO_TOP_UP_MIN_BACKOFF_MS;
    const claim = await db
        .prepare(
            `UPDATE user
                SET auto_top_up_last_attempt_at = ?
                WHERE id = ?
                    AND auto_top_up_enabled = 1
                    AND auto_top_up_amount_usd IS NOT NULL
                    AND COALESCE(pack_balance, 0) <= ?
                    AND (
                        auto_top_up_last_attempt_at IS NULL
                        OR auto_top_up_last_attempt_at <= ?
                    )
                RETURNING id`,
        )
        .bind(now, userId, AUTO_TOP_UP_THRESHOLD_POLLEN, retryCutoff)
        .first<{ id: string }>();

    return !!claim;
}

async function preserveAutoTopUpLastAttemptAt(
    db: D1Database,
    userId: string,
    timestamp: number,
): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_last_attempt_at = COALESCE(
                    auto_top_up_last_attempt_at,
                    ?
                )
                WHERE id = ?`,
        )
        .bind(timestamp, userId)
        .run();
}

function createAutoTopUpIdempotencyKey(
    userId: string,
    amountUsd: number,
): string {
    const bucket = Math.floor(Date.now() / AUTO_TOP_UP_IDEMPOTENCY_WINDOW_MS);
    return `pollinations:${userId}:auto-top-up:${amountUsd}:${bucket}`;
}

function getBillingReturnUrl(env: CloudflareBindings): string {
    const baseUrl = env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
    const url = new URL(baseUrl);
    url.searchParams.set("stripe_billing_return", "true");
    return url.toString();
}

import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import type Stripe from "stripe";
import { getPollenPack } from "@/pollen-packs.ts";
import { createStripeClient } from "./stripe.ts";

const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
const METADATA_USER_ID = "pollinations_user_id";
const METADATA_PURPOSE = "pollinations_purpose";
const AUTO_TOP_UP_PURPOSE = "auto_top_up";
const AUTO_TOP_UP_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
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

export const AUTO_TOP_UP_PACK_AMOUNTS = [10, 20, 50, 100] as const;
export const DEFAULT_AUTO_TOP_UP_AMOUNT_USD = 20;

type UserStripeBillingDbRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: number | boolean | null;
    autoTopUpAmountUsd: number | null;
    autoTopUpLastFailure: string | null;
    autoTopUpLastFailureAt: number | string | null;
};

type UserStripeBillingRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: boolean;
    autoTopUpAmountUsd: number | null;
    autoTopUpLastFailure: string | null;
    autoTopUpLastFailureAt: number | null;
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

export type BillingPortalFlow = "default" | "payment_method_update";

export type AutoTopUpInput = {
    enabled: boolean;
    packAmountUsd: number;
};

export type BillingOverview = {
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        lastFailure: string | null;
        lastFailureAt: string | null;
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
    let lastFailure = user.autoTopUpLastFailure;
    let lastFailureAt = user.autoTopUpLastFailureAt;
    if (autoTopUpEnabled && (!paymentMethod || !billingDetailsComplete)) {
        const reason = describeMissingBillingSetup(
            paymentMethod,
            billingDetailsComplete,
        );
        await disableAutoTopUp(env.DB, userId, reason);
        autoTopUpEnabled = false;
        lastFailure = reason;
        lastFailureAt = Date.now();
    }

    return {
        autoTopUp: {
            enabled: autoTopUpEnabled,
            thresholdPollen: AUTO_TOP_UP_THRESHOLD_POLLEN,
            packAmountUsd:
                user.autoTopUpAmountUsd ?? DEFAULT_AUTO_TOP_UP_AMOUNT_USD,
            lastFailure,
            lastFailureAt: lastFailureAt
                ? new Date(lastFailureAt).toISOString()
                : null,
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
        if (isBillingPortalConfigurationCurrent(existing)) {
            return existing.id;
        }

        const updated = await stripe.billingPortal.configurations.update(
            existing.id,
            createBillingPortalConfigurationParams(returnUrl),
        );
        return updated.id;
    }

    const created = await stripe.billingPortal.configurations.create(
        createBillingPortalConfigurationParams(returnUrl),
        {
            idempotencyKey: `pollinations:stripe-billing-portal:${BILLING_PORTAL_CONFIGURATION_METADATA_VALUE}`,
        },
    );
    return created.id;
}

function createBillingPortalConfigurationParams(
    returnUrl: string,
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
            },
        },
    };
}

function isBillingPortalConfigurationCurrent(
    configuration: Stripe.BillingPortal.Configuration,
): boolean {
    if (configuration.business_profile.headline !== BILLING_PORTAL_HEADLINE) {
        return false;
    }

    const customerUpdate = configuration.features.customer_update;
    if (!customerUpdate.enabled) return false;

    const allowedUpdates = new Set(customerUpdate.allowed_updates);
    return BILLING_PORTAL_CUSTOMER_UPDATES.every((update) =>
        allowedUpdates.has(update),
    );
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
                auto_top_up_last_failure = NULL,
                auto_top_up_last_failure_at = NULL
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

    const pack = getPollenPack(String(amountUsd));
    if (!pack) {
        await recordAutoTopUpFailure(
            env.DB,
            userId,
            "Configured auto top-up pack is unavailable.",
        );
        return { status: "failed", reason: "invalid pack amount" };
    }

    const pendingAttempt = await findPendingAutoTopUpAttempt(env.DB, userId);
    if (pendingAttempt) {
        return {
            status: "skipped",
            reason: `auto top-up already pending (${pendingAttempt.stripeInvoiceId})`,
        };
    }

    try {
        const stripe = createStripeClient(env);
        const customerId = await getOrCreateStripeCustomerId(env, userId);
        const customer = await retrieveActiveCustomer(stripe, customerId);
        const paymentMethod = await getDefaultCardPaymentMethod(
            stripe,
            customer,
        );

        if (!paymentMethod) {
            await disableAutoTopUp(
                env.DB,
                userId,
                "Auto top-up was disabled because your default payment method was removed in Stripe.",
            );
            return {
                status: "skipped",
                reason: "missing default payment method",
            };
        }

        if (!isBillingDetailsComplete(customer)) {
            await disableAutoTopUp(
                env.DB,
                userId,
                "Auto top-up was disabled because your billing details were removed in Stripe.",
            );
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
        await recordAutoTopUpFailure(env.DB, userId, message);
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
            LIMIT ?`,
    )
        .bind(AUTO_TOP_UP_THRESHOLD_POLLEN, limit)
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
                auto_top_up_last_failure = NULL,
                auto_top_up_last_failure_at = NULL
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
    await env.DB.prepare(
        `UPDATE stripe_auto_top_up_attempt
            SET status = 'failed',
                failure_reason = ?,
                updated_at = ?,
                completed_at = ?
            WHERE stripe_invoice_id = ?`,
    )
        .bind(reason, now, now, invoice.id)
        .run();

    await recordAutoTopUpFailure(env.DB, userId, reason);
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
                auto_top_up_last_failure AS autoTopUpLastFailure,
                auto_top_up_last_failure_at AS autoTopUpLastFailureAt
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
        autoTopUpLastFailureAt: coerceTimestampMs(user.autoTopUpLastFailureAt),
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

function describeMissingBillingSetup(
    paymentMethod: Stripe.PaymentMethod | null,
    billingDetailsComplete: boolean,
): string {
    if (!paymentMethod && !billingDetailsComplete) {
        return "Auto top-up was disabled because your default payment method and billing details were removed in Stripe.";
    }
    if (!paymentMethod) {
        return "Auto top-up was disabled because your default payment method was removed in Stripe.";
    }
    return "Auto top-up was disabled because your billing details were removed in Stripe.";
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

async function recordAutoTopUpFailure(
    db: D1Database,
    userId: string,
    message: string,
): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_last_failure = ?,
                    auto_top_up_last_failure_at = ?
                WHERE id = ?`,
        )
        .bind(message, Date.now(), userId)
        .run();
}

async function disableAutoTopUp(
    db: D1Database,
    userId: string,
    reason: string,
): Promise<void> {
    await db
        .prepare(
            `UPDATE user
                SET auto_top_up_enabled = 0,
                    auto_top_up_last_failure = ?,
                    auto_top_up_last_failure_at = ?
                WHERE id = ?
                    AND auto_top_up_enabled = 1`,
        )
        .bind(reason, Date.now(), userId)
        .run();
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

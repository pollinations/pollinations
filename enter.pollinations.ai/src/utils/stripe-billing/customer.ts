import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe.ts";
import {
    CUSTOMER_CREATE_IDEMPOTENCY_VERSION,
    METADATA_USER_ID,
} from "./constants.ts";
import type { UserStripeBillingRow } from "./types.ts";

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

export async function getUserStripeBillingRow(
    db: D1Database,
    userId: string,
): Promise<UserStripeBillingRow> {
    const [user] = await drizzle(db)
        .select({
            id: userTable.id,
            banned: userTable.banned,
            banExpires: userTable.banExpires,
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

export async function retrieveActiveCustomer(
    stripe: Stripe,
    customerId: string,
): Promise<Stripe.Customer | null> {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
        return null;
    }
    return customer;
}

export function getStripeId(
    value: string | { id?: string } | null | undefined,
) {
    return typeof value === "string" ? value : (value?.id ?? null);
}

/**
 * Make the card a buyer chose to save at Checkout their default card, so auto
 * top-up and the billing overview can use it. Never replaces an existing
 * default. Setting a default charges nothing.
 */
export async function saveCheckoutCardAsDefault(
    stripe: Stripe,
    session: Stripe.Checkout.Session,
): Promise<void> {
    const customerId = getStripeId(session.customer);
    const paymentIntentId = getStripeId(session.payment_intent);
    if (!customerId || !paymentIntentId) return;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentMethodId = getStripeId(paymentIntent.payment_method);
    if (!paymentMethodId) return;

    // Checkout marks cards saved through its checkbox with "always".
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (
        paymentMethod.type !== "card" ||
        paymentMethod.allow_redisplay !== "always" ||
        getStripeId(paymentMethod.customer) !== customerId
    ) {
        return;
    }

    const customer = await retrieveActiveCustomer(stripe, customerId);
    if (!customer || customer.invoice_settings?.default_payment_method) return;

    await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
    });
}

export async function getDefaultPaymentMethod(
    stripe: Stripe,
    customer: Stripe.Customer,
): Promise<Stripe.PaymentMethod | null> {
    const paymentMethodId = getStripeId(
        customer.invoice_settings?.default_payment_method,
    );
    if (!paymentMethodId) return null;

    return stripe.paymentMethods.retrieve(paymentMethodId);
}

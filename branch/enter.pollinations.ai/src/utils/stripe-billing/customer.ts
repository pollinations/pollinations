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

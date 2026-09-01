import type Stripe from "stripe";
import type { BillingOverview } from "./types.ts";

export function isBillingDetailsComplete(
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

export function getBillingDetailsSummary(
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

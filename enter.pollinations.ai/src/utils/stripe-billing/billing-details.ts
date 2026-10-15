import type Stripe from "stripe";
import type { BillingOverview } from "./types.ts";

export function isBillingDetailsComplete(
    customer: Stripe.Customer,
    paymentMethod: Stripe.PaymentMethod | null,
): boolean {
    const details = getBillingDetailsSummary(customer, paymentMethod);
    return (
        !!(details?.name || details?.company) && isTaxLocationComplete(details)
    );
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
    taxIds: Stripe.TaxId[] = [],
): BillingOverview["billingDetails"] {
    const address = customer.address ?? paymentMethod?.billing_details?.address;

    return {
        name: firstString(
            customer.individual_name,
            customer.name,
            paymentMethod?.billing_details?.name,
        ),
        company: firstString(customer.business_name),
        taxIds: taxIds.map((taxId) => ({
            type: taxId.type,
            value: taxId.value,
            verification: taxId.verification?.status ?? null,
        })),
        email: firstString(
            customer.email,
            paymentMethod?.billing_details?.email,
        ),
        line1: firstString(address?.line1),
        line2: firstString(address?.line2),
        city: firstString(address?.city),
        state: firstString(address?.state),
        postalCode: firstString(address?.postal_code),
        country: firstString(address?.country),
    };
}

function firstString(
    ...values: Array<string | null | undefined>
): string | null {
    return values.find((value) => typeof value === "string" && value) ?? null;
}

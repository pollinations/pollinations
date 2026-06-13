export type PaymentMethodSummary = {
    hasDefault: boolean;
    type: "card" | "sepa_debit" | "other" | null;
    brand: string | null;
    last4: string | null;
};

const BULLETS = "••••";

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Human label for the default payment method shown in the Auto top-up panel.
 * Cards show "💳 Visa •••• 4242"; SEPA mandates show
 * "🏦 SEPA Direct Debit •••• 3000" (IBAN last4); anything else is generic.
 */
export function formatPaymentMethodLabel(
    paymentMethod: PaymentMethodSummary | null,
): string {
    if (!paymentMethod?.hasDefault) return "None";
    switch (paymentMethod.type) {
        case "sepa_debit":
            return paymentMethod.last4
                ? `🏦 SEPA Direct Debit ${BULLETS} ${paymentMethod.last4}`
                : "🏦 SEPA Direct Debit";
        case "card": {
            const brand = paymentMethod.brand
                ? capitalize(paymentMethod.brand)
                : "Card";
            return paymentMethod.last4
                ? `💳 ${brand} ${BULLETS} ${paymentMethod.last4}`
                : `💳 ${brand}`;
        }
        default:
            return "🏦 Bank account";
    }
}

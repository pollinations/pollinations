import type {
    BillingOverview,
    BillingTaxId,
    SavedPaymentMethod,
} from "../../backend-types.ts";

const BRANDS: Record<string, string> = {
    amex: "American Express",
    cartes_bancaires: "Cartes Bancaires",
    diners: "Diners Club",
    discover: "Discover",
    eftpos_au: "eftpos",
    jcb: "JCB",
    mastercard: "Mastercard",
    unionpay: "UnionPay",
    visa: "Visa",
};

const WALLETS: Record<string, string> = {
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    link: "Link",
    samsung_pay: "Samsung Pay",
};

const TYPES: Record<string, string> = {
    card: "Card",
    link: "Link",
    paypal: "PayPal",
    revolut_pay: "Revolut Pay",
    sepa_debit: "SEPA Direct Debit",
};

const TAX_ID_STATUS: Record<
    NonNullable<BillingTaxId["verification"]>,
    string
> = {
    verified: "verified",
    pending: "being checked",
    unverified: "not verified",
    unavailable: "check unavailable",
};

/** "Visa •••• 4242", or the brand alone when Stripe has no last digits. */
export function formatCard(
    brand: string | null | undefined,
    last4: string | null | undefined,
): string {
    const name = (brand && BRANDS[brand]) || capitalize(brand || "Card");
    return last4 ? `${name} •••• ${last4}` : name;
}

/** The main line of a saved method: the card, or the account name. */
export function describePaymentMethod(method: SavedPaymentMethod): string {
    if (method.type === "card") return formatCard(method.brand, method.last4);
    const name =
        TYPES[method.type] ?? capitalize(method.type.replace(/_/g, " "));
    return method.last4 ? `${name} •••• ${method.last4}` : name;
}

/** Secondary details: expiry, the wallet a card came from, account email. */
export function paymentMethodDetails(method: SavedPaymentMethod): string[] {
    const details: string[] = [];
    if (method.expMonth && method.expYear)
        details.push(
            `exp ${String(method.expMonth).padStart(2, "0")}/${String(method.expYear).slice(-2)}`,
        );
    if (method.wallet) details.push(WALLETS[method.wallet] ?? method.wallet);
    if (method.email) details.push(method.email);
    return details;
}

export function formatTaxId(taxId: BillingTaxId): string {
    const status = taxId.verification && TAX_ID_STATUS[taxId.verification];
    return status ? `${taxId.value} · ${status}` : taxId.value;
}

/** One line, the way an invoice prints it: street, postcode city, country. */
export function formatAddress(
    details: NonNullable<BillingOverview["billingDetails"]>,
): string | null {
    const countryName = details.country
        ? (regionName(details.country) ?? details.country)
        : null;
    const parts = [
        details.line1,
        details.line2,
        [details.postalCode, details.city].filter(Boolean).join(" "),
        details.state,
        countryName,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
}

function regionName(code: string): string | undefined {
    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    } catch {
        return undefined;
    }
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

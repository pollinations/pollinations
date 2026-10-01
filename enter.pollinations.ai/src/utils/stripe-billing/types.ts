export type UserStripeBillingRow = {
    banned: boolean | null;
    banExpires: Date | null;
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    autoTopUpEnabled: boolean;
    autoTopUpAmountUsd: number | null;
};

export type PendingAutoTopUpAttempt = {
    id: string;
    stripeInvoiceId: string | null;
    status: string;
    updatedAt: number;
};

export type AutoTopUpAttemptRow = {
    id: string;
    userId: string;
    stripeInvoiceId: string | null;
    amountUsd: number;
    status: string;
};

export type AutoTopUpInput = {
    enabled: boolean;
    packAmountUsd?: number;
};

export type AutoTopUpIssue =
    | {
          kind: "failed";
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
        packAmountUsd: number;
        lastIssue: AutoTopUpIssue | null;
    };
    /** Every method Stripe saved for the buyer, default first. */
    paymentMethods: SavedPaymentMethod[];
    billingDetails: {
        name: string | null;
        company: string | null;
        taxIds: BillingTaxId[];
        email: string | null;
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
    } | null;
    billingDetailsComplete: boolean;
    /** Lets the wallet load Stripe.js before the buyer picks a pack. */
    publishableKey: string;
};

export type SavedPaymentMethod = {
    id: string;
    /** Stripe payment method type: card, paypal, link, sepa_debit, … */
    type: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    /** The wallet a card came from: apple_pay, google_pay, link, … */
    wallet: string | null;
    /** PayPal or Link account email. */
    email: string | null;
    isDefault: boolean;
};

export type BillingTaxId = {
    type: string;
    value: string;
    /** Stripe's check against the tax authority (EU VAT: VIES). */
    verification: "pending" | "verified" | "unverified" | "unavailable" | null;
};

export type AutoTopUpProcessResult =
    | { status: "skipped"; reason: string }
    | { status: "created"; invoiceId: string }
    | { status: "failed"; reason: string };

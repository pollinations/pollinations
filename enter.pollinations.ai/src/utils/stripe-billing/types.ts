export type UserStripeBillingRow = {
    id: string;
    name: string;
    email: string;
    packBalance: number | null;
    stripeCustomerId: string | null;
    stripePaymentRestriction: string | null;
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
          reason: string;
          occurredAt: string;
      }
    | {
          kind: "pending_payment";
          invoiceUrl: string;
          occurredAt: string;
      };

export type BillingOverview = {
    accountRestricted: boolean;
    autoTopUp: {
        enabled: boolean;
        thresholdPollen: number;
        packAmountUsd: number;
        serviceFeeCents: number;
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

export type AutoTopUpProcessResult =
    | { status: "skipped"; reason: string }
    | { status: "created"; invoiceId: string }
    | { status: "failed"; reason: string };

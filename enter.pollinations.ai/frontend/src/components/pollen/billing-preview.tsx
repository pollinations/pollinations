import { cn } from "@pollinations/ui";
import type { FC } from "react";
import type { BillingOverview } from "../../backend-types.ts";

/**
 * Local development only: swap the page's billing for each state the Top-up
 * and Billing cards can show. The loader applies it, so both cards get the
 * same data the backend would send. Taps still hit the real API.
 */

const CARD: BillingOverview["paymentMethods"][number] = {
    id: "pm_preview",
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2030,
    wallet: null,
    email: null,
    isDefault: true,
};

const ADDRESS: NonNullable<BillingOverview["billingDetails"]> = {
    name: "Ada Lovelace",
    company: null,
    taxIds: [],
    email: "ada@example.com",
    line1: "1 Rue de Test",
    line2: null,
    city: "Paris",
    state: null,
    postalCode: "75001",
    country: "FR",
};

// A decline as billing reports it: Stripe's reason from the failed charge.
const declined = (declineCode: string) => ({
    enabled: false,
    lastIssue: {
        kind: "failed" as const,
        declineCode,
        occurredAt: new Date().toISOString(),
    },
});

type Preview = {
    id: string;
    label: string;
    /** null: billing failed to load. */
    billing: (real: BillingOverview | null) => BillingOverview | null;
};

function withCard(
    real: BillingOverview | null,
    autoTopUp: Partial<BillingOverview["autoTopUp"]> = {},
): BillingOverview {
    return {
        autoTopUp: {
            enabled: false,
            packAmountUsd: 10,
            lastIssue: null,
            ...autoTopUp,
        },
        paymentMethods: [CARD],
        billingDetails: ADDRESS,
        billingDetailsComplete: true,
        publishableKey: real?.publishableKey ?? "",
    };
}

const BILLING_PREVIEWS: Preview[] = [
    {
        id: "card-on",
        label: "Card · automatic on",
        billing: (real) => withCard(real, { enabled: true }),
    },
    {
        id: "card-off",
        label: "Card · automatic off",
        billing: (real) => withCard(real),
    },
    {
        id: "no-card",
        label: "No card",
        billing: (real) => ({
            ...withCard(real),
            paymentMethods: [],
            billingDetails: null,
            billingDetailsComplete: false,
        }),
    },
    {
        id: "no-address",
        label: "Card · no address",
        billing: (real) => ({
            ...withCard(real),
            billingDetails: {
                ...ADDRESS,
                name: null,
                line1: null,
                city: null,
                postalCode: null,
                country: null,
            },
            billingDetailsComplete: false,
        }),
    },
    {
        id: "declined",
        label: "Declined · generic",
        billing: (real) => withCard(real, declined("generic_decline")),
    },
    {
        id: "declined-funds",
        label: "Declined · insufficient funds",
        billing: (real) => withCard(real, declined("insufficient_funds")),
    },
    {
        id: "declined-expired",
        label: "Declined · expired card",
        billing: (real) => withCard(real, declined("expired_card")),
    },
    {
        id: "bank-approval",
        label: "Bank asks to approve",
        billing: (real) =>
            withCard(real, {
                enabled: true,
                lastIssue: {
                    kind: "pending_payment",
                    invoiceUrl: "https://invoice.stripe.com/",
                    occurredAt: new Date().toISOString(),
                },
            }),
    },
    {
        id: "load-error",
        label: "Billing failed to load",
        billing: () => null,
    },
];

export function billingPreviewSearch(search: Record<string, unknown>): {
    preview?: string;
} {
    return BILLING_PREVIEWS.some(({ id }) => id === search.preview)
        ? { preview: search.preview as string }
        : {};
}

export function previewBilling(
    id: string,
    real: BillingOverview | null,
): BillingOverview | null {
    const preview = BILLING_PREVIEWS.find((p) => p.id === id);
    return preview ? preview.billing(real) : real;
}

/** Floating, bottom right: pick a state, or Real for the account's own. */
export const BillingPreviewSwitch: FC<{
    value?: string;
    onChange: (id?: string) => void;
}> = ({ value, onChange }) => (
    <div className="fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-2xl bg-surface-menu/90 p-2 text-xs shadow-lg backdrop-blur-md sm:max-w-md">
        <span className="px-1.5 font-bold uppercase tracking-wide text-theme-text-muted">
            Preview
        </span>
        {[{ id: undefined, label: "Real" }, ...BILLING_PREVIEWS].map(
            ({ id, label }) => (
                <button
                    key={label}
                    type="button"
                    aria-pressed={value === id}
                    onClick={() => onChange(id)}
                    className={cn(
                        "rounded-full px-2.5 py-1 font-semibold",
                        value === id
                            ? "bg-theme-text-strong text-surface-menu"
                            : "text-theme-text-soft hover:bg-theme-text-strong/10",
                    )}
                >
                    {label}
                </button>
            ),
        )}
    </div>
);

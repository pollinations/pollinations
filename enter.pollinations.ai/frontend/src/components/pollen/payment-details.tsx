import {
    CardIcon,
    InlineLink,
    LockIcon,
    Surface,
    WalletIcon,
} from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import type { BillingOverview } from "../../backend-types.ts";
import { openBillingPortal } from "../../lib/billing-portal.ts";
import {
    describePaymentMethod,
    formatAddress,
    formatTaxId,
    paymentMethodDetails,
} from "./payment-method-format.ts";
import { Footnotes, PaymentHelp } from "./pollen-balance.tsx";

/**
 * What Stripe holds for the buyer: the card(s) and the details invoices and
 * tax use. Shown here, edited only on Stripe (EditOnStripeLink).
 */
export const BillingPanel: FC<{ billing: BillingOverview }> = ({ billing }) => (
    <>
        <div className="grid gap-3 sm:grid-cols-2">
            <Surface className="flex flex-col gap-2">
                <CardHeading>Payment method</CardHeading>
                <PaymentMethods methods={billing.paymentMethods} />
            </Surface>
            <Surface className="flex flex-col gap-2">
                <CardHeading>Details</CardHeading>
                <Details details={billing.billingDetails} />
            </Surface>
        </div>
        {/* Where this data lives: true as written, no broader claim. */}
        <Footnotes>
            <p className="flex items-start gap-1.5">
                <LockIcon
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                    Your card and billing details are stored by Stripe.
                    Pollinations never sees your card number.
                </span>
            </p>
            <PaymentHelp />
        </Footnotes>
    </>
);

const CardHeading: FC<{ children: ReactNode }> = ({ children }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-text-muted">
        {children}
    </h3>
);

const PaymentMethods: FC<{ methods: BillingOverview["paymentMethods"] }> = ({
    methods,
}) =>
    methods.length === 0 ? (
        <p className="text-sm text-theme-text-muted">
            None saved yet: tick “Save” at your next card payment
        </p>
    ) : (
        <ul className="flex flex-col gap-2">
            {methods.map((method) => (
                <li
                    key={method.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm tabular-nums"
                >
                    {method.type === "card" ? (
                        <CardIcon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-theme-text-muted"
                        />
                    ) : (
                        <WalletIcon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-theme-text-muted"
                        />
                    )}
                    <span className="font-semibold text-theme-text-strong">
                        {describePaymentMethod(method)}
                    </span>
                    <span className="text-theme-text-muted">
                        {paymentMethodDetails(method).join(" · ")}
                    </span>
                    {method.isDefault && methods.length > 1 && (
                        <span className="text-xs font-semibold text-theme-text-soft">
                            Default
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );

const Details: FC<{ details: BillingOverview["billingDetails"] }> = ({
    details,
}) => {
    const lines = details
        ? [
              details.company,
              details.name,
              ...details.taxIds.map(formatTaxId),
              formatAddress(details),
              details.email,
          ].filter((line): line is string => Boolean(line))
        : [];
    return lines.length === 0 ? (
        <p className="text-sm text-theme-text-muted">
            Added at your first purchase
        </p>
    ) : (
        <address className="flex flex-col gap-0.5 text-sm not-italic text-theme-text-strong">
            {lines.map((line) => (
                <span key={line} className="break-words">
                    {line}
                </span>
            ))}
        </address>
    );
};

/** Opens the Stripe Billing Portal; sits top right of the Billing section. */
export const EditOnStripeLink: FC<{
    returnToTopUp?: { redirect?: string };
}> = ({ returnToTopUp }) => (
    <PortalLink returnToTopUp={returnToTopUp}>Edit on Stripe</PortalLink>
);

const PortalLink: FC<{
    returnToTopUp?: { redirect?: string };
    children: ReactNode;
}> = ({ returnToTopUp, children }) => {
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <div className="flex flex-col items-end gap-1">
            <InlineLink
                as="button"
                type="button"
                external
                size="sm"
                disabled={opening}
                onClick={async () => {
                    setOpening(true);
                    const message = await openBillingPortal(returnToTopUp);
                    if (message) {
                        setError(message);
                        setOpening(false);
                    }
                }}
            >
                {opening ? "Opening…" : children}
            </InlineLink>
            {error && (
                <p role="alert" className="text-xs text-intent-danger-text">
                    {error}
                </p>
            )}
        </div>
    );
};

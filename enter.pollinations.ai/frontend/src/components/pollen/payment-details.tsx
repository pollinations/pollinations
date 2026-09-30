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
import { hasDefaultPaymentMethod } from "./auto-top-up-status.ts";
import {
    describePaymentMethod,
    formatAddress,
    formatTaxId,
    paymentMethodDetails,
} from "./payment-method-format.ts";
import { Footnotes, PaymentHelp } from "./pollen-balance.tsx";

/**
 * What Stripe holds for the buyer: the card(s) and the details invoices and
 * tax use. Shown here, edited only on Stripe (EditOnStripeLink). A problem
 * is a badge on the card or address it concerns; what it blocks and how to
 * fix it is said in Top-up.
 */
export const BillingPanel: FC<{ billing: BillingOverview }> = ({ billing }) => {
    const lastIssue = billing.autoTopUp.lastIssue;
    const declined = lastIssue?.kind === "failed" && !billing.autoTopUp.enabled;
    const incomplete =
        hasDefaultPaymentMethod(billing) && !billing.billingDetailsComplete;
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                <Surface className="flex flex-col gap-2">
                    <CardHeading>Payment method</CardHeading>
                    <PaymentMethods
                        methods={billing.paymentMethods}
                        declined={declined}
                    />
                </Surface>
                <Surface className="flex flex-col gap-2">
                    <CardHeading>Details</CardHeading>
                    <Details
                        details={billing.billingDetails}
                        incomplete={incomplete}
                    />
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
};

const CardHeading: FC<{ children: ReactNode }> = ({ children }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-text-muted">
        {children}
    </h3>
);

const PaymentMethods: FC<{
    methods: BillingOverview["paymentMethods"];
    /** Auto top-up was declined on the default card. */
    declined?: boolean;
}> = ({ methods, declined = false }) =>
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
                    {method.isDefault && declined && <Badge>Declined</Badge>}
                </li>
            ))}
        </ul>
    );

const Details: FC<{
    details: BillingOverview["billingDetails"];
    /** Missing the name or tax location auto top-up needs. */
    incomplete?: boolean;
}> = ({ details, incomplete = false }) => {
    const address = details ? formatAddress(details) : null;
    const lines = details
        ? [
              details.company,
              details.name,
              ...details.taxIds.map(formatTaxId),
              address,
              details.email,
          ].filter((line): line is string => Boolean(line))
        : [];
    // The badge sits on the address, or alone when there is none.
    const badge = incomplete && <Badge>Incomplete</Badge>;
    return lines.length === 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-theme-text-muted">
            Added at your first purchase
            {badge}
        </p>
    ) : (
        <address className="flex flex-col items-start gap-0.5 text-sm not-italic text-theme-text-strong">
            {lines.map((line) => (
                <span
                    key={line}
                    className="flex flex-wrap items-center gap-x-2 break-words"
                >
                    {line}
                    {line === address && badge}
                </span>
            ))}
            {!address && badge}
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
        <span className="flex flex-col items-end gap-1">
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
                <span role="alert" className="text-xs text-intent-danger-text">
                    {error}
                </span>
            )}
        </span>
    );
};

/** A problem on the card or address it concerns, as one word. */
const Badge: FC<{ children: ReactNode }> = ({ children }) => (
    <span className="rounded-full bg-intent-danger-bg-light px-2 py-0.5 text-xs font-semibold text-intent-danger-text">
        {children}
    </span>
);

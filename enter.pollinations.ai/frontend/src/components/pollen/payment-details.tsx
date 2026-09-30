import {
    CardIcon,
    cn,
    InlineLink,
    LockIcon,
    Surface,
    WalletIcon,
    WarningIcon,
} from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import type { BillingOverview } from "../../backend-types.ts";
import { openBillingPortal } from "../../lib/billing-portal.ts";
import {
    autoTopUpStatus,
    hasDefaultPaymentMethod,
} from "./auto-top-up-status.ts";
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
 * with auto-refill shows on the card or address it concerns; Top-up only
 * points here.
 */
export const BillingPanel: FC<{ billing: BillingOverview }> = ({ billing }) => {
    const { text, action } = autoTopUpStatus(billing);
    const needsAddress =
        hasDefaultPaymentMethod(billing) && !billing.billingDetailsComplete;
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                <Surface className="flex flex-col gap-2">
                    <CardHeading>Payment method</CardHeading>
                    <PaymentMethods methods={billing.paymentMethods} />
                    {text && (
                        <Warning>
                            {text} ·{" "}
                            {action?.kind === "link" ? (
                                <InlineLink href={action.href} external>
                                    {action.label}
                                </InlineLink>
                            ) : (
                                <PortalLink inline>
                                    {action?.label ?? "Update card"}
                                </PortalLink>
                            )}
                        </Warning>
                    )}
                </Surface>
                <Surface className="flex flex-col gap-2">
                    <CardHeading>Details</CardHeading>
                    <Details details={billing.billingDetails} />
                    {needsAddress && (
                        <Warning>
                            Auto-refill needs your billing address ·{" "}
                            <PortalLink inline>Add</PortalLink>
                        </Warning>
                    )}
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

/** Header link, or inline in a sentence (a problem line in a card). */
const PortalLink: FC<{
    returnToTopUp?: { redirect?: string };
    inline?: boolean;
    children: ReactNode;
}> = ({ returnToTopUp, inline = false, children }) => {
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <span
            className={cn(
                "flex-col gap-1",
                inline ? "inline-flex" : "flex items-end",
            )}
        >
            <InlineLink
                as="button"
                type="button"
                external
                size={inline ? undefined : "sm"}
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

/** A problem on the card or address it concerns, with what to do. */
const Warning: FC<{ children: ReactNode }> = ({ children }) => (
    <p
        role="alert"
        className="flex items-start gap-1.5 text-[13px] leading-5 text-intent-danger-text"
    >
        <WarningIcon
            aria-hidden="true"
            className="mt-[3px] h-3.5 w-3.5 shrink-0"
        />
        <span>{children}</span>
    </p>
);

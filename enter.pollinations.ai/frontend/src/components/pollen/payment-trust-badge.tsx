import { cn, LockIcon } from "@pollinations/ui";
import type { FC } from "react";

const paymentMethods = [
    { name: "Visa", src: "/payment-icons/visa.svg" },
    { name: "Mastercard", src: "/payment-icons/mastercard.svg" },
    { name: "PayPal", src: "/payment-icons/paypal.svg" },
    { name: "Apple Pay", src: "/payment-icons/apple-pay.svg" },
    { name: "Google Pay", src: "/payment-icons/google-pay.svg" },
];

type PaymentTrustBadgeProps = {
    className?: string;
};

export const PaymentTrustBadge: FC<PaymentTrustBadgeProps> = ({
    className,
}) => {
    return (
        <div
            className={cn(
                "mt-2 flex w-full flex-wrap items-start gap-x-2 gap-y-1 pt-6 text-[13px] leading-snug text-theme-text-muted",
                className,
            )}
        >
            {/* Placed like every footnote line; the taller logos hang
                below the text instead of pushing the line down. */}
            <span className="inline-flex items-start gap-1.5">
                <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Secure checkout by Stripe</span>
            </span>
            <span className="-mb-1.5 inline-flex flex-wrap items-center gap-1.5">
                {paymentMethods.map((method) => (
                    <img
                        key={method.name}
                        src={method.src}
                        alt={method.name}
                        className="h-6 w-auto opacity-70"
                        loading="lazy"
                    />
                ))}
            </span>
        </div>
    );
};

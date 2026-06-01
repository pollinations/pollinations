import { cn, LockIcon } from "@pollinations_ai/ui";
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
                "mt-2 flex w-full flex-wrap items-center gap-x-2 gap-y-1 pt-6 text-[13px] leading-snug text-amber-950/45",
                className,
            )}
        >
            <span className="inline-flex items-center gap-1.5">
                <LockIcon className="h-3.5 w-3.5" />
                <span>Secure checkout powered by Stripe</span>
            </span>
            <span aria-hidden>—</span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
                {paymentMethods.map((method) => (
                    <img
                        key={method.name}
                        src={method.src}
                        alt={method.name}
                        className="h-6 w-auto opacity-70 transition-opacity hover:opacity-100"
                        loading="lazy"
                    />
                ))}
            </span>
        </div>
    );
};

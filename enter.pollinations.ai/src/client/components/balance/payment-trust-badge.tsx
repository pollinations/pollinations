import type { FC } from "react";
import { cn } from "../../../util.ts";

const paymentMethods = [
    { name: "Visa", src: "/payment-icons/visa.svg" },
    { name: "Mastercard", src: "/payment-icons/mastercard.svg" },
    { name: "PayPal", src: "/payment-icons/paypal.svg" },
    { name: "Apple Pay", src: "/payment-icons/apple-pay.svg" },
    { name: "Google Pay", src: "/payment-icons/google-pay.svg" },
];

const LockIcon: FC = () => (
    <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

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
                <LockIcon />
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

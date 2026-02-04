import type { FC } from "react";

const paymentMethods = [
    { name: "Visa", src: "/payment-icons/visa.svg" },
    { name: "Mastercard", src: "/payment-icons/mastercard.svg" },
    { name: "American Express", src: "/payment-icons/american-express.svg" },
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
    >
        <title>Secure</title>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

export const PaymentTrustBadge: FC = () => {
    return (
        <div className="flex flex-col items-center gap-3 pt-6 mt-2">
            <div className="flex flex-wrap justify-center items-center gap-2">
                {paymentMethods.map((method) => (
                    <img
                        key={method.name}
                        src={method.src}
                        alt={method.name}
                        className="h-7 w-auto opacity-70 hover:opacity-100 transition-opacity"
                        loading="lazy"
                    />
                ))}
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                <LockIcon />
                <span>Secure checkout powered by Stripe</span>
            </div>
        </div>
    );
};

import { cn, LockIcon } from "@pollinations/ui";
import type { FC } from "react";

const NAMES: Record<string, string> = {
    upi: "UPI",
    pix: "Pix",
    alipay: "Alipay",
    blik: "BLIK",
    p24: "Przelewy24",
    eps: "EPS",
    mobilepay: "MobilePay",
    "ideal-wero": "iDEAL | Wero",
    bancontact: "Bancontact",
    "mb-way": "MB WAY",
    multibanco: "Multibanco",
    satispay: "Satispay",
    "kakao-pay": "Kakao Pay",
    "naver-pay": "Naver Pay",
    payco: "PAYCO",
    "samsung-pay": "Samsung Pay",
    visa: "Visa",
    mastercard: "Mastercard",
    paypal: "PayPal",
    "apple-pay": "Apple Pay",
    "google-pay": "Google Pay",
    crypto: "Crypto",
};

/** Local examples; Stripe decides which methods appear at checkout. */
const LOCAL_METHODS: Record<string, string[]> = {
    IN: ["upi"],
    BR: ["pix"],
    CN: ["alipay"],
    PL: ["blik", "p24"],
    AT: ["eps"],
    DK: ["mobilepay"],
    FI: ["mobilepay"],
    NL: ["ideal-wero"],
    BE: ["bancontact"],
    PT: ["mb-way", "multibanco"],
    IT: ["satispay"],
    KR: ["kakao-pay", "naver-pay", "payco", "samsung-pay"],
};

/** Payment-method examples for this country, local ones first. */
export function paymentMethods(country?: string | null): string[] {
    return [
        ...(LOCAL_METHODS[country ?? ""] ?? []),
        "visa",
        "mastercard",
        "paypal",
        "apple-pay",
        "google-pay",
        "crypto",
    ];
}

type PaymentTrustBadgeProps = {
    className?: string;
    /** The buyer's IP country (ISO code). */
    country?: string | null;
};

export const PaymentTrustBadge: FC<PaymentTrustBadgeProps> = ({
    className,
    country,
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
                {paymentMethods(country).map((method) => (
                    <img
                        key={method}
                        src={`/payment-icons/${method}.svg`}
                        alt={NAMES[method]}
                        className="h-6 w-auto opacity-70"
                        loading="lazy"
                    />
                ))}
            </span>
        </div>
    );
};

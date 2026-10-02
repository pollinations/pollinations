import { cn, LockIcon } from "@pollinations/ui";
import type { FC } from "react";

const NAMES: Record<string, string> = {
    upi: "UPI",
    pix: "Pix",
    alipay: "Alipay",
    blik: "BLIK",
    "ideal-wero": "iDEAL | Wero",
    bancontact: "Bancontact",
    "mb-way": "MB WAY",
    satispay: "Satispay",
    "kakao-pay": "Kakao Pay",
    "naver-pay": "Naver Pay",
    visa: "Visa",
    mastercard: "Mastercard",
    paypal: "PayPal",
    "apple-pay": "Apple Pay",
    "google-pay": "Google Pay",
};

/**
 * Checkout prices in the buyer's local currency (Stripe Adaptive Pricing,
 * by IP location), which is what makes these methods appear.
 */
const LOCAL_METHODS: Record<string, string[]> = {
    IN: ["upi"],
    BR: ["pix"],
    CN: ["alipay"],
    PL: ["blik"],
    NL: ["ideal-wero"],
    BE: ["bancontact"],
    PT: ["mb-way"],
    IT: ["satispay"],
    KR: ["kakao-pay", "naver-pay"],
};

/** Countries whose checkout currency PayPal accepts, including USD fallback. */
const PAYPAL_COUNTRIES = new Set([
    ...["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR"],
    ...["IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"],
    ...["AD", "MC", "ME", "SM", "VA", "US", "PR", "EC", "SV"],
    ...["GB", "CH", "LI", "CZ", "DK", "NO", "PL", "SE"],
    ...["AU", "CA", "HK", "NZ", "SG"],
    "AR", // Argentina's checkout stays in USD.
]);

/** The methods checkout offers a buyer in this country, local ones first. */
export function paymentMethods(country?: string | null): string[] {
    return [
        ...(LOCAL_METHODS[country ?? ""] ?? []),
        "visa",
        "mastercard",
        ...(!country || PAYPAL_COUNTRIES.has(country) ? ["paypal"] : []),
        "apple-pay",
        "google-pay",
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

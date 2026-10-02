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
};

/**
 * Local examples from the live top-up configuration, checked 2026-10-02.
 * Stripe determines eligibility for the actual currency, amount and device.
 */
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

/**
 * Adaptive Pricing markets whose local currencies PayPal doesn't accept.
 * Unknown locations and markets without localization keep the USD fallback.
 * Checked 2026-10-02 against Stripe's supported markets and PayPal currencies:
 * https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing#supported-currencies
 * https://docs.stripe.com/payments/paypal
 */
const LOCAL_CURRENCY_WITHOUT_PAYPAL = new Set([
    "AE",
    "AF",
    "AG",
    "AL",
    "AM",
    "AO",
    "AW",
    "AZ",
    "BA",
    "BB",
    "BD",
    "BF",
    "BI",
    "BJ",
    "BM",
    "BN",
    "BO",
    "BR",
    "BS",
    "BW",
    "BZ",
    "CF",
    "CG",
    "CI",
    "CL",
    "CM",
    "CN",
    "CO",
    "CR",
    "CV",
    "DJ",
    "DM",
    "DO",
    "DZ",
    "FK",
    "GA",
    "GD",
    "GE",
    "GI",
    "GM",
    "GN",
    "GQ",
    "GT",
    "GW",
    "GY",
    "HN",
    "HT",
    "HU",
    "ID",
    "IL",
    "IN",
    "IS",
    "JM",
    "JP",
    "KE",
    "KG",
    "KH",
    "KN",
    "KR",
    "KY",
    "KZ",
    "LC",
    "LK",
    "LR",
    "MA",
    "MD",
    "MG",
    "MK",
    "ML",
    "MN",
    "MO",
    "MU",
    "MV",
    "MX",
    "MY",
    "MZ",
    "NA",
    "NC",
    "NE",
    "NP",
    "PE",
    "PF",
    "PH",
    "PK",
    "PY",
    "QA",
    "RO",
    "RS",
    "RW",
    "SA",
    "SH",
    "SN",
    "ST",
    "TD",
    "TG",
    "TH",
    "TJ",
    "TR",
    "TT",
    "TW",
    "TZ",
    "UA",
    "UG",
    "UY",
    "UZ",
    "VC",
    "VN",
    "WF",
    "YE",
    "ZA",
    "ZM",
]);

/** Payment-method examples for this country, local ones first. */
export function paymentMethods(country?: string | null): string[] {
    return [
        ...(LOCAL_METHODS[country ?? ""] ?? []),
        "visa",
        "mastercard",
        ...(LOCAL_CURRENCY_WITHOUT_PAYPAL.has(country ?? "") ? [] : ["paypal"]),
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

import { cn, LockIcon } from "@pollinations/ui";
import type { FC } from "react";

type PaymentLogo = { name: string; file: string };

const CARD_AND_WALLET_LOGOS: PaymentLogo[] = [
    { name: "Visa", file: "visa" },
    { name: "Mastercard", file: "mastercard" },
    { name: "PayPal", file: "paypal" },
    { name: "Apple Pay", file: "apple-pay" },
    { name: "Google Pay", file: "google-pay" },
];

/**
 * The buyer's local methods, shown first. Checkout picks its currency from
 * the buyer's location (Adaptive Pricing), and each of these needs the home
 * currency. All are on in the live checkout configuration and have taken
 * live payments.
 */
const LOCAL_LOGOS: Record<string, PaymentLogo[]> = {
    IN: [{ name: "UPI", file: "upi" }],
    BR: [{ name: "Pix", file: "pix" }],
    CN: [{ name: "Alipay", file: "alipay" }],
    PL: [{ name: "BLIK", file: "blik" }],
    NL: [{ name: "iDEAL | Wero", file: "ideal-wero" }],
    BE: [{ name: "Bancontact", file: "bancontact" }],
    PT: [{ name: "MB WAY", file: "mb-way" }],
    IT: [{ name: "Satispay", file: "satispay" }],
    KR: [
        { name: "Kakao Pay", file: "kakao-pay" },
        { name: "Naver Pay", file: "naver-pay" },
    ],
};

/**
 * Countries whose checkout currency PayPal accepts (EUR, GBP, USD, CHF, CZK,
 * DKK, NOK, PLN, SEK, AUD, CAD, HKD, NZD, SGD). Elsewhere a localized
 * checkout hides PayPal until the buyer switches to USD.
 */
const PAYPAL_CURRENCY_COUNTRIES = new Set([
    ...["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR"],
    ...["IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"],
    ...["AD", "MC", "ME", "SM", "VA"],
    ...["US", "PR", "EC", "SV"],
    ...["GB", "CH", "LI", "CZ", "DK", "NO", "PL", "SE"],
    ...["AU", "CA", "HK", "NZ", "SG"],
]);

type PaymentTrustBadgeProps = {
    className?: string;
    /** The buyer's IP country (ISO code); unknown shows the general list. */
    country?: string | null;
};

export const PaymentTrustBadge: FC<PaymentTrustBadgeProps> = ({
    className,
    country,
}) => {
    const localLogos = (country && LOCAL_LOGOS[country]) || [];
    const notes = [
        !country &&
            "Also UPI, Pix, Alipay, iDEAL | Wero, BLIK, Revolut Pay and more, depending on your country.",
        !PAYPAL_CURRENCY_COUNTRIES.has(country ?? "") &&
            "PayPal missing? Switch the checkout currency to USD.",
    ].filter(Boolean);

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
                {[...localLogos, ...CARD_AND_WALLET_LOGOS].map((logo) => (
                    <img
                        key={logo.file}
                        src={`/payment-icons/${logo.file}.svg`}
                        alt={logo.name}
                        title={logo.name}
                        // The buyer's own method stands out at full opacity.
                        className={cn(
                            "h-6 w-auto",
                            !localLogos.includes(logo) && "opacity-70",
                        )}
                        loading="lazy"
                    />
                ))}
            </span>
            {notes.length > 0 && (
                <p className="mt-1.5 w-full">{notes.join(" ")}</p>
            )}
        </div>
    );
};

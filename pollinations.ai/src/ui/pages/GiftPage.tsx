import {
    POLLEN_GIFT_DEFAULT_AMOUNT,
    POLLEN_GIFT_PACKS,
} from "@shared/pollen-gifts.ts";
import {
    calculateServiceFeeCents,
    formatPollenPackValue,
    formatUsdCentsCompact,
} from "@shared/pollen-packs.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { LockKeyhole } from "lucide-react";
import { type FormEvent, useState } from "react";
import { GIFT_PAGE } from "../../copy/content/gift";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

const configuredEnterBaseUrl = import.meta.env.VITE_ENTER_BASE_URL?.replace(
    /\/+$/,
    "",
);
const enterBaseUrl =
    configuredEnterBaseUrl ||
    (import.meta.env.MODE === "staging"
        ? PUBLIC_URLS.enter.staging
        : import.meta.env.MODE === "production"
          ? PUBLIC_URLS.enter.production
          : "http://localhost:3000");

const paymentMethods = [
    { name: "Visa", path: "visa.svg" },
    { name: "Mastercard", path: "mastercard.svg" },
    { name: "PayPal", path: "paypal.svg" },
    { name: "Apple Pay", path: "apple-pay.svg" },
    { name: "Google Pay", path: "google-pay.svg" },
];

function responseError(payload: unknown, fallback: string): string {
    if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
    ) {
        return payload.error;
    }
    return fallback;
}

function GiftPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(GIFT_PAGE);
    const [selectedAmount, setSelectedAmount] = useState(
        POLLEN_GIFT_DEFAULT_AMOUNT,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const selectedIndex = Math.max(
        0,
        POLLEN_GIFT_PACKS.findIndex(
            (pack) => pack.amountUsd === selectedAmount,
        ),
    );
    const selectedPack =
        POLLEN_GIFT_PACKS[selectedIndex] ?? POLLEN_GIFT_PACKS[0];
    const lastIndex = Math.max(0, POLLEN_GIFT_PACKS.length - 1);
    const progressPercent =
        lastIndex > 0 ? (selectedIndex / lastIndex) * 100 : 100;
    const serviceFeeCents = selectedPack
        ? calculateServiceFeeCents(selectedPack.amountUsd * 100)
        : 0;
    const totalBeforeTaxCents =
        (selectedPack?.amountUsd ?? 0) * 100 + serviceFeeCents;
    const chargeLabel = formatUsdCentsCompact(totalBeforeTaxCents);

    useDocumentMeta(pageCopy.pageTitle, pageCopy.pageDescription);

    async function startCheckout(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedPack || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch(
                `${enterBaseUrl}/api/pollen-gifts/checkout`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: selectedPack.amountUsd }),
                },
            );
            const payload = (await response
                .json()
                .catch(() => null)) as unknown;

            if (!response.ok) {
                setError(responseError(payload, pageCopy.checkoutError));
                return;
            }

            if (
                !payload ||
                typeof payload !== "object" ||
                !("url" in payload) ||
                typeof payload.url !== "string"
            ) {
                setError(pageCopy.checkoutError);
                return;
            }

            window.location.assign(payload.url);
        } catch {
            setError(pageCopy.checkoutError);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                <Title spacing="tight">{pageCopy.title}</Title>
                <Body spacing="tight">{pageCopy.intro}</Body>
                <p className="mb-8 font-body text-sm font-semibold text-muted">
                    {pageCopy.pollenNote}
                </p>

                <form onSubmit={startCheckout}>
                    <div className="rounded-sub-card border-r-2 border-b-2 border-accent-strong bg-white p-5 shadow-[2px_2px_0_rgb(var(--accent-strong)_/_0.35)] md:p-6">
                        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6 sm:pb-20">
                            <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                                <label
                                    htmlFor="gift-pollen-slider"
                                    className="mb-3 block font-headline text-xs font-black uppercase tracking-wider text-dark"
                                >
                                    {pageCopy.amountLabel}
                                </label>
                                <div className="relative">
                                    <div className="flex h-8 items-center">
                                        <input
                                            id="gift-pollen-slider"
                                            type="range"
                                            min={0}
                                            max={lastIndex}
                                            step={1}
                                            value={selectedIndex}
                                            onChange={(event) => {
                                                const pack =
                                                    POLLEN_GIFT_PACKS[
                                                        Number(
                                                            event.currentTarget
                                                                .value,
                                                        )
                                                    ];
                                                if (pack) {
                                                    setSelectedAmount(
                                                        pack.amountUsd,
                                                    );
                                                    setError(null);
                                                }
                                            }}
                                            disabled={isSubmitting}
                                            aria-valuetext={
                                                selectedPack
                                                    ? `${selectedPack.amountUsd} Pollen`
                                                    : undefined
                                            }
                                            className="h-3 w-full cursor-pointer appearance-none border-2 border-dark disabled:cursor-not-allowed"
                                            style={{
                                                background: `linear-gradient(to right, rgb(var(--secondary-strong)) 0%, rgb(var(--secondary-strong)) ${progressPercent}%, white ${progressPercent}%, white 100%)`,
                                            }}
                                        />
                                    </div>
                                    <div className="absolute top-full right-0 left-0 mt-1 px-[10px] font-headline text-xs font-black tracking-tight text-muted tabular-nums">
                                        <div className="relative">
                                            {POLLEN_GIFT_PACKS.map(
                                                (pack, index) => {
                                                    const isSelected =
                                                        pack.amountUsd ===
                                                        selectedPack?.amountUsd;
                                                    const isFirst = index === 0;
                                                    const isLast =
                                                        lastIndex > 0 &&
                                                        index === lastIndex;
                                                    const alignment = isFirst
                                                        ? "-ml-[10px] translate-x-0 text-left"
                                                        : isLast
                                                          ? "ml-[10px] -translate-x-full text-right"
                                                          : "-translate-x-1/2 text-center";

                                                    return (
                                                        <span
                                                            key={pack.amountUsd}
                                                            className={`absolute top-0 whitespace-nowrap ${alignment}`}
                                                            style={{
                                                                left:
                                                                    lastIndex >
                                                                    0
                                                                        ? `${(index / lastIndex) * 100}%`
                                                                        : "0%",
                                                            }}
                                                        >
                                                            <span className="relative inline-block">
                                                                <span
                                                                    className={
                                                                        isSelected
                                                                            ? "inline-block text-2xl leading-none text-dark"
                                                                            : "inline-block"
                                                                    }
                                                                >
                                                                    {formatPollenPackValue(
                                                                        pack.amountUsd,
                                                                    )}
                                                                    {isSelected && (
                                                                        <span className="block text-sm font-bold leading-tight text-dark">
                                                                            pollen
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                {isSelected && (
                                                                    <span
                                                                        className={`absolute top-full mt-1 inline-flex flex-col whitespace-nowrap ${
                                                                            isFirst
                                                                                ? "left-0 items-start text-left"
                                                                                : isLast
                                                                                  ? "right-0 items-end text-right"
                                                                                  : "left-1/2 -translate-x-1/2 items-center text-center"
                                                                        }`}
                                                                    >
                                                                        <span className="border-2 border-dark bg-accent-strong px-2 py-0.5 text-sm text-dark">
                                                                            {
                                                                                chargeLabel
                                                                            }
                                                                        </span>
                                                                        <span className="mt-0.5 font-body text-[11px] font-semibold normal-case text-muted">
                                                                            {
                                                                                pageCopy.feePrefix
                                                                            }{" "}
                                                                            {formatUsdCentsCompact(
                                                                                serviceFeeCents,
                                                                            )}{" "}
                                                                            {
                                                                                pageCopy.feeSuffix
                                                                            }
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </span>
                                                    );
                                                },
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-36 self-start bg-accent-strong text-dark sm:shrink-0 sm:self-center"
                            >
                                {isSubmitting
                                    ? pageCopy.openingButton
                                    : pageCopy.buyButton}
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mt-4 border-2 border-dark bg-primary-light px-4 py-3 font-body text-sm font-semibold text-dark"
                        >
                            {error}
                        </div>
                    )}
                </form>

                <div className="mt-6 space-y-2 border-t-2 border-dark/15 pt-4 font-body text-xs font-semibold leading-relaxed text-muted">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex items-center gap-1.5">
                            <LockKeyhole className="h-3.5 w-3.5" />
                            {pageCopy.secureCheckout}
                        </span>
                        <span aria-hidden>—</span>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                            {paymentMethods.map((method) => (
                                <img
                                    key={method.name}
                                    src={`${enterBaseUrl}/payment-icons/${method.path}`}
                                    alt={method.name}
                                    className="h-6 w-auto opacity-70"
                                    loading="lazy"
                                />
                            ))}
                        </span>
                    </div>
                    <p>{pageCopy.giftCodeNote}</p>
                    <p>
                        {pageCopy.refundNote}{" "}
                        <a
                            href="/terms"
                            className="text-dark underline decoration-2 underline-offset-2"
                        >
                            {pageCopy.termsLabel}
                        </a>
                    </p>
                </div>

                <p className="mt-5 font-body text-sm font-semibold text-muted">
                    {pageCopy.redeemPrompt}{" "}
                    <a
                        href={`${enterBaseUrl}/redeem`}
                        className="text-dark underline decoration-2 underline-offset-2"
                    >
                        {pageCopy.redeemLink}
                    </a>
                </p>
            </PageCard>
        </PageContainer>
    );
}

export default GiftPage;

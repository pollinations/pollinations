import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { AutoTopUpPanel, type BillingState } from "./auto-top-up-panel.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
    paidWeek?: number;
    tierWeek?: number;
};

const BALANCE_DISPLAY_EPSILON = 0.0001;
const REFUND_POLICY_URL = "https://pollinations.ai/refunds";

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

const ClockIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);

const MailIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
    </svg>
);

const WalletIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2H5a2 2 0 0 0-2 2V7Z" />
        <path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" />
        <circle cx="17" cy="14" r="1.25" fill="currentColor" />
    </svg>
);

const TooltipList: FC<{
    title: string;
    emoji: string;
    items: string[];
    earned?: number;
}> = ({ title, emoji, items, earned }) => (
    <span className="block leading-snug">
        <span className="block font-semibold text-gray-900">
            {title} <span aria-hidden="true">{emoji}</span>
        </span>
        <ul className="mt-1.5 space-y-1 text-gray-700">
            {items.map((item) => (
                <li key={item} className="flex gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
        {earned !== undefined && earned > 0 && (
            <span className="mt-2 block border-t border-gray-200 pt-1.5 text-green-700 font-semibold">
                +{formatPollen(earned)}{" "}
                <span className="font-medium text-gray-600">
                    earned past 7d
                </span>
            </span>
        )}
    </span>
);

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    tier = "spore",
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const totalWeek = normalizeDisplayBalance(paidWeek + tierWeek);
    const hideTierColumn = tier === "microbe" && displayTierBalance === 0;

    return (
        <div className="flex flex-col gap-3">
            {/* Twin headline numbers: Paid + Tier as tinted cards */}
            <div
                className={
                    hideTierColumn
                        ? "grid grid-cols-1 gap-3"
                        : "grid grid-cols-2 gap-3"
                }
            >
                <div className="rounded-xl bg-paid-soft p-4">
                    <span className="flex items-center gap-2">
                        <span className="text-sm font-bold uppercase tracking-wide text-amber-900">
                            Paid
                        </span>
                        <InfoTip
                            label="About paid balance"
                            text={
                                <TooltipList
                                    title="Paid balance"
                                    emoji="💳"
                                    items={[
                                        "Pollen you bought",
                                        "Earnings from paid-side spend in your apps",
                                        "Used for paid-only models, or when Tier can't cover",
                                    ]}
                                    earned={paidWeek}
                                />
                            }
                        />
                    </span>
                    <div className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums leading-none tracking-tight text-paid-deep">
                        {formatPollen(displayPaidBalance)}
                    </div>
                    {paidWeek > 0 && (
                        <div className="mt-1.5 text-sm font-bold tabular-nums text-green-700">
                            +{formatPollen(paidWeek)}{" "}
                            <span className="font-medium text-amber-800/70">
                                / 7d
                            </span>
                        </div>
                    )}
                </div>
                {!hideTierColumn && (
                    <div className="rounded-xl bg-tier-soft p-4">
                        <span className="flex items-center gap-2">
                            <span className="text-sm font-bold uppercase tracking-wide text-amber-900">
                                Tier
                            </span>
                            <InfoTip
                                label="About tier balance"
                                text={
                                    <TooltipList
                                        title="Tier balance"
                                        emoji="🌱"
                                        items={[
                                            "Free Pollen that refills hourly",
                                            "Earnings from tier-side spend in your apps",
                                            "Used first for regular models, when it can cover",
                                        ]}
                                        earned={tierWeek}
                                    />
                                }
                            />
                        </span>
                        <div className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums leading-none tracking-tight text-tier-deep">
                            {formatPollen(displayTierBalance)}
                        </div>
                        {tierWeek > 0 && (
                            <div className="mt-1.5 text-sm font-bold tabular-nums text-green-700">
                                +{formatPollen(tierWeek)}{" "}
                                <span className="font-medium text-amber-800/70">
                                    / 7d
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Total + 7d earnings below */}
            <div className="flex items-start justify-between gap-3 pt-3">
                <span className="text-sm font-bold uppercase tracking-wide text-amber-900 pt-1">
                    Total
                </span>
                <div className="flex flex-col items-end leading-tight">
                    <span className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none tracking-tight text-amber-950">
                            {formatPollen(totalPollen)}
                        </span>
                        <span className="text-xs font-bold text-amber-900">
                            pollen
                        </span>
                    </span>
                    {totalWeek > 0 && (
                        <span className="mt-1 text-sm font-bold tabular-nums text-green-700">
                            +{formatPollen(totalWeek)}{" "}
                            <span className="font-medium text-amber-800/70">
                                / 7d
                            </span>
                        </span>
                    )}
                </div>
            </div>

            {/* Learn more */}
            <div className="mt-5 border-t border-amber-300/70 pt-5 text-[13px] leading-snug text-amber-950/45">
                <button
                    type="button"
                    onClick={() => {
                        const slug = "how-does-my-pollen-wallet-work";
                        if (window.location.hash === `#${slug}`) {
                            window.dispatchEvent(
                                new HashChangeEvent("hashchange"),
                            );
                        } else {
                            window.location.hash = slug;
                        }
                    }}
                    className="flex items-start gap-1.5 underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950"
                >
                    <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Learn more</span>
                </button>
            </div>
        </div>
    );
};

type SidebarWalletProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
    paidWeek?: number;
    tierWeek?: number;
    onClick?: () => void;
};

export const SidebarWallet: FC<SidebarWalletProps> = ({
    tierBalance,
    packBalance,
    tier = "spore",
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const hideTierSegment = tier === "microbe" && displayTierBalance === 0;

    return (
        <div className="px-3 py-1 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <span
                        className="h-2 w-2 rounded-full bg-paid-soft"
                        aria-hidden="true"
                    />
                    Paid
                </span>
                <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold tabular-nums text-amber-950 leading-none">
                        {formatPollen(displayPaidBalance)}
                    </span>
                    {paidWeek > 0 && (
                        <span className="text-3xs font-bold tabular-nums text-green-700">
                            +{formatPollen(paidWeek)}
                        </span>
                    )}
                </span>
            </div>
            {!hideTierSegment && (
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <span
                            className="h-2 w-2 rounded-full bg-tier-soft"
                            aria-hidden="true"
                        />
                        Tier
                    </span>
                    <span className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold tabular-nums text-amber-950 leading-none">
                            {formatPollen(displayTierBalance)}
                        </span>
                        {tierWeek > 0 && (
                            <span className="text-3xs font-bold tabular-nums text-green-700">
                                +{formatPollen(tierWeek)}
                            </span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
};

type BuyPollenPanelProps = {
    initialBillingState: BillingState | null;
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBillingState,
}) => {
    const [emailCopied, setEmailCopied] = useState(false);
    const [selectedPackAmount, setSelectedPackAmount] = useState(
        POLLEN_PACKS.find((pack) => pack.amountUsd === 5)?.amountUsd ??
            POLLEN_PACKS[0]?.amountUsd ??
            5,
    );
    const selectedPackIndex = Math.max(
        0,
        POLLEN_PACKS.findIndex((pack) => pack.amountUsd === selectedPackAmount),
    );
    const selectedPack = POLLEN_PACKS[selectedPackIndex] ?? POLLEN_PACKS[0];

    const copyEmail = () => {
        navigator.clipboard.writeText("billing@pollinations.ai");
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    };

    return (
        <>
            <div className="space-y-4">
                {selectedPack && (
                    <div className="flex w-full flex-col items-start gap-4 pb-10 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                        <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                            <PollenPackSlider
                                value={selectedPack.amountUsd}
                                onChange={setSelectedPackAmount}
                            />
                        </div>
                        <Tooltip
                            content={`Buy $${selectedPack.amountUsd} pollen pack`}
                            displayContents
                        >
                            <Button
                                as="a"
                                href={`/api/stripe/checkout/${selectedPack.amountUsd}`}
                                theme="amber"
                                className="w-28 min-w-0 self-start text-center shadow-none sm:shrink-0 sm:self-center"
                            >
                                Buy
                            </Button>
                        </Tooltip>
                    </div>
                )}
            </div>
            <div className="mt-5 border-t border-amber-300/70 pt-5">
                <AutoTopUpPanel initialBillingState={initialBillingState} />
            </div>
            <div className="mt-5 space-y-2 border-t border-amber-300/70 pt-5 text-[13px] leading-snug text-amber-950/45">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Credits are instant, never expire, and follow our{" "}
                        <a
                            href={REFUND_POLICY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950"
                        >
                            Refund Policy
                        </a>
                        .
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Payment issue or missing pollen?{" "}
                        <Tooltip
                            content={emailCopied ? "Copied!" : "Click to copy"}
                            onClick={copyEmail}
                        >
                            <span className="underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950">
                                {emailCopied
                                    ? "Copied!"
                                    : "billing@pollinations.ai"}
                            </span>
                        </Tooltip>{" "}
                        — we reply same day.
                    </span>
                </p>
                <PaymentTrustBadge className="mt-0 pt-0" />
            </div>
        </>
    );
};

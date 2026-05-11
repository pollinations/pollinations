import { type FC, useState } from "react";
import { PAID_COLOR, TIER_COLOR } from "@/client/lib/balance-colors.ts";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

const PAID_BAR = PAID_COLOR.bgClass;
const TIER_BAR = TIER_COLOR.bgClass;

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
    paidWeek?: number;
    tierWeek?: number;
};

const BALANCE_DISPLAY_EPSILON = 0.0001;

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

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
                <div className="rounded-xl bg-[#E08A52]/10 p-4">
                    <span className="flex items-center gap-2">
                        <span
                            className={`h-2 w-2 rounded-full ${PAID_BAR}`}
                            aria-hidden="true"
                        />
                        <span className="text-sm font-bold uppercase tracking-wide text-amber-900">
                            Paid
                        </span>
                        <InfoTip
                            tone="amber"
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
                    <div className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums leading-none tracking-tight text-[#7C3F1E]">
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
                    <div className="rounded-xl bg-[#FCD34D]/30 p-4">
                        <span className="flex items-center gap-2">
                            <span
                                className={`h-2 w-2 rounded-full ${TIER_BAR}`}
                                aria-hidden="true"
                            />
                            <span className="text-sm font-bold uppercase tracking-wide text-amber-900">
                                Tier
                            </span>
                            <InfoTip
                                tone="yellow"
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
                        <div className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums leading-none tracking-tight text-[#7A5807]">
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
            <div className="flex items-start justify-between gap-3 border-t border-amber-300/40 pt-3">
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
            <div className="pt-3 flex justify-start">
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
                    className="text-xs text-amber-700/80 hover:text-amber-900 underline decoration-amber-400/60 underline-offset-2"
                >
                    Learn more →
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
                        className={`h-2 w-2 rounded-full ${PAID_BAR}`}
                        aria-hidden="true"
                    />
                    Paid
                </span>
                <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold tabular-nums text-amber-950 leading-none">
                        {formatPollen(displayPaidBalance)}
                    </span>
                    {paidWeek > 0 && (
                        <span className="text-[10px] font-bold tabular-nums text-green-700">
                            +{formatPollen(paidWeek)}
                        </span>
                    )}
                </span>
            </div>
            {!hideTierSegment && (
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <span
                            className={`h-2 w-2 rounded-full ${TIER_BAR}`}
                            aria-hidden="true"
                        />
                        Tier
                    </span>
                    <span className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold tabular-nums text-amber-950 leading-none">
                            {formatPollen(displayTierBalance)}
                        </span>
                        {tierWeek > 0 && (
                            <span className="text-[10px] font-bold tabular-nums text-green-700">
                                +{formatPollen(tierWeek)}
                            </span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
};

export const BuyPollenPanel: FC = () => {
    const [emailCopied, setEmailCopied] = useState(false);

    const copyEmail = () => {
        navigator.clipboard.writeText("billing@pollinations.ai");
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    };

    return (
        <>
            <div className="space-y-4">
                <div className="space-y-1 text-center">
                    <p className="text-sm text-amber-800">
                        Choose a pack below. 🧪 Beta bonus is already included,
                        with larger packs getting more.
                    </p>
                </div>

                <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:grid-cols-3">
                    {POLLEN_PACKS.map((pack) => (
                        <Button
                            key={pack.amountUsd}
                            as="a"
                            href={`/api/stripe/checkout/${pack.amountUsd}`}
                            color="amber"
                            weight="light"
                            title={`Buy $${pack.amountUsd} pollen pack`}
                            className="btn-shimmer w-full min-w-0 justify-self-stretch whitespace-nowrap border border-amber-300/70 px-3 text-center text-xs shadow-none sm:text-sm"
                        >
                            <span className="font-semibold text-amber-900">
                                ${pack.amountUsd}
                            </span>
                            <span className="mx-2 text-amber-400">/</span>
                            <span className="font-medium text-amber-900">
                                🪷 {formatPollenPackValue(pack.pollenGrant)}
                            </span>
                        </Button>
                    ))}
                </div>

                <PaymentTrustBadge className="mt-0 pt-2" />
            </div>

            <div className="mt-5 space-y-3 border-t border-amber-300/70 pt-4 text-sm text-amber-900">
                <p className="font-medium">
                    💳 Want to pay with a different method?{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/4826"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline decoration-amber-400 underline-offset-2 hover:text-amber-700"
                    >
                        Vote for your preferred option
                    </a>
                </p>
                <p className="font-medium">
                    💬 Payment issue or missing pollen?{" "}
                    <Tooltip
                        content={emailCopied ? "Copied!" : "Click to copy"}
                        onClick={copyEmail}
                    >
                        <span className="font-medium underline decoration-amber-400 underline-offset-2 hover:text-amber-700">
                            {emailCopied
                                ? "Copied!"
                                : "billing@pollinations.ai"}
                        </span>
                    </Tooltip>{" "}
                    — we reply same day.
                </p>
            </div>
        </>
    );
};

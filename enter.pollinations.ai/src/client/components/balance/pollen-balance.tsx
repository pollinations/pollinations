import { getTierEmoji } from "@shared/tier-config.ts";
import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

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

type WalletRowProps = {
    emoji: string;
    label: string;
    value: number;
    earnedToday: number;
    tooltip: string;
    rowClass: string;
    labelClass: string;
    tagClass: string;
};

const WalletRow: FC<WalletRowProps> = ({
    emoji,
    label,
    value,
    earnedToday,
    tooltip,
    rowClass,
    labelClass,
    tagClass,
}) => (
    <Tooltip
        triggerAs="span"
        displayContents
        className={`flex flex-nowrap items-center gap-3 rounded-full px-5 py-3 cursor-default ${rowClass}`}
        content={
            <span className="block whitespace-pre-line leading-snug">
                {tooltip}
            </span>
        }
    >
        <span className="shrink-0 text-2xl leading-none" aria-hidden="true">
            {emoji}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
            <span
                className={`text-[11px] font-bold uppercase tracking-wide ${labelClass}`}
            >
                {label}
            </span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-950">
                    {formatPollen(value)}
                </span>
                {earnedToday > 0 && (
                    <span
                        className={`inline-flex items-baseline gap-1 text-sm font-bold tabular-nums ${tagClass}`}
                    >
                        <span aria-hidden="true">▲</span>
                        {formatPollen(earnedToday)}
                        <span className="text-xs font-medium opacity-70">
                            7d
                        </span>
                    </span>
                )}
            </span>
        </span>
    </Tooltip>
);

const TodayPulse: FC<{ amount: number }> = ({ amount }) => (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 tabular-nums">
        <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        + {formatPollen(amount)} this week
    </span>
);

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    tier = "spore",
    paidWeek = 0,
    tierWeek = 0,
}) => {
    const tierEmoji = getTierEmoji(tier);

    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const totalToday = normalizeDisplayBalance(paidWeek + tierWeek);
    const hideTierRow = tier === "microbe" && displayTierBalance === 0;

    return (
        <div className="flex flex-col gap-4">
            {totalToday > 0 && (
                <div className="flex justify-end">
                    <TodayPulse amount={totalToday} />
                </div>
            )}
            <div
                className={`grid gap-3 ${hideTierRow ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}
            >
                <WalletRow
                    emoji="🪷"
                    label="Paid"
                    value={displayPaidBalance}
                    earnedToday={paidWeek}
                    tooltip="💳 Paid balance — Pollen you bought, plus markup earnings from paid-side spend in your apps. Never expires."
                    rowClass="bg-amber-300"
                    labelClass="text-amber-900"
                    tagClass="text-emerald-800"
                />
                {!hideTierRow && (
                    <WalletRow
                        emoji={tierEmoji}
                        label="Tier"
                        value={displayTierBalance}
                        earnedToday={tierWeek}
                        tooltip={`${tierEmoji} Tier balance — your free hourly Pollen, plus markup earnings from tier-side spend in your apps.`}
                        rowClass="bg-pink-200"
                        labelClass="text-pink-900"
                        tagClass="text-emerald-800"
                    />
                )}
            </div>
            <div className="border-t border-dashed border-amber-300/70 pt-4 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-900">
                    Total Pollen
                </span>
                <span className="text-3xl sm:text-4xl font-bold tabular-nums text-amber-950">
                    {formatPollen(totalPollen)}
                </span>
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
    onClick,
}) => {
    const tierEmoji = getTierEmoji(tier);
    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const totalToday = normalizeDisplayBalance(paidWeek + tierWeek);
    const hideTierRow = tier === "microbe" && displayTierBalance === 0;

    const Row: FC<{
        emoji: string;
        label: string;
        value: number;
        earned: number;
        rowClass: string;
        labelClass: string;
        tagClass: string;
    }> = ({ emoji, label, value, earned, rowClass, labelClass, tagClass }) => (
        <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 ${rowClass}`}
        >
            <span className="text-sm leading-none" aria-hidden="true">
                {emoji}
            </span>
            <span
                className={`text-[10px] font-bold uppercase tracking-wide ${labelClass}`}
            >
                {label}
            </span>
            <span className="ml-auto flex items-baseline gap-1.5">
                <span className="text-sm font-bold tabular-nums text-amber-950">
                    {formatPollen(value)}
                </span>
                {earned > 0 && (
                    <span
                        className={`inline-flex items-baseline gap-0.5 text-[10px] font-bold tabular-nums ${tagClass}`}
                    >
                        <span aria-hidden="true">▲</span>
                        {formatPollen(earned)}
                    </span>
                )}
            </span>
        </span>
    );

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-2xl p-2 text-left transition-colors hover:bg-amber-100/40"
        >
            <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                    Wallet
                </span>
                <span className="flex items-baseline gap-2">
                    {totalToday > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 tabular-nums">
                            <span className="relative inline-flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            </span>
                            +{formatPollen(totalToday)}
                        </span>
                    )}
                    <span className="text-base font-bold tabular-nums text-amber-950">
                        {formatPollen(totalPollen)}
                    </span>
                </span>
            </div>
            <div className="flex flex-col gap-1">
                <Row
                    emoji="🪷"
                    label="Paid"
                    value={displayPaidBalance}
                    earned={paidWeek}
                    rowClass="bg-amber-300"
                    labelClass="text-amber-900"
                    tagClass="text-emerald-800"
                />
                {!hideTierRow && (
                    <Row
                        emoji={tierEmoji}
                        label="Tier"
                        value={displayTierBalance}
                        earned={tierWeek}
                        rowClass="bg-pink-200"
                        labelClass="text-pink-900"
                        tagClass="text-emerald-800"
                    />
                )}
            </div>
        </button>
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

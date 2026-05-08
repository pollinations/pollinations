import { getTierColor, getTierEmoji } from "@shared/tier-config.ts";
import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { pillColors } from "../layout/dashboard-theme.ts";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import {
    PollenPackBonusPill,
    PollenPackReadout,
    PollenPackSlider,
} from "./pollen-pack-controls.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    tier?: string;
};

type GaugeSegmentProps = {
    percentage: number;
    value: number;
    label: string;
    color: keyof typeof gaugeSegmentColors;
    tooltipText: string;
    position: "left" | "right";
    offset?: number;
};

const gaugeSegmentColors = {
    ...pillColors,
} as const;

const BALANCE_DISPLAY_EPSILON = 0.0001;

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

const PollenGaugeSegment: FC<GaugeSegmentProps> = ({
    percentage,
    value,
    label,
    color,
    tooltipText,
    position,
    offset = 0,
}) => {
    const { bg: bgColor, text: textColor } = gaugeSegmentColors[color];

    const style =
        position === "left"
            ? { left: 0, width: `${percentage}%` }
            : { left: `${offset}%`, width: `${percentage}%` };

    return (
        <Tooltip
            triggerAs="span"
            className={`absolute inset-y-0 ${bgColor} cursor-default transition-all duration-500 ease-out`}
            style={style}
            content={
                <span className="block whitespace-pre-line leading-snug">
                    {tooltipText}
                </span>
            }
        >
            <span className="absolute inset-0 flex items-center justify-center gap-0.5 sm:gap-1">
                <span
                    className={`${textColor} font-bold text-[11px] sm:text-sm whitespace-nowrap`}
                >
                    {label} {formatPollen(value)}
                </span>
            </span>
        </Tooltip>
    );
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    tier = "spore",
}) => {
    const tierEmoji = getTierEmoji(tier);
    const tierColor = getTierColor(tier) as GaugeSegmentProps["color"];

    const displayTierBalance = normalizeDisplayBalance(tierBalance);
    const displayPaidBalance = normalizeDisplayBalance(packBalance);
    const totalPollen = normalizeDisplayBalance(
        displayTierBalance + displayPaidBalance,
    );
    const tierAvailable = Math.max(0, displayTierBalance);
    const paidAvailable = Math.max(0, displayPaidBalance);
    const tierMagnitude = Math.abs(displayTierBalance);
    const paidMagnitude = Math.abs(displayPaidBalance);

    const gaugeHeightClass = "h-[30px] sm:h-[34px]";
    const hideTierGaugeSegment = tier === "microbe" && displayTierBalance === 0;

    // Each visible segment gets at least MIN_SEGMENT% so signed labels stay
    // readable. Debt buckets are indicators; positive available balances get
    // the surplus width so -1 debt does not look equivalent to +1 credit.
    const showPaid = displayPaidBalance !== 0;
    const showTier = !hideTierGaugeSegment && displayTierBalance !== 0;
    const visibleCount = (showPaid ? 1 : 0) + (showTier ? 1 : 0);
    const minSegment = visibleCount > 1 ? 28 : 20;

    let paidPercentage = 0;
    let freePercentage = 0;
    const magnitudeTotal = tierMagnitude + paidMagnitude;
    if (visibleCount === 0 || magnitudeTotal <= 0) {
        paidPercentage = 50;
        freePercentage = 50;
    } else {
        const surplus = 100 - minSegment * visibleCount;
        const availableTotal = tierAvailable + paidAvailable;
        const paidWeight =
            availableTotal > 0
                ? paidAvailable / availableTotal
                : paidMagnitude / magnitudeTotal;
        const tierWeight =
            availableTotal > 0
                ? tierAvailable / availableTotal
                : tierMagnitude / magnitudeTotal;

        if (showPaid) {
            paidPercentage = minSegment + paidWeight * surplus;
        }
        if (showTier) freePercentage = minSegment + tierWeight * surplus;
    }

    return (
        <div className="flex flex-row justify-center text-center pb-1">
            {/* Combined Pollen Gauge */}
            <div className="flex flex-col items-center gap-4 w-full">
                {/* Pollen amount above gauge */}
                <span className="block text-4xl sm:text-5xl md:text-6xl font-bold text-amber-950 tabular-nums">
                    {formatPollen(totalPollen)} pollen
                </span>
                {/* Gauge */}
                <div className="w-full max-w-[540px]">
                    <div
                        className={`relative ${gaugeHeightClass} bg-gray-200 rounded-full overflow-hidden border-2 border-amber-300`}
                    >
                        {/* Paid Pollen - Soft purple for paid (pack) */}
                        {paidPercentage > 0 && (
                            <PollenGaugeSegment
                                percentage={paidPercentage}
                                value={displayPaidBalance}
                                label="🪷"
                                color="amber"
                                tooltipText="💳 Paid balance — Pollen you bought, plus earnings from paid-side user spend in your apps. Never expires."
                                position="left"
                            />
                        )}
                        {/* Free Pollen - Soft teal for free */}
                        {!hideTierGaugeSegment && freePercentage > 0 && (
                            <PollenGaugeSegment
                                percentage={freePercentage}
                                value={displayTierBalance}
                                label={tierEmoji}
                                color={tierColor}
                                tooltipText={`${tierEmoji} Tier balance — your free hourly Pollen, plus earnings from tier-side user spend in your apps.`}
                                position="right"
                                offset={paidPercentage}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const BuyPollenPanel: FC = () => {
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
                    <div className="w-full space-y-3">
                        <PollenPackSlider
                            value={selectedPack.amountUsd}
                            onChange={setSelectedPackAmount}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                as="a"
                                href={`/api/stripe/checkout/${selectedPack.amountUsd}`}
                                color="amber"
                                weight="light"
                                title={`Buy $${selectedPack.amountUsd} pollen pack`}
                                className="btn-shimmer w-full min-w-0 border border-amber-300/70 text-center shadow-none sm:w-fit"
                            >
                                <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
                                    <span>Buy</span>
                                    <PollenPackReadout
                                        pack={selectedPack}
                                        showBonus={false}
                                        tone="button"
                                    />
                                </span>
                            </Button>
                            <PollenPackBonusPill
                                pack={selectedPack}
                                className="w-full text-center sm:w-auto sm:text-left"
                            />
                        </div>
                    </div>
                )}
            </div>
            <div className="mt-5 space-y-3 border-t border-amber-300/70 pt-4 text-sm text-amber-900">
                <PaymentTrustBadge className="mt-0 pt-0" />
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

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
    color: keyof typeof pillColors;
    tooltipText: string;
    position: "left" | "right";
    offset?: number;
};

const PollenGaugeSegment: FC<GaugeSegmentProps> = ({
    percentage,
    value,
    label,
    color,
    tooltipText,
    position,
    offset = 0,
}) => {
    const { bg: bgColor, text: textColor } = pillColors[color];

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
            <span className="absolute inset-0 flex items-center justify-center gap-1">
                <span
                    className={`${textColor} font-bold text-sm whitespace-nowrap`}
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

    // Clamp at 0 for display — individual buckets can go slightly negative from overage
    const displayTier = Math.max(0, tierBalance);
    const displayPaid = Math.max(0, packBalance);
    const totalPollen = displayTier + displayPaid;

    function calculatePercentage(value: number, total: number): number {
        return total > 0 ? (value / total) * 100 : 0;
    }

    const rawPaidPercentage = calculatePercentage(displayPaid, totalPollen);
    const gaugeHeightClass = "h-[30px] sm:h-[34px]";
    const hideTierGaugeSegment = tier === "microbe" && displayTier === 0;

    // Ensure both segments are always visible (min width to fit labels)
    const MIN_SEGMENT = 20;
    let paidPercentage: number;
    let freePercentage: number;
    if (hideTierGaugeSegment) {
        paidPercentage = displayPaid > 0 ? 100 : 0;
        freePercentage = 0;
    } else if (totalPollen > 0) {
        paidPercentage = Math.max(
            MIN_SEGMENT,
            Math.min(100 - MIN_SEGMENT, rawPaidPercentage),
        );
        freePercentage = 100 - paidPercentage;
    } else {
        paidPercentage = 50;
        freePercentage = 50;
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
                                value={displayPaid}
                                label="🪷"
                                color="amber"
                                tooltipText={`🪷 Purchased: ${formatPollen(displayPaid)} pollen\nFrom packs you've bought\nRequired for 🪷 Paid Only models; used after tier grants for others`}
                                position="left"
                            />
                        )}
                        {/* Free Pollen - Soft teal for free */}
                        {!hideTierGaugeSegment && freePercentage > 0 && (
                            <PollenGaugeSegment
                                percentage={freePercentage}
                                value={displayTier}
                                label={tierEmoji}
                                color={tierColor}
                                tooltipText={`${tierEmoji} Tier: ${formatPollen(displayTier)} pollen\nFree pollen from your tier, refills periodically\nUsed first, except for 🪷 Paid Only models`}
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
                                className="btn-shimmer w-full min-w-0 border border-amber-300/70 px-4 text-center text-sm shadow-none sm:w-fit"
                            >
                                <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
                                    <span className="text-base font-bold text-amber-950">
                                        Buy
                                    </span>
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

import { getTierColor, getTierEmoji } from "@shared/tier-config.ts";
import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import {
    formatPollenPackValue,
    POLLEN_PACKS,
    type PollenPack,
} from "@/pollen-packs.ts";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { pillColors } from "../layout/dashboard-theme.ts";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

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
                            <PollenPackBonusPill pack={selectedPack} />
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

type PollenPackSliderProps = {
    value: number;
    onChange: (value: number) => void;
};

const PollenPackSlider: FC<PollenPackSliderProps> = ({ value, onChange }) => {
    const selectedIndex = Math.max(
        0,
        POLLEN_PACKS.findIndex((pack) => pack.amountUsd === value),
    );
    const selectedPack = POLLEN_PACKS[selectedIndex] ?? POLLEN_PACKS[0];
    const progressPercent =
        POLLEN_PACKS.length > 1
            ? (selectedIndex / (POLLEN_PACKS.length - 1)) * 100
            : 100;

    return (
        <div className="space-y-2">
            <div className="text-[15px] font-bold text-amber-950">
                Select amount
            </div>
            <div className="flex h-8 items-center">
                <input
                    type="range"
                    min={0}
                    max={Math.max(0, POLLEN_PACKS.length - 1)}
                    step={1}
                    value={selectedIndex}
                    onChange={(event) => {
                        const pack =
                            POLLEN_PACKS[Number(event.currentTarget.value)];
                        if (pack) onChange(pack.amountUsd);
                    }}
                    aria-label="Choose pollen pack"
                    aria-valuetext={
                        selectedPack ? formatPackValue(selectedPack) : undefined
                    }
                    style={{
                        background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${progressPercent}%, #fde68a ${progressPercent}%, #fde68a 100%)`,
                    }}
                    className="h-2 w-full cursor-grab appearance-none rounded-full outline-none transition active:cursor-grabbing [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-amber-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(180,83,9,0.35)] [&::-moz-range-thumb]:transition-transform [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-amber-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(180,83,9,0.35)] [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-105"
                />
            </div>
            <div className="relative h-4 text-[10px] font-semibold text-amber-700/80 tabular-nums">
                {POLLEN_PACKS.map((pack, index) => {
                    const labelPercent =
                        POLLEN_PACKS.length > 1
                            ? (index / (POLLEN_PACKS.length - 1)) * 100
                            : 0;

                    return (
                        <span
                            key={pack.amountUsd}
                            style={{ left: `${labelPercent}%` }}
                            className={cn(
                                "absolute top-0",
                                index === 0
                                    ? "translate-x-0 text-left"
                                    : index === POLLEN_PACKS.length - 1
                                      ? "-translate-x-full text-right"
                                      : "-translate-x-1/2 text-center",
                            )}
                        >
                            ${pack.amountUsd}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

type PollenPackReadoutProps = {
    pack: PollenPack;
    showBonus?: boolean;
    tone?: "panel" | "button";
};

const PollenPackReadout: FC<PollenPackReadoutProps> = ({
    pack,
    showBonus = true,
    tone = "panel",
}) => {
    const bonusPercent = getPackBonusPercent(pack);
    const hasBonus = bonusPercent > 0;
    const isButtonTone = tone === "button";

    return (
        <span
            className={cn(
                "flex flex-wrap items-center gap-2",
                isButtonTone ? "justify-center" : "justify-end",
            )}
        >
            <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-amber-950">
                    ${pack.amountUsd}
                </span>
                <span
                    className={
                        isButtonTone ? "text-amber-600" : "text-amber-400"
                    }
                >
                    -&gt;
                </span>
                <span className="text-base font-bold text-amber-950">
                    {formatPollenPackValue(pack.pollenGrant)} pollen
                </span>
            </span>
            {showBonus && hasBonus && (
                <PollenPackBonusPill
                    pack={pack}
                    strong={isButtonTone || bonusPercent >= 60}
                />
            )}
        </span>
    );
};

type PollenPackBonusPillProps = {
    pack: PollenPack;
    strong?: boolean;
};

const PollenPackBonusPill: FC<PollenPackBonusPillProps> = ({
    pack,
    strong = true,
}) => {
    const bonusPercent = getPackBonusPercent(pack);
    if (bonusPercent <= 0) return null;

    return (
        <span
            className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                strong
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-amber-200 text-amber-900",
            )}
        >
            +{bonusPercent}% bonus
        </span>
    );
};

function getPackBonusPercent(pack: PollenPack): number {
    if (!pack.amountUsd) return 0;

    return Math.round((pack.bonusPollen / pack.amountUsd) * 100);
}

function formatPackValue(pack: PollenPack): string {
    const bonusPercent = getPackBonusPercent(pack);
    const bonusLabel = bonusPercent > 0 ? `, +${bonusPercent}% bonus` : "";

    return `$${pack.amountUsd} to ${formatPollenPackValue(pack.pollenGrant)} pollen${bonusLabel}`;
}

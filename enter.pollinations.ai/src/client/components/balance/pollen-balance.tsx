import { getTierColor, getTierEmoji } from "@shared/tier-config.ts";
import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
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

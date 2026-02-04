import type { FC } from "react";
import { getTierEmoji } from "@/tier-config.ts";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    cryptoBalance: number;
    tier?: string;
};

type GaugeSegmentProps = {
    percentage: number;
    value: number;
    label: string;
    color: "purple" | "teal" | "red";
    title: string;
    position: "left" | "right";
    offset?: number;
    alwaysShowLabel?: boolean;
};

const PollenGaugeSegment: FC<GaugeSegmentProps> = ({
    percentage,
    value,
    label,
    color,
    title,
    position,
    offset = 0,
    alwaysShowLabel = false,
}) => {
    const bgColors = {
        purple: "bg-purple-200",
        teal: "bg-teal-200",
        red: "bg-red-200",
    };
    const textColors = {
        purple: "text-purple-900",
        teal: "text-gray-900",
        red: "text-red-900",
    };
    const bgColor = bgColors[color];
    const textColor = textColors[color];

    const style =
        position === "left"
            ? { width: `${percentage}%` }
            : { left: `${offset}%`, width: `${percentage}%` };

    const showLabel = alwaysShowLabel || percentage > 15;

    return (
        <div
            className={`absolute inset-y-0 ${bgColor} transition-all duration-500 ease-out cursor-help`}
            style={style}
            title={title}
        >
            {showLabel && (
                <div className="absolute inset-0 flex items-center justify-center gap-1">
                    <span className={`${textColor} font-bold text-sm`}>
                        {label} {value.toFixed(1)}
                    </span>
                </div>
            )}
        </div>
    );
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    cryptoBalance,
    tier = "spore",
}) => {
    const tierEmoji = getTierEmoji(tier);
    const paidBalance = packBalance + cryptoBalance;
    const totalPollen = Math.max(0, tierBalance + paidBalance);

    // Always show paid segment (min 20% width for visibility)
    // Use absolute values for percentage calculation, but show actual value
    const minPaidWidth = 20;
    const isNegativePaid = paidBalance < 0;
    const isPaidZeroOrNegative = paidBalance <= 0;

    function calculatePercentage(value: number, total: number): number {
        return total > 0 ? (value / total) * 100 : 0;
    }

    // Calculate display percentages
    let paidPercentage: number;
    let freePercentage: number;

    if (isPaidZeroOrNegative) {
        // Always show paid segment with minimum width when zero or negative
        paidPercentage = minPaidWidth;
        freePercentage = Math.max(0, 100 - minPaidWidth);
    } else {
        // Normal calculation when paid is positive
        const rawPaidPct = calculatePercentage(paidBalance, totalPollen);
        paidPercentage = Math.max(rawPaidPct, minPaidWidth);
        freePercentage = 100 - paidPercentage;
    }

    return (
        <div className="bg-violet-50/30 rounded-2xl p-4 sm:p-8 border border-violet-300">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4 w-full">
                    {/* Pollen amount above gauge */}
                    <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-950 tabular-nums">
                        {totalPollen.toFixed(2)} pollen
                    </span>
                    {/* Gauge */}
                    <div className="w-full max-w-[540px]">
                        <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden border border-purple-400">
                            {/* Paid Pollen - Soft purple for paid (pack + crypto), red if negative */}
                            <PollenGaugeSegment
                                percentage={paidPercentage}
                                value={paidBalance}
                                label="💎"
                                color={isNegativePaid ? "red" : "purple"}
                                title={`💎 Purchased: ${paidBalance.toFixed(2)} pollen\nFrom packs you've bought\nRequired for 💎 Paid Only models; used after daily grants for others${isNegativePaid ? "\n⚠️ Negative balance will be settled from next daily refill" : ""}`}
                                position="left"
                                alwaysShowLabel={isPaidZeroOrNegative}
                            />
                            {/* Free Pollen - Soft teal for free */}
                            <PollenGaugeSegment
                                percentage={freePercentage}
                                value={tierBalance}
                                label={tierEmoji}
                                color="teal"
                                title={`${tierEmoji} Daily: ${tierBalance.toFixed(2)} pollen\nFree pollen from your tier, refills at 00:00 UTC\nUsed first, except for 💎 Paid Only models`}
                                position="right"
                                offset={paidPercentage}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* Purchase info */}
            <div className="bg-gradient-to-r from-violet-100/40 to-purple-100/40 rounded-xl p-4 border border-violet-200 mt-4">
                <p className="text-sm font-medium text-violet-900">
                    🎁 During beta, we double your pollen! ($5 → 10💎, $10 →
                    20💎, $20 → 40💎, $50 → 100💎)
                </p>
                <p className="text-sm font-medium text-violet-900 mt-2">
                    💳 Want to pay with a different method?{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/4826"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-violet-700"
                    >
                        Please vote
                    </a>
                </p>
            </div>
            <PaymentTrustBadge />
        </div>
    );
};

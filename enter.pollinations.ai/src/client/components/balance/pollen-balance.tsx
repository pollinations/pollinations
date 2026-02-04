import type { FC } from "react";
import { getTierEmoji } from "@/tier-config.ts";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
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
    color: "purple" | "teal";
    title: string;
    position: "left" | "right";
    offset?: number;
};

const PollenGaugeSegment: FC<GaugeSegmentProps> = ({
    percentage,
    value,
    label,
    color,
    title,
    position,
    offset = 0,
}) => {
    const bgColor = color === "purple" ? "bg-purple-200" : "bg-teal-200";
    const textColor = color === "purple" ? "text-purple-900" : "text-gray-900";

    const style =
        position === "left"
            ? { width: `${percentage}%` }
            : { left: `${offset}%`, width: `${percentage}%` };

    return (
        <div
            className={`absolute inset-y-0 ${bgColor} transition-all duration-500 ease-out cursor-help`}
            style={style}
            title={title}
        >
            {percentage > 15 && (
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
    const freePercentage = calculatePercentage(tierBalance, totalPollen);
    const paidPercentage = calculatePercentage(paidBalance, totalPollen);

    function calculatePercentage(value: number, total: number): number {
        return total > 0 ? (value / total) * 100 : 0;
    }

    return (
        <Panel color="violet" className="sm:p-8">
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
                            {/* Paid Pollen - Soft purple for paid (pack + crypto) */}
                            <PollenGaugeSegment
                                percentage={paidPercentage}
                                value={paidBalance}
                                label="💎"
                                color="purple"
                                title={`💎 Purchased: ${paidBalance.toFixed(2)} pollen\nFrom packs you've bought\nRequired for 💎 Paid Only models; used after daily grants for others`}
                                position="left"
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
            <Card color="violet" className="mt-4">
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
            </Card>
            <PaymentTrustBadge />
        </Panel>
    );
};

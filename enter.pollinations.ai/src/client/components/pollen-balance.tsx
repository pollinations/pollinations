import type { FC } from "react";
import { getTierEmoji } from "@/tier-config.ts";

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
                            {/* Paid Pollen - Soft purple for paid (pack + crypto) */}
                            <PollenGaugeSegment
                                percentage={paidPercentage}
                                value={paidBalance}
                                label="💎"
                                color="purple"
                                title={`💎 Purchased: ${paidBalance.toFixed(2)} pollen\nFrom packs you've bought`}
                                position="left"
                            />
                            {/* Free Pollen - Soft teal for free */}
                            <PollenGaugeSegment
                                percentage={freePercentage}
                                value={tierBalance}
                                label={tierEmoji}
                                color="teal"
                                title={`${tierEmoji} Daily: ${tierBalance.toFixed(2)} pollen\nFree pollen from your tier, refills at 00:00 UTC`}
                                position="right"
                                offset={paidPercentage}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* Purchase info */}
            <div className="bg-gradient-to-r from-violet-100 to-purple-100 rounded-xl p-4 border border-violet-300 mt-4">
                <p className="text-sm font-medium text-violet-900">
                    🎁 During beta, we double your pollen with every purchase!
                </p>
                <p className="text-sm font-medium text-violet-900 mt-2">
                    ⏳ After a purchase, please wait 1-2 minutes for your
                    balance to update.{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/new?template=balance-problem.yml"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-violet-700"
                    >
                        Still missing?
                    </a>
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
        </div>
    );
};

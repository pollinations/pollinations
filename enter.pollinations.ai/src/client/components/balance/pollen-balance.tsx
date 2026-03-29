import { type FC, useState } from "react";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
import { getTierEmoji } from "@/tier-config.ts";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

const isFractional = (v: number) => v > 0 && v < 1;
const formatPollen = (v: number) => v.toFixed(isFractional(v) ? 3 : 2);

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
            <div className="absolute inset-0 flex items-center justify-center gap-1">
                <span
                    className={`${textColor} font-bold text-sm whitespace-nowrap`}
                >
                    {label} {formatPollen(value)}
                </span>
            </div>
        </div>
    );
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    cryptoBalance,
    tier = "spore",
}) => {
    const [emailCopied, setEmailCopied] = useState(false);
    const tierEmoji = getTierEmoji(tier);

    const copyEmail = () => {
        navigator.clipboard.writeText("billing@pollinations.ai");
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    };
    // Clamp at 0 for display — individual buckets can go slightly negative from overage
    const displayTier = Math.max(0, tierBalance);
    const displayPaid = Math.max(0, packBalance) + Math.max(0, cryptoBalance);
    const totalPollen = displayTier + displayPaid;

    function calculatePercentage(value: number, total: number): number {
        return total > 0 ? (value / total) * 100 : 0;
    }

    const rawPaidPercentage = calculatePercentage(displayPaid, totalPollen);

    // Ensure both segments are always visible (min width to fit labels)
    const MIN_SEGMENT = 20;
    let paidPercentage: number;
    let freePercentage: number;
    if (totalPollen > 0) {
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
        <Panel color="purple">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4 w-full">
                    {/* Pollen amount above gauge */}
                    <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-950 tabular-nums">
                        {formatPollen(totalPollen)} pollen
                    </span>
                    {/* Gauge */}
                    <div className="w-full max-w-[540px]">
                        <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden border border-purple-400">
                            {/* Paid Pollen - Soft purple for paid (pack + crypto) */}
                            <PollenGaugeSegment
                                percentage={paidPercentage}
                                value={displayPaid}
                                label="🐝"
                                color="purple"
                                title={`🐝 Purchased: ${formatPollen(displayPaid)} pollen\nFrom packs you've bought\nRequired for 🐝 Paid Only models; used after tier grants for others`}
                                position="left"
                            />
                            {/* Free Pollen - Soft teal for free */}
                            <PollenGaugeSegment
                                percentage={freePercentage}
                                value={displayTier}
                                label={tierEmoji}
                                color="teal"
                                title={`${tierEmoji} Tier: ${formatPollen(displayTier)} pollen\nFree pollen from your tier, refills periodically\nUsed first, except for 🐝 Paid Only models`}
                                position="right"
                                offset={paidPercentage}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* Purchase info */}
            <Card
                color="purple"
                bg="bg-gradient-to-br from-white via-violet-50/90 to-emerald-50/80"
                className="mt-4 !border-transparent shadow-[0_18px_50px_-32px_rgba(76,29,149,0.35)]"
            >
                <div className="space-y-4">
                    <div className="space-y-1 text-center">
                        <h3 className="text-lg font-semibold text-green-950 sm:text-xl">
                            Buy Pollen
                        </h3>
                        <p className="text-sm text-violet-800">
                            Choose a pack below. 🧪 Beta bonus is already
                            included, with larger packs getting more.
                        </p>
                    </div>

                    <div
                        id="buy-pollen"
                        className="mx-auto grid w-fit [grid-template-columns:repeat(3,max-content)] gap-2.5"
                    >
                        {POLLEN_PACKS.map((pack) => (
                            <Button
                                key={pack.amountUsd}
                                as="a"
                                href={`/api/stripe/checkout/${pack.amountUsd}`}
                                color="purple"
                                weight="light"
                                title={`Buy $${pack.amountUsd} pollen pack`}
                                className="btn-shimmer w-[132px] justify-self-center whitespace-nowrap border border-purple-400 bg-purple-200 px-3 py-2 text-center text-xs text-purple-900 shadow-sm hover:bg-purple-300 sm:text-sm"
                            >
                                <span className="font-semibold text-purple-900">
                                    ${pack.amountUsd}
                                </span>
                                <span className="mx-2 text-violet-300">/</span>
                                <span className="font-medium text-purple-900">
                                    🐝 {formatPollenPackValue(pack.pollenGrant)}
                                </span>
                            </Button>
                        ))}
                    </div>

                    <div className="pt-2">
                        <PaymentTrustBadge className="mt-0 pt-0" />
                    </div>
                </div>
            </Card>
            <div className="mt-4 space-y-3 text-sm text-purple-900">
                <p className="font-medium">
                    💳 Want to pay with a different method?{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/4826"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-purple-700"
                    >
                        Vote for your preferred option
                    </a>
                </p>
                <p className="text-purple-800">
                    💬 Payment issue or missing pollen?{" "}
                    <Tooltip
                        content={emailCopied ? "Copied!" : "Click to copy"}
                        onClick={copyEmail}
                    >
                        <span className="underline hover:text-purple-700">
                            {emailCopied
                                ? "Copied!"
                                : "billing@pollinations.ai"}
                        </span>
                    </Tooltip>{" "}
                    — we reply same day.
                </p>
            </div>
        </Panel>
    );
};

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

import { getTierColor, getTierEmoji } from "@shared/tier-config.ts";
import { type FC, useState } from "react";
import { formatPollen } from "@/client/lib/format-pollen.ts";
import { POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { pillColors } from "../layout/dashboard-theme.ts";
import { Tooltip } from "../ui/tooltip.tsx";
import { AutoTopUpPanel, type BillingState } from "./auto-top-up-panel.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

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
const REFUND_POLICY_URL = "https://pollinations.ai/refunds";

function normalizeDisplayBalance(value: number): number {
    return Math.abs(value) < BALANCE_DISPLAY_EPSILON ? 0 : value;
}

const ClockIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);

const MailIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
    </svg>
);

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

type BuyPollenPanelProps = {
    initialBillingState: BillingState | null;
};

export const BuyPollenPanel: FC<BuyPollenPanelProps> = ({
    initialBillingState,
}) => {
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
                    <div className="flex w-full flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:gap-4 sm:pb-12">
                        <div className="w-full min-w-0 flex-1 pb-10 sm:pb-0">
                            <PollenPackSlider
                                value={selectedPack.amountUsd}
                                onChange={setSelectedPackAmount}
                            />
                        </div>
                        <Button
                            as="a"
                            href={`/api/stripe/checkout/${selectedPack.amountUsd}`}
                            color="amber"
                            weight="light"
                            title={`Buy $${selectedPack.amountUsd} pollen pack`}
                            className="btn-shimmer w-28 min-w-0 self-end border border-amber-300/70 text-center shadow-none sm:shrink-0 sm:self-center"
                        >
                            Buy
                        </Button>
                    </div>
                )}
            </div>
            <div className="mt-5">
                <AutoTopUpPanel initialBillingState={initialBillingState} />
            </div>
            <div className="mt-8 space-y-2 border-t border-amber-300/70 pt-5 text-[13px] leading-snug text-amber-950/45">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Credits are instant, expire in 1 year, and follow our{" "}
                        <a
                            href={REFUND_POLICY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950"
                        >
                            Refund Policy
                        </a>
                        .
                    </span>
                </p>
                <p className="flex items-start gap-1.5">
                    <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Payment issue or missing pollen?{" "}
                        <Tooltip
                            content={emailCopied ? "Copied!" : "Click to copy"}
                            onClick={copyEmail}
                        >
                            <span className="underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950">
                                {emailCopied
                                    ? "Copied!"
                                    : "billing@pollinations.ai"}
                            </span>
                        </Tooltip>{" "}
                        — we reply same day.
                    </span>
                </p>
                <PaymentTrustBadge className="mt-0 pt-0" />
            </div>
        </>
    );
};

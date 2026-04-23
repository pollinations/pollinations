import { type FC, useId, useState } from "react";
import { formatPollen, toFinitePollen } from "@/client/lib/format-pollen.ts";
import { formatPollenPackValue, POLLEN_PACKS } from "@/pollen-packs.ts";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

type PollenBalanceProps = {
    tierBalance?: unknown;
    creatorBalance?: unknown;
    packBalance?: unknown;
    cryptoBalance?: unknown;
};

type GaugeSegmentProps = {
    percentage: number;
    value: number;
    label: string;
    title: string;
    offset: number;
    barClassName: string;
    textClassName: string;
    isTooltipActive: boolean;
    tooltipId: string;
    onTooltipClose: () => void;
    onTooltipOpen: () => void;
};

const PollenGaugeSegment: FC<GaugeSegmentProps> = ({
    percentage,
    value,
    label,
    title,
    offset,
    barClassName,
    textClassName,
    isTooltipActive,
    tooltipId,
    onTooltipClose,
    onTooltipOpen,
}) => {
    return (
        <button
            type="button"
            className={`absolute inset-y-0 ${barClassName} cursor-default appearance-none border-0 p-0 text-center transition-all duration-500 ease-out focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/45`}
            style={{ left: `${offset}%`, width: `${percentage}%` }}
            aria-label={title.replace("\n", ". ")}
            aria-describedby={isTooltipActive ? tooltipId : undefined}
            onBlur={onTooltipClose}
            onClick={(event) => {
                event.stopPropagation();
                onTooltipOpen();
            }}
            onFocus={onTooltipOpen}
            onMouseEnter={onTooltipOpen}
            onMouseLeave={onTooltipClose}
        >
            <div
                className={`${textClassName} absolute inset-0 flex flex-col items-center justify-center px-1 leading-none`}
            >
                <span className="truncate whitespace-nowrap text-[9px] font-semibold uppercase sm:text-[10px]">
                    {label}
                </span>
                <span className="truncate whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-sm">
                    {formatPollen(value)}
                </span>
            </div>
        </button>
    );
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    creatorBalance,
    packBalance,
    cryptoBalance,
}) => {
    const [emailCopied, setEmailCopied] = useState(false);
    const [activeGaugeSegment, setActiveGaugeSegment] = useState<string | null>(
        null,
    );
    const gaugeTooltipId = useId();

    const copyEmail = () => {
        navigator.clipboard.writeText("billing@pollinations.ai");
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    };
    // Clamp at 0 for display — individual buckets can go slightly negative from overage
    const displayTier = Math.max(0, toFinitePollen(tierBalance));
    const displayDeveloper = Math.max(0, toFinitePollen(creatorBalance));
    const displayTopUps =
        Math.max(0, toFinitePollen(packBalance)) +
        Math.max(0, toFinitePollen(cryptoBalance));
    const totalPollen = displayTier + displayDeveloper + displayTopUps;
    const gaugeHeightClass = "h-[40px] sm:h-[46px]";

    type Segment = Omit<
        GaugeSegmentProps,
        | "percentage"
        | "offset"
        | "isTooltipActive"
        | "tooltipId"
        | "onTooltipClose"
        | "onTooltipOpen"
    > & {
        key: string;
    };

    const segments: Segment[] = [
        {
            key: "topups",
            value: displayTopUps,
            label: "💳 Top-up",
            title: `💳 Top-up: ${formatPollen(displayTopUps)} Pollen\nPollen you bought via packs or crypto. Used after 🌱 Tier Pollen and 🌻 Dev earnings for regular models; available for paid-only models.`,
            barClassName: "bg-amber-300",
            textClassName: "text-amber-950",
        },
        {
            key: "byop",
            value: displayDeveloper,
            label: "🌻 Earnings",
            title: `🌻 Dev earnings: ${formatPollen(displayDeveloper)} Pollen\nPollen earned from BYOP app usage. Used after 🌱 Tier Pollen for regular models; available for paid-only models.`,
            barClassName: "bg-amber-200",
            textClassName: "text-amber-950",
        },
        {
            key: "tier",
            value: displayTier,
            label: "🌱 Tier",
            title: `🌱 Tier: ${formatPollen(displayTier)} Pollen\nFree hourly Pollen from your current tier. Used first for regular models; not available for paid-only models.`,
            barClassName: "bg-amber-100",
            textClassName: "text-amber-900",
        },
    ];

    const rawPercentages =
        totalPollen > 0
            ? segments.map((segment) => (segment.value / totalPollen) * 100)
            : segments.map(() => 100 / segments.length);
    const minSegment = 16;
    const pinned = rawPercentages.map((percentage) => percentage < minSegment);
    const pinnedTotal = pinned.filter(Boolean).length * minSegment;
    const remainingRaw = rawPercentages.reduce(
        (sum, percentage, index) => sum + (pinned[index] ? 0 : percentage),
        0,
    );
    const displayPercentages = rawPercentages.map((percentage, index) => {
        if (pinned[index]) return minSegment;
        if (remainingRaw <= 0) return (100 - pinnedTotal) / segments.length;
        return (percentage / remainingRaw) * (100 - pinnedTotal);
    });

    let currentOffset = 0;
    const gaugeSegments = segments.map((segment, index) => {
        const percentage = displayPercentages[index] ?? 0;
        const offset = currentOffset;
        currentOffset += percentage;
        return { ...segment, percentage, offset };
    });
    const activeSegment = gaugeSegments.find(
        (segment) => segment.key === activeGaugeSegment,
    );
    const activeTooltipCenter = activeSegment
        ? Math.max(
              18,
              Math.min(82, activeSegment.offset + activeSegment.percentage / 2),
          )
        : 50;
    const [tooltipTitle = "", tooltipBody = ""] =
        activeSegment?.title.split("\n") ?? [];

    return (
        <Panel color="amber">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4 w-full">
                    {/* Pollen amount above gauge */}
                    <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-amber-950 tabular-nums">
                        {formatPollen(totalPollen)} pollen
                    </span>
                    {/* Gauge */}
                    <div className="relative w-full max-w-[540px]">
                        <div
                            className={`relative ${gaugeHeightClass} rounded-full overflow-hidden border-2 border-amber-300 bg-amber-100`}
                        >
                            {gaugeSegments.map((segment) => (
                                <PollenGaugeSegment
                                    key={segment.key}
                                    percentage={segment.percentage}
                                    value={segment.value}
                                    label={segment.label}
                                    title={segment.title}
                                    offset={segment.offset}
                                    barClassName={segment.barClassName}
                                    textClassName={segment.textClassName}
                                    isTooltipActive={
                                        activeGaugeSegment === segment.key
                                    }
                                    tooltipId={gaugeTooltipId}
                                    onTooltipClose={() =>
                                        setActiveGaugeSegment(null)
                                    }
                                    onTooltipOpen={() =>
                                        setActiveGaugeSegment(segment.key)
                                    }
                                />
                            ))}
                        </div>
                        {activeSegment && (
                            <span
                                id={gaugeTooltipId}
                                role="tooltip"
                                className="pointer-events-none absolute top-full z-50 mt-2 w-[240px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-800 shadow-lg"
                                style={{ left: `${activeTooltipCenter}%` }}
                            >
                                <span className="block font-semibold text-gray-900">
                                    {tooltipTitle}
                                </span>
                                <span className="mt-1 block whitespace-normal leading-snug">
                                    {tooltipBody}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {/* Purchase info */}
            <div id="buy-pollen" className="scroll-mt-6">
                <Card
                    color="amber"
                    bg="bg-gradient-to-br from-white via-amber-50/90 to-orange-50/80"
                    className="mt-4 !border-transparent shadow-[0_18px_50px_-32px_rgba(180,83,9,0.28)]"
                >
                    <div className="space-y-4">
                        <div className="space-y-1 text-center">
                            <h3 className="text-lg font-semibold text-amber-950 sm:text-xl">
                                Buy Pollen
                            </h3>
                            <p className="text-sm text-amber-800">
                                Choose a pack. Larger packs include a bigger
                                beta bonus.
                            </p>
                        </div>

                        <div className="mx-auto grid w-full grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:w-fit sm:[grid-template-columns:repeat(3,max-content)]">
                            {POLLEN_PACKS.map((pack) => (
                                <Button
                                    key={pack.amountUsd}
                                    as="a"
                                    href={`/api/stripe/checkout/${pack.amountUsd}`}
                                    color="amber"
                                    weight="light"
                                    title={`Buy $${pack.amountUsd} pollen pack`}
                                    className="btn-shimmer w-full min-w-0 justify-self-stretch whitespace-nowrap border border-amber-300/70 px-3 text-center text-xs shadow-none sm:w-[156px] sm:justify-self-center sm:text-sm"
                                >
                                    <span className="font-semibold text-amber-900">
                                        ${pack.amountUsd}
                                    </span>
                                    <span className="mx-2 text-amber-400">
                                        /
                                    </span>
                                    <span className="font-medium text-amber-900">
                                        {formatPollenPackValue(
                                            pack.pollenGrant,
                                        )}{" "}
                                        pollen
                                    </span>
                                </Button>
                            ))}
                        </div>

                        <div className="pt-2">
                            <PaymentTrustBadge className="mt-0 pt-0" />
                        </div>
                    </div>
                </Card>
            </div>
            <div className="mt-4 space-y-3 text-sm text-amber-900">
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
        </Panel>
    );
};

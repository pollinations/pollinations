import { fmtUnsignedPct, fmtUsd } from "../lib/format";

export type GaugePalette = "wallet" | "neutral";

const GAUGE_PALETTE: Record<
    GaugePalette,
    {
        leftFill: string;
        leftLabel: string;
        rightFill: string;
        rightLabel: string;
    }
> = {
    wallet: {
        leftFill: "bg-paid-soft",
        leftLabel: "text-paid-deep",
        rightFill: "bg-tier-soft",
        rightLabel: "text-tier-deep",
    },
    neutral: {
        leftFill: "bg-theme-text-strong/70",
        leftLabel: "text-theme-text-strong",
        rightFill: "bg-theme-text-muted/40",
        rightLabel: "text-theme-text-muted",
    },
};

export function gaugeParts(left: number, right: number) {
    const total = left + right;
    if (total <= 0) return null;
    return {
        leftPct: (left / total) * 100,
        rightPct: (right / total) * 100,
    };
}

export function Gauge({
    left,
    leftLabel,
    palette = "wallet",
    right,
    rightLabel,
}: {
    left: number;
    leftLabel: string;
    palette?: GaugePalette;
    right: number;
    rightLabel: string;
}) {
    const parts = gaugeParts(left, right);
    if (!parts) return <span className="text-theme-text-soft">–</span>;
    const colors = GAUGE_PALETTE[palette];
    const label = `${leftLabel} ${fmtUnsignedPct(parts.leftPct)} · ${rightLabel} ${fmtUnsignedPct(parts.rightPct)}`;
    return (
        <div
            className="flex h-2 w-24 overflow-hidden rounded-sm"
            role="img"
            aria-label={label}
            title={label}
        >
            <div
                className={`h-full ${colors.leftFill}`}
                style={{ width: `${parts.leftPct}%` }}
            />
            <div
                className={`h-full ${colors.rightFill}`}
                style={{ width: `${parts.rightPct}%` }}
            />
        </div>
    );
}

export function GaugeSummary({
    left,
    leftLabel,
    palette = "wallet",
    right,
    rightLabel,
}: {
    left: number;
    leftLabel: string;
    palette?: GaugePalette;
    right: number;
    rightLabel: string;
}) {
    const colors = GAUGE_PALETTE[palette];
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span>
                <span className={colors.leftLabel}>{leftLabel}</span>{" "}
                {fmtUsd(left)}
            </span>
            <Gauge
                left={left}
                leftLabel={leftLabel}
                palette={palette}
                right={right}
                rightLabel={rightLabel}
            />
            <span>
                <span className={colors.rightLabel}>{rightLabel}</span>{" "}
                {fmtUsd(right)}
            </span>
        </div>
    );
}

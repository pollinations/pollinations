import { Chip, SparklesIcon, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { ModelHealth } from "@shared/registry/model-info.ts";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid" | "free";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
    health?: ModelHealth;
    communityProxy?: boolean;
    verified?: boolean;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

const healthStyles = {
    healthy: {
        className: "text-intent-success-text",
        label: "Healthy",
    },
    degraded: {
        className: "text-intent-warning-text",
        label: "Degraded",
    },
    down: {
        className: "text-intent-danger-text",
        label: "Down",
    },
    unknown: {
        className: "text-theme-text-muted",
        label: "No data",
    },
} as const;

export function ModelHealthIcon({
    status = "healthy",
    className = "h-5 w-5",
}: {
    status?: ModelHealth["status"];
    className?: string;
}) {
    const activeBars = { healthy: 3, degraded: 2, down: 1, unknown: 0 }[status];

    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={className}
            fill="currentColor"
        >
            {[6, 11, 16].map((height, index) => (
                <rect
                    key={height}
                    x={4 + index * 6}
                    y={20 - height}
                    width="4"
                    height={height}
                    rx="2"
                    opacity={index < activeBars ? 1 : 0.3}
                />
            ))}
        </svg>
    );
}

const healthNumber = new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
});

export function ModelHealthIndicator({
    health,
    communityProxy,
    showLabel = false,
}: {
    health: ModelHealth;
    communityProxy: boolean;
    /** The state's name beside the bars, in its colour, where there is room
     * for it. */
    showLabel?: boolean;
}) {
    const { className, label } = healthStyles[health.status];
    const sample = communityProxy
        ? `last ${health.requests} eligible requests · up to 7 days`
        : "last 24 hours";
    // The label already names the state; the tooltip then adds only the rest.
    const facts =
        health.status === "unknown" || health.success_rate == null
            ? communityProxy
                ? "last 7 days"
                : "last 24 hours"
            : `${healthNumber.format(health.success_rate)}% success · ${sample}`;
    const shownLabel =
        health.status === "unknown" || health.success_rate == null
            ? "No data"
            : label;
    const detail = showLabel ? facts : `${shownLabel} · ${facts}`;

    return (
        <Tooltip
            content={detail}
            ariaLabel={`${shownLabel} · ${facts}`}
            tapEnabled
            displayContents
        >
            {showLabel ? (
                // A reading, not a tag: no badge behind it, the bars (lit by
                // state) and the state's name in its colour.
                <span
                    aria-hidden="true"
                    className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${className}`}
                >
                    <ModelHealthIcon
                        status={health.status}
                        className="h-4 w-4 shrink-0"
                    />
                    {shownLabel}
                </span>
            ) : (
                <span
                    aria-hidden="true"
                    className={`inline-flex h-5 w-5 items-center justify-center ${className}`}
                >
                    <ModelHealthIcon status={health.status} />
                </span>
            )}
        </Tooltip>
    );
}

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    alphaTooltip = true,
    health,
    communityProxy = false,
    verified = false,
}) => {
    if (!showNew && !showAlpha && !health && !verified) return null;

    const alphaTooltipLabel = "Alpha model. Experimental and may be unstable.";

    return (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            {health && (
                <ModelHealthIndicator
                    health={health}
                    communityProxy={communityProxy}
                />
            )}
            {verified && (
                <Tooltip
                    triggerAs="span"
                    content="Official Pollinations agent"
                    ariaLabel="Official Pollinations agent"
                    tapEnabled
                    displayContents
                >
                    <Chip intent="new" size="sm">
                        Verified
                    </Chip>
                </Tooltip>
            )}
            {showNew && (
                <Chip intent="new" size="sm">
                    New
                </Chip>
            )}
            {showAlpha &&
                (alphaTooltip ? (
                    <Tooltip
                        triggerAs="span"
                        content={
                            <span>
                                <strong className="font-semibold text-theme-text-strong">
                                    Alpha model
                                </strong>
                                . Experimental and may be unstable.
                            </span>
                        }
                        ariaLabel={alphaTooltipLabel}
                        tapEnabled
                        displayContents
                    >
                        <Chip intent="alpha" size="sm">
                            Alpha
                        </Chip>
                    </Tooltip>
                ) : (
                    <Chip intent="alpha" size="sm">
                        Alpha
                    </Chip>
                ))}
        </span>
    );
};

export const ModelRateValue: FC<{
    value: string | number;
    unit: string;
}> = ({ value, unit }) => (
    <span className="pointer-events-auto inline-flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-sm font-semibold leading-none tabular-nums text-theme-text-strong">
            {value}
        </span>
        <span className="text-xs font-normal text-theme-text-muted">
            {unit}
        </span>
    </span>
);

export const PerUserRateLimit: FC<{ value?: number | null }> = ({ value }) => {
    if (value == null) return null;

    const tooltipLabel = `Limit per user: ${value} requests per minute.`;
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span>
                    Limit per user:{" "}
                    <strong className="font-semibold text-theme-text-strong">
                        {value} requests per minute
                    </strong>
                    .
                </span>
            }
            ariaLabel={tooltipLabel}
            className="pointer-events-auto shrink-0"
            tapEnabled
            displayContents
        >
            <ModelRateValue value={value} unit="RPM" />
        </Tooltip>
    );
};

export const BalanceAccessChip: FC<BalanceAccessChipProps> = ({
    access,
    className,
}) => {
    const tooltipLabel =
        access === "free"
            ? "This model is free to use."
            : access === "paid"
              ? "Paid pollen only."
              : "Uses Quest pollen first, then Paid pollen if needed.";
    const tooltipContent =
        access === "free" ? (
            <span>
                This model is{" "}
                <strong className="font-semibold text-theme-text-strong">
                    free
                </strong>{" "}
                to use.
            </span>
        ) : access === "paid" ? (
            <span className="inline-flex flex-wrap items-center gap-1">
                <WalletKindIcon kind="paid" />
                <strong className="font-semibold text-theme-text-strong">
                    Paid pollen
                </strong>{" "}
                only.
            </span>
        ) : (
            <span className="inline-flex flex-wrap items-center gap-1">
                Uses <WalletKindIcon kind="tier" />
                <strong className="font-semibold text-theme-text-strong">
                    Quest pollen
                </strong>{" "}
                first, then <WalletKindIcon kind="paid" />
                <strong className="font-semibold text-theme-text-strong">
                    Paid pollen
                </strong>{" "}
                if needed.
            </span>
        );

    const chip =
        access === "free" ? (
            <Chip intent="free" size="sm" className={className}>
                <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                Free
            </Chip>
        ) : access === "paid" ? (
            <PaidChip size="sm" className={className}>
                <WalletKindIcon kind="paid" />
                Paid
            </PaidChip>
        ) : (
            <TierChip size="sm" className={className}>
                <WalletKindIcon kind="tier" />
                Quest
            </TierChip>
        );

    return (
        <Tooltip
            triggerAs="span"
            content={tooltipContent}
            ariaLabel={tooltipLabel}
            maxWidth={340}
            className="pointer-events-auto shrink-0"
            tapEnabled
            displayContents
        >
            {chip}
        </Tooltip>
    );
};

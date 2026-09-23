import {
    CheckIcon,
    Chip,
    SparklesIcon,
    Tooltip,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { ModelHealth } from "@shared/registry/model-info.ts";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid" | "free";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
    health?: ModelHealth;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

const healthStyles = {
    healthy: {
        label: "Healthy",
        className: "text-intent-success-text",
        icon: <CheckIcon className="h-4 w-4" />,
    },
    degraded: {
        label: "Degraded",
        className: "text-intent-warning-text",
        icon: <WarningIcon className="h-4 w-4" />,
    },
    down: {
        label: "Down",
        className: "text-intent-danger-text",
        icon: <XIcon className="h-4 w-4" />,
    },
    unknown: {
        label: "No data",
        className: "text-theme-text-muted",
        icon: <span className="text-base leading-none">—</span>,
    },
} as const;

const healthNumber = new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
});

function ModelHealthIndicator({ health }: { health: ModelHealth }) {
    const { label, className, icon } = healthStyles[health.status];
    const detail =
        health.status === "unknown" || health.success_rate === null
            ? "No data · last 24 hours"
            : `${healthNumber.format(health.success_rate)}% success · last 24 hours`;

    return (
        <Tooltip
            content={detail}
            ariaLabel={`${label}: ${detail}`}
            tapEnabled
            displayContents
        >
            <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 items-center justify-center ${className}`}
            >
                {icon}
            </span>
        </Tooltip>
    );
}

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    alphaTooltip = true,
    health,
}) => {
    if (!showNew && !showAlpha && !health) return null;

    const alphaTooltipLabel = "Alpha model — experimental, may be unstable";

    return (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            {health && <ModelHealthIndicator health={health} />}
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
                                </strong>{" "}
                                — experimental, may be unstable
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

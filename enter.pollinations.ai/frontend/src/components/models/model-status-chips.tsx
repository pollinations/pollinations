import {
    CheckIcon,
    Chip,
    SparklesIcon,
    Tooltip,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import type { ModelHealth } from "@shared/registry/model-info.ts";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid" | "free";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
};

type BalanceAccessLabelProps = {
    access: BalanceAccess;
};

const healthStyles = {
    healthy: {
        className: "text-intent-success-text",
        icon: <CheckIcon className="h-5 w-5" />,
    },
    degraded: {
        className: "text-intent-warning-text",
        icon: <WarningIcon className="h-4 w-4" />,
    },
    down: {
        className: "text-intent-danger-text",
        icon: <XIcon className="h-4 w-4" />,
    },
    unknown: {
        className: "text-theme-text-muted",
        icon: <span className="text-base leading-none">—</span>,
    },
} as const;

export function ModelHealthIndicator({
    health,
    communityProxy,
}: {
    health: ModelHealth;
    communityProxy: boolean;
}) {
    const { className, icon } = healthStyles[health.status];
    const reliabilitySample = communityProxy
        ? `the last ${health.requests} eligible requests (up to seven days)`
        : "the last 24 hours";
    const healthLabel =
        health.status === "unknown"
            ? "No recent reliability data"
            : `${health.status === "healthy" ? "Healthy" : "Elevated errors"} across ${reliabilitySample}`;
    return (
        <Tooltip
            content={healthLabel}
            ariaLabel={healthLabel}
            tapEnabled
            displayContents
        >
            <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${className}`}
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
}) => {
    if (!showNew && !showAlpha) return null;

    const alphaTooltipLabel = "Alpha model — experimental, may be unstable";

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
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

export const BalanceAccessLabel: FC<BalanceAccessLabelProps> = ({ access }) => {
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

    const icon =
        access === "free" ? (
            <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
            <WalletKindIcon kind={access === "paid" ? "paid" : "tier"} />
        );
    const label =
        access === "free" ? "Free" : access === "paid" ? "Paid" : "Quest";

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
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-theme-text-strong">
                {icon}
                {label}
            </span>
        </Tooltip>
    );
};

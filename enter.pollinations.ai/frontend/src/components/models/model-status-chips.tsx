import { Chip, SparklesIcon, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { ModelHealth } from "@shared/model-health.ts";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid" | "free";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
    health?: ModelHealth;
    verified?: boolean;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    alphaTooltip = true,
    health,
    verified = false,
}) => {
    if (!showNew && !showAlpha && !health && !verified) return null;

    const unknown = !health || health.status === "unknown";
    const healthy = !unknown && health.status === "healthy";
    const healthLabel = unknown
        ? "No requests in the last 24 hours"
        : healthy
          ? "Healthy over the last 24 hours"
          : "Elevated errors over the last 24 hours";

    const alphaTooltipLabel = "Alpha model — experimental, may be unstable";

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            {health && (
                <Tooltip
                    triggerAs="span"
                    content={healthLabel}
                    ariaLabel={healthLabel}
                    tapEnabled
                >
                    <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${unknown ? "bg-theme-text-muted" : healthy ? "bg-intent-success-text" : "bg-intent-warning-text"}`}
                    />
                </Tooltip>
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

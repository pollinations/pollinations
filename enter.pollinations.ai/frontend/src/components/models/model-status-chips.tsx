import { Chip, SparklesIcon, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { FC } from "react";
import type { ModelPrice } from "./types.ts";

export type BalanceAccess = "quest" | "paid" | "free";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

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
            <ModelRateValue value={value} unit="req /minute" />
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

// --- Model limit chips: context window + video duration ---

function trimNumber(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatContextLength(contextLength?: number): string | undefined {
    if (contextLength == null) return undefined;
    if (contextLength >= 1_000_000) {
        return `${trimNumber(contextLength / 1_000_000)}M ctx`;
    }
    if (contextLength >= 1_000) {
        return `${trimNumber(contextLength / 1_000)}k ctx`;
    }
    return `${contextLength} ctx`;
}

function getVideoDurationRange(model: ModelPrice): {
    lo: number;
    hi: number;
} | null {
    if (model.type !== "video") return null;
    const allowed = model.allowedDurations;
    let min: number | undefined;
    let max: number | undefined;
    if (allowed && allowed.length > 0) {
        min = Math.min(...allowed);
        max = Math.max(...allowed);
    } else {
        min = model.minDuration;
        max = model.maxDuration;
    }
    const candidates = [min, max, model.defaultDuration].filter(
        (value): value is number => value != null,
    );
    if (candidates.length === 0) return null;
    return { lo: Math.min(...candidates), hi: Math.max(...candidates) };
}

function formatVideoDuration(model: ModelPrice): string | undefined {
    const range = getVideoDurationRange(model);
    if (!range) return undefined;
    return range.lo === range.hi ? `${range.lo}s` : `${range.lo}–${range.hi}s`;
}

function videoDurationTooltip(model: ModelPrice): string {
    const range = getVideoDurationRange(model);
    if (!range) return "";
    return range.lo === range.hi
        ? `Duration: ${range.lo} seconds`
        : `Supported duration: ${range.lo}–${range.hi} seconds`;
}

export const ModelLimitChips: FC<{ model: ModelPrice }> = ({ model }) => {
    const context = formatContextLength(model.contextLength);
    const duration = formatVideoDuration(model);
    if (!context && !duration) return null;

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            {context && (
                <Tooltip
                    triggerAs="span"
                    content={
                        <span>
                            <strong className="font-semibold text-theme-text-strong">
                                Context window:
                            </strong>{" "}
                            {new Intl.NumberFormat("en").format(
                                model.contextLength ?? 0,
                            )}{" "}
                            tokens
                        </span>
                    }
                    ariaLabel={
                        model.contextLength != null
                            ? `Context window: ${new Intl.NumberFormat("en").format(model.contextLength)} tokens`
                            : ""
                    }
                    tapEnabled
                    displayContents
                >
                    <Chip
                        intent="neutral"
                        size="sm"
                        className="whitespace-nowrap tabular-nums"
                    >
                        {context}
                    </Chip>
                </Tooltip>
            )}
            {duration && (
                <Tooltip
                    triggerAs="span"
                    content={<span>{videoDurationTooltip(model)}</span>}
                    ariaLabel={videoDurationTooltip(model)}
                    tapEnabled
                    displayContents
                >
                    <Chip
                        intent="neutral"
                        size="sm"
                        className="whitespace-nowrap tabular-nums"
                    >
                        {duration}
                    </Chip>
                </Tooltip>
            )}
        </span>
    );
};

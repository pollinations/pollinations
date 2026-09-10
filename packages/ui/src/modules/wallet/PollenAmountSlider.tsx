import type { CSSProperties, FC, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Chip, type ChipProps } from "../../primitives/Chip.tsx";
import { Slider } from "../../primitives/Slider.tsx";
import { formatPollen } from "./format-pollen.ts";

const pollenPackSliderStyle = {
    "--polli-slider-fill": "var(--polli-color-paid-soft)",
    "--polli-slider-track": "var(--polli-color-paid-pale)",
    "--polli-slider-thumb-border": "var(--polli-color-paid-deep)",
    "--polli-slider-thumb-shadow":
        "color-mix(in oklab, var(--polli-color-paid-deep) 35%, transparent)",
} as CSSProperties;

type PollenAmountSliderProps = {
    value: number;
    onChange: (value: number) => void;
    amounts: readonly number[];
    maxTicks?: number;
    label?: string;
    invalid?: boolean;
    describedBy?: string;
    selectedBadgeIntent?: ChipProps["intent"];
    selectedBadgeLabel?: ReactNode;
    selectedBadgeSuffix?: ReactNode;
    selectedBadgeDetail?: string;
    disabled?: boolean;
};

export const PollenAmountSlider: FC<PollenAmountSliderProps> = ({
    value,
    onChange,
    amounts,
    maxTicks,
    label = "Select amount",
    invalid = false,
    describedBy,
    selectedBadgeIntent,
    selectedBadgeLabel,
    selectedBadgeSuffix,
    selectedBadgeDetail,
    disabled = false,
}) => {
    const selectedIndex = Math.max(0, amounts.indexOf(value));
    const selectedAmount = amounts[selectedIndex] ?? amounts[0];
    const lastIndex = Math.max(0, amounts.length - 1);
    const progressPercent =
        lastIndex > 0 ? (selectedIndex / lastIndex) * 100 : 100;

    return (
        <div className="polli:relative">
            <div className="polli:flex polli:h-8 polli:items-center">
                <Slider
                    min={0}
                    max={lastIndex}
                    step={1}
                    value={selectedIndex}
                    onChange={(event) => {
                        const amount =
                            amounts[Number(event.currentTarget.value)];
                        if (amount !== undefined) onChange(amount);
                    }}
                    disabled={disabled}
                    aria-label={label}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-valuetext={
                        selectedAmount !== undefined
                            ? `${selectedAmount} Pollen`
                            : undefined
                    }
                    progress={progressPercent}
                    style={pollenPackSliderStyle}
                />
            </div>
            <div className="polli:absolute polli:top-full polli:right-0 polli:left-0 polli:mt-1 polli:px-[11px] polli:text-xs polli:font-bold polli:tracking-tight polli:text-theme-text-muted polli:tabular-nums">
                <div className="polli:relative">
                    {amounts.map((amount, index) => {
                        const isSelected = amount === selectedAmount;
                        if (maxTicks && !isSelected) {
                            const tick = Math.round(
                                (index * (maxTicks - 1)) /
                                    Math.max(1, lastIndex),
                            );
                            const tickIndex = Math.round(
                                (tick * lastIndex) / (maxTicks - 1),
                            );
                            if (
                                index !== tickIndex ||
                                Math.abs(index - selectedIndex) /
                                    Math.max(1, lastIndex) <
                                    0.12
                            )
                                return null;
                        }
                        const isFirst = index === 0;
                        const isLast = lastIndex > 0 && index === lastIndex;
                        return (
                            <span
                                key={amount}
                                style={{
                                    left:
                                        lastIndex > 0
                                            ? `${(index / lastIndex) * 100}%`
                                            : "0%",
                                }}
                                className={cn(
                                    "polli:absolute polli:top-0 polli:whitespace-nowrap",
                                    isFirst
                                        ? "polli:-ml-[11px] polli:translate-x-0 polli:text-left"
                                        : isLast
                                          ? "polli:ml-[11px] polli:-translate-x-full polli:text-right"
                                          : "polli:-translate-x-1/2 polli:text-center",
                                    isSelected &&
                                        "polli:font-bold polli:text-theme-text-soft",
                                )}
                            >
                                <span className="polli:relative polli:inline-block">
                                    <span
                                        className={cn(
                                            "polli:inline-block",
                                            isSelected &&
                                                "polli:text-2xl polli:leading-none",
                                            isSelected &&
                                                "polli:text-paid-deep",
                                        )}
                                    >
                                        {formatPollen(amount)}
                                        {isSelected && (
                                            <span className="polli:block polli:text-base polli:font-normal polli:leading-tight">
                                                pollen
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && selectedBadgeLabel && (
                                        <span
                                            className={cn(
                                                "polli:absolute polli:top-full polli:mt-1 polli:inline-flex polli:flex-col polli:whitespace-nowrap",
                                                isFirst
                                                    ? "polli:left-0 polli:items-start polli:text-left"
                                                    : isLast
                                                      ? "polli:right-0 polli:items-end polli:text-right"
                                                      : "polli:left-1/2 polli:-translate-x-1/2 polli:items-center polli:text-center",
                                            )}
                                        >
                                            <span className="polli:inline-flex polli:items-center polli:gap-1">
                                                <Chip
                                                    size="sm"
                                                    intent={selectedBadgeIntent}
                                                >
                                                    {selectedBadgeLabel}
                                                </Chip>
                                                {selectedBadgeSuffix}
                                            </span>
                                            {selectedBadgeDetail && (
                                                <span className="polli:mt-0.5 polli:text-xs polli:font-normal polli:leading-none polli:text-theme-text-muted">
                                                    {selectedBadgeDetail}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </span>
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

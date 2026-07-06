import { Chip, cn, Slider } from "@pollinations/ui";
import {
    formatPollenPackValue,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { CSSProperties, FC } from "react";

const pollenPackSliderStyle = {
    "--polli-slider-fill": "var(--polli-color-paid-soft)",
    "--polli-slider-track": "var(--polli-color-paid-pale)",
    "--polli-slider-thumb-border": "var(--polli-color-paid-deep)",
    "--polli-slider-thumb-shadow":
        "color-mix(in oklab, var(--polli-color-paid-deep) 35%, transparent)",
} as CSSProperties;

const formatPackAriaLabel = (pack: PollenPack): string =>
    `$${pack.amountUsd} to ${formatPollenPackValue(pack.amountUsd)} pollen`;

type PollenPackSliderProps = {
    value: number;
    onChange: (value: number) => void;
    packs?: ReadonlyArray<PollenPack>;
    label?: string;
    selectedBadgeLabel?: string;
    selectedBadgeDetail?: string;
    disabled?: boolean;
};

export const PollenPackSlider: FC<PollenPackSliderProps> = ({
    value,
    onChange,
    packs = POLLEN_PACKS,
    label = "Select amount",
    selectedBadgeLabel,
    selectedBadgeDetail,
    disabled = false,
}) => {
    const selectedIndex = Math.max(
        0,
        packs.findIndex((pack) => pack.amountUsd === value),
    );
    const selectedPack = packs[selectedIndex] ?? packs[0];
    const lastIndex = Math.max(0, packs.length - 1);
    const progressPercent =
        lastIndex > 0 ? (selectedIndex / lastIndex) * 100 : 100;

    return (
        <div className="relative">
            <div className="flex h-8 items-center">
                <Slider
                    min={0}
                    max={lastIndex}
                    step={1}
                    value={selectedIndex}
                    onChange={(event) => {
                        const pack = packs[Number(event.currentTarget.value)];
                        if (pack) onChange(pack.amountUsd);
                    }}
                    disabled={disabled}
                    aria-label={label}
                    aria-valuetext={
                        selectedPack
                            ? formatPackAriaLabel(selectedPack)
                            : undefined
                    }
                    progress={progressPercent}
                    style={pollenPackSliderStyle}
                />
            </div>
            <div className="absolute top-full right-0 left-0 mt-1 px-[11px] text-xs font-bold tracking-tight text-theme-text-muted tabular-nums">
                <div className="relative">
                    {packs.map((pack, index) => {
                        const isSelected =
                            pack.amountUsd === selectedPack?.amountUsd;
                        const isFirst = index === 0;
                        const isLast = lastIndex > 0 && index === lastIndex;
                        return (
                            <span
                                key={pack.amountUsd}
                                style={{
                                    left:
                                        lastIndex > 0
                                            ? `${(index / lastIndex) * 100}%`
                                            : "0%",
                                }}
                                className={cn(
                                    "absolute top-0 whitespace-nowrap",
                                    isFirst
                                        ? "-ml-[11px] translate-x-0 text-left"
                                        : isLast
                                          ? "ml-[11px] -translate-x-full text-right"
                                          : "-translate-x-1/2 text-center",
                                    isSelected &&
                                        "font-bold text-theme-text-soft",
                                )}
                            >
                                <span className="relative inline-block">
                                    <span
                                        className={cn(
                                            "inline-block",
                                            isSelected &&
                                                "text-2xl leading-none text-paid-deep",
                                        )}
                                    >
                                        {formatPollenPackValue(pack.amountUsd)}
                                        {isSelected && (
                                            <span className="block text-base font-normal leading-tight text-paid-deep">
                                                pollen
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && (
                                        <span
                                            className={cn(
                                                "absolute top-full mt-1 inline-flex items-center whitespace-nowrap",
                                                isFirst
                                                    ? "left-0"
                                                    : isLast
                                                      ? "right-0"
                                                      : "left-1/2 -translate-x-1/2",
                                            )}
                                        >
                                            <Chip size="sm">
                                                <span
                                                    className={cn(
                                                        "inline-flex flex-col leading-tight",
                                                        isFirst
                                                            ? "text-left"
                                                            : isLast
                                                              ? "text-right"
                                                              : "text-center",
                                                    )}
                                                >
                                                    <span className="text-sm">
                                                        {selectedBadgeLabel ??
                                                            `$${pack.amountUsd}`}
                                                    </span>
                                                    {selectedBadgeDetail && (
                                                        <span className="text-xs font-normal leading-none text-theme-text-muted">
                                                            {
                                                                selectedBadgeDetail
                                                            }
                                                        </span>
                                                    )}
                                                </span>
                                            </Chip>
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

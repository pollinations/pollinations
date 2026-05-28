import { cn } from "@frontend/lib/cn.ts";
import {
    formatPollenPackPriceUsd,
    formatPollenPackValue,
    getPackDiscountPercent,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { FC } from "react";
import { Chip } from "../ui/chip.tsx";

const sliderGradient = (percent: number): string =>
    `linear-gradient(to right, var(--color-amber-500) 0%, var(--color-amber-500) ${percent}%, var(--color-amber-200) ${percent}%, var(--color-amber-200) 100%)`;

const formatPackAriaLabel = (pack: PollenPack): string => {
    const discountPercent = getPackDiscountPercent(pack);
    const discountLabel =
        discountPercent > 0 ? `, ${discountPercent}% off` : "";
    return `${formatPollenPackValue(pack.pollenGrant)} pollen, about ${formatPollenPackPriceUsd(pack.priceUsd)}${discountLabel}`;
};

type PollenPackSliderProps = {
    value: number;
    onChange: (value: number) => void;
    packs?: ReadonlyArray<PollenPack>;
    label?: string;
    disabled?: boolean;
};

export const PollenPackSlider: FC<PollenPackSliderProps> = ({
    value,
    onChange,
    packs = POLLEN_PACKS,
    label = "Select amount",
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
                <input
                    type="range"
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
                    style={{ background: sliderGradient(progressPercent) }}
                    className="pollen-pack-slider"
                />
            </div>
            <div className="absolute top-full right-0 left-0 mt-1 px-[11px] text-xs font-bold tracking-tight text-amber-700/80 tabular-nums">
                <div className="relative">
                    {packs.map((pack, index) => {
                        const isSelected =
                            pack.amountUsd === selectedPack?.amountUsd;
                        const isFirst = index === 0;
                        const isLast = lastIndex > 0 && index === lastIndex;
                        const discountPercent = getPackDiscountPercent(pack);
                        const hasDiscount = discountPercent > 0;
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
                                        ? "text-left"
                                        : isLast
                                          ? "-translate-x-full text-right"
                                          : "-translate-x-1/2 text-center",
                                    isSelected && "font-bold text-amber-900",
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
                                        {formatPollenPackValue(
                                            pack.pollenGrant,
                                        )}
                                        {isSelected ? " pollen" : "p"}
                                    </span>
                                    {isSelected && (
                                        <Chip
                                            theme="amber"
                                            size="sm"
                                            className={cn(
                                                "absolute top-full mt-1 flex-col items-stretch whitespace-nowrap",
                                                isFirst
                                                    ? "left-0"
                                                    : isLast
                                                      ? "right-0"
                                                      : "left-1/2 -translate-x-1/2",
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    isFirst
                                                        ? "text-left"
                                                        : isLast
                                                          ? "text-right"
                                                          : "text-center",
                                                )}
                                            >
                                                ≈{" "}
                                                {formatPollenPackPriceUsd(
                                                    pack.priceUsd,
                                                )}
                                            </span>
                                            {hasDiscount && (
                                                <span
                                                    className={cn(
                                                        "text-amber-700",
                                                        isFirst
                                                            ? "text-left"
                                                            : isLast
                                                              ? "text-right"
                                                              : "text-center",
                                                    )}
                                                >
                                                    {discountPercent}% off
                                                </span>
                                            )}
                                        </Chip>
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

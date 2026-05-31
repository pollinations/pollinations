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
    return `${formatPollenPackValue(pack.pollenGrant)} pollen, ${formatPollenPackPriceUsd(pack.priceUsd)}${discountLabel}`;
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
                                    // Cancel the container's px-[11px] at both
                                    // ends so the first/last items sit flush
                                    // against the rail edges (not indented).
                                    left: isFirst
                                        ? "-11px"
                                        : isLast
                                          ? "calc(100% + 11px)"
                                          : `${(index / lastIndex) * 100}%`,
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
                                <span
                                    className={cn(
                                        "relative",
                                        isSelected
                                            ? "inline-flex flex-col"
                                            : "inline-block",
                                        isSelected &&
                                            (isFirst
                                                ? "items-start"
                                                : isLast
                                                  ? "items-end"
                                                  : "items-center"),
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block",
                                            isSelected
                                                ? "text-2xl leading-none text-paid-deep"
                                                : "text-sm",
                                        )}
                                    >
                                        {formatPollenPackValue(
                                            pack.pollenGrant,
                                        )}
                                    </span>
                                    {isSelected && (
                                        <span className="mt-0.5 text-sm leading-none text-paid-deep/80">
                                            pollen
                                        </span>
                                    )}
                                    {isSelected && (
                                        <span
                                            className={cn(
                                                "absolute top-full mt-1 flex flex-col gap-1 whitespace-nowrap",
                                                isFirst
                                                    ? "left-0 items-start"
                                                    : isLast
                                                      ? "right-0 items-end"
                                                      : "left-1/2 -translate-x-1/2 items-center",
                                            )}
                                        >
                                            <Chip
                                                theme="amber"
                                                size="sm"
                                                className="px-2.5 py-1 whitespace-nowrap"
                                            >
                                                <span className="text-sm font-semibold leading-none text-paid-deep">
                                                    {formatPollenPackPriceUsd(
                                                        pack.priceUsd,
                                                    )}
                                                </span>
                                            </Chip>
                                            {hasDiscount && (
                                                <span className="text-[11px] font-semibold leading-none text-amber-700">
                                                    {discountPercent}% off
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

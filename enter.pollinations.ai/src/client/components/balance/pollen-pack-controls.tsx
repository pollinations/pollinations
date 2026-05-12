import type { FC } from "react";
import {
    formatPollenPackValue,
    getPackBonusPercent,
    POLLEN_PACKS,
    type PollenPack,
} from "@/pollen-packs.ts";
import { cn } from "@/util.ts";

const sliderGradient = (percent: number): string =>
    `linear-gradient(to right, var(--color-amber-500) 0%, var(--color-amber-500) ${percent}%, var(--color-amber-200) ${percent}%, var(--color-amber-200) 100%)`;

const formatPackAriaLabel = (pack: PollenPack): string => {
    const bonusPercent = getPackBonusPercent(pack);
    const bonusLabel = bonusPercent > 0 ? `, +${bonusPercent}% bonus` : "";
    return `$${pack.amountUsd} to ${formatPollenPackValue(pack.pollenGrant)} pollen${bonusLabel}`;
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
            <div className="absolute top-full right-0 left-0 mt-1 px-[11px] text-xs font-semibold text-amber-700/80 tabular-nums">
                <div className="relative">
                    {packs.map((pack, index) => {
                        const isSelected =
                            pack.amountUsd === selectedPack?.amountUsd;
                        const isFirst = index === 0;
                        const isLast = lastIndex > 0 && index === lastIndex;
                        const bonusPercent = getPackBonusPercent(pack);
                        const hasBonus = pack.bonusPollen > 0;
                        const readoutPositionClass = isFirst
                            ? "left-0"
                            : isLast
                              ? "right-0"
                              : "left-1/2 -translate-x-1/2";
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
                                    "absolute top-0 -translate-x-1/2 whitespace-nowrap text-center",
                                    isSelected && "font-bold text-amber-900",
                                )}
                            >
                                <span className="relative inline-block">
                                    ${pack.amountUsd}
                                    {isSelected && (
                                        <span
                                            className={cn(
                                                "absolute top-full mt-0.5 whitespace-nowrap font-medium text-amber-900",
                                                readoutPositionClass,
                                            )}
                                        >
                                            {formatPollenPackValue(
                                                pack.pollenGrant,
                                            )}{" "}
                                            pollen
                                            {hasBonus && (
                                                <span className="text-amber-700">
                                                    {" (+"}
                                                    {bonusPercent}% bonus)
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

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
        <div className="space-y-3">
            <div className="text-[15px] font-bold text-amber-950">{label}</div>
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
            <div className="relative -mt-1 h-4 px-[11px] text-[10px] font-semibold text-amber-700/80 tabular-nums">
                <div className="relative h-full">
                    {packs.map((pack, index) => (
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
                                pack.amountUsd === selectedPack?.amountUsd &&
                                    "font-bold text-amber-900",
                            )}
                        >
                            ${pack.amountUsd}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

type PollenPackReadoutProps = {
    pack: PollenPack;
    showBonus?: boolean;
    tone?: "panel" | "button";
};

export const PollenPackReadout: FC<PollenPackReadoutProps> = ({
    pack,
    showBonus = true,
    tone = "panel",
}) => {
    const isButtonTone = tone === "button";

    return (
        <span
            className={cn(
                "flex flex-wrap items-center gap-2",
                isButtonTone ? "justify-center" : "justify-end",
            )}
        >
            <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-amber-950">
                    ${pack.amountUsd}
                </span>
                <span
                    className={
                        isButtonTone ? "text-amber-600" : "text-amber-400"
                    }
                >
                    -&gt;
                </span>
                <span className="text-base font-bold text-amber-950">
                    {formatPollenPackValue(pack.pollenGrant)} pollen
                </span>
            </span>
            {showBonus && <PollenPackBonusPill pack={pack} />}
        </span>
    );
};

type PollenPackBonusPillProps = {
    pack: PollenPack;
    className?: string;
};

export const PollenPackBonusPill: FC<PollenPackBonusPillProps> = ({
    pack,
    className,
}) => {
    const bonusPercent = getPackBonusPercent(pack);
    if (bonusPercent <= 0) return null;

    return (
        <span className={cn("text-sm font-medium text-amber-700", className)}>
            +{bonusPercent}% bonus
        </span>
    );
};

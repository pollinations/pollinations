import { cn, Slider } from "@pollinations/ui";
import {
    formatPollenPackValue,
    POLLEN_PACKS,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type { CSSProperties, FC, ReactNode } from "react";

const pollenPackSliderStyle = {
    "--polli-slider-fill": "var(--polli-color-paid-soft)",
    "--polli-slider-track": "var(--polli-color-paid-pale)",
    "--polli-slider-thumb-border": "var(--polli-color-paid-deep)",
} as CSSProperties;

type PollenPackSliderProps = {
    value: number;
    onChange: (value: number) => void;
    packs?: ReadonlyArray<PollenPack>;
    label?: string;
    disabled?: boolean;
};

/** Pack slider with its stops underneath; the chosen stop is highlighted in
 * place with its unit below it. Prices live with the action that charges
 * them, not on the slider. */
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
        <div>
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
                            ? `${formatPollenPackValue(selectedPack.amountUsd)} pollen`
                            : undefined
                    }
                    progress={progressPercent}
                    style={pollenPackSliderStyle}
                />
            </div>
            <div
                aria-hidden="true"
                className="relative mx-[11px] mt-1.5 h-9 text-sm font-bold tracking-tight text-theme-text-muted tabular-nums"
            >
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
                            "absolute top-0 whitespace-nowrap transition-colors",
                            index === 0
                                ? "-ml-[11px] text-left"
                                : lastIndex > 0 && index === lastIndex
                                  ? "ml-[11px] -translate-x-full text-right"
                                  : "-translate-x-1/2 text-center",
                            index === selectedIndex && "text-paid-deep",
                        )}
                    >
                        {formatPollenPackValue(pack.amountUsd)}
                        {index === selectedIndex && (
                            <span className="block text-xs font-medium leading-4">
                                pollen
                            </span>
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
};

/** A pack slider with its action (Buy, Save) in a fixed-width column on the
 * right, so every pack slider in the top-up block has the same width and its
 * action sits in the same place. Stacks on phones, action below. */
export const PackSliderRow: FC<{ slider: ReactNode; action: ReactNode }> = ({
    slider,
    action,
}) => (
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[1fr_14rem] sm:items-start sm:gap-x-6">
        {/* pt lines the slider track up with the centre of the action */}
        <div className="min-w-0 sm:pt-2">{slider}</div>
        <div className="flex">{action}</div>
    </div>
);

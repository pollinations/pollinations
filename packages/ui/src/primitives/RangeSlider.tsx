import { type CSSProperties, forwardRef } from "react";
import { cn } from "../lib/cn.ts";

const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number") return value;
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
};

const clampPercent = (value: number): number =>
    Math.min(100, Math.max(0, value));

const getProgressPercent = ({
    progress,
    value,
    defaultValue,
    min,
    max,
}: {
    progress?: number;
    value: React.ComponentPropsWithoutRef<"input">["value"];
    defaultValue: React.ComponentPropsWithoutRef<"input">["defaultValue"];
    min: React.ComponentPropsWithoutRef<"input">["min"];
    max: React.ComponentPropsWithoutRef<"input">["max"];
}): number | undefined => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
        return clampPercent(progress);
    }

    const numericValue = toNumber(value ?? defaultValue);
    if (numericValue === undefined) return undefined;

    const numericMin = toNumber(min) ?? 0;
    const numericMax = toNumber(max) ?? 100;
    if (numericMax <= numericMin) return 100;

    return clampPercent(
        ((numericValue - numericMin) / (numericMax - numericMin)) * 100,
    );
};

export type RangeSliderProps = Omit<
    React.ComponentPropsWithoutRef<"input">,
    "type"
> & {
    /** Fill percentage from 0-100. Falls back to value/min/max when omitted. */
    progress?: number;
};

export const RangeSlider = forwardRef<HTMLInputElement, RangeSliderProps>(
    (
        { className, defaultValue, max, min, progress, style, value, ...props },
        ref,
    ) => {
        const progressPercent = getProgressPercent({
            progress,
            value,
            defaultValue,
            min,
            max,
        });
        const sliderStyle =
            progressPercent === undefined
                ? style
                : ({
                      ...style,
                      "--polli-range-slider-progress": `${progressPercent}%`,
                  } as CSSProperties);

        return (
            <input
                ref={ref}
                type="range"
                min={min}
                max={max}
                value={value}
                defaultValue={defaultValue}
                style={sliderStyle}
                className={cn("polli-range-slider", className)}
                {...props}
            />
        );
    },
);

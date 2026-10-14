import {
    type CSSProperties,
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
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
}): number => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
        return clampPercent(progress);
    }

    const numericMin = toNumber(min) ?? 0;
    const numericMax = toNumber(max) ?? 100;
    if (numericMax <= numericMin) return 100;
    const numericValue =
        toNumber(value ?? defaultValue) ?? (numericMin + numericMax) / 2;

    return clampPercent(
        ((numericValue - numericMin) / (numericMax - numericMin)) * 100,
    );
};

export type SliderProps = Omit<
    React.ComponentPropsWithoutRef<"input">,
    "type"
> & {
    /** Fill percentage from 0-100. Falls back to value/min/max when omitted. */
    progress?: number;
};

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
    (
        {
            className,
            defaultValue,
            max,
            min,
            onInput,
            progress,
            style,
            value,
            ...props
        },
        ref,
    ) => {
        const inputRef = useRef<HTMLInputElement | null>(null);
        const [inputValue, setInputValue] = useState<string>();
        const setRef = useCallback(
            (input: HTMLInputElement | null) => {
                inputRef.current = input;
                if (typeof ref === "function") return ref(input);
                if (ref) ref.current = input;
            },
            [ref],
        );

        useEffect(() => {
            const input = inputRef.current;
            if (!input || value !== undefined) return;
            setInputValue(input.value);
            const form = input.form;
            if (!form) return;
            const handleReset = (event: Event) => {
                // Microtasks can run before a trusted reset's default action.
                setTimeout(() => {
                    if (!event.defaultPrevented) setInputValue(input.value);
                }, 0);
            };
            form.addEventListener("reset", handleReset);
            return () => form.removeEventListener("reset", handleReset);
        }, [value, defaultValue, min, max, props.step, props.form]);

        const progressPercent = getProgressPercent({
            progress,
            value: value ?? inputValue,
            defaultValue,
            min,
            max,
        });
        const sliderStyle = {
            ...style,
            "--polli-slider-progress": `${progressPercent}%`,
        } as CSSProperties;

        return (
            <input
                ref={setRef}
                type="range"
                min={min}
                max={max}
                value={value}
                defaultValue={defaultValue}
                style={sliderStyle}
                className={cn("polli-slider", className)}
                {...props}
                onInput={(event) => {
                    if (value === undefined) {
                        setInputValue(event.currentTarget.value);
                    }
                    onInput?.(event);
                }}
            />
        );
    },
);

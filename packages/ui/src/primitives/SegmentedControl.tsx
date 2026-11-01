import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type SegmentedControlOption<T extends string> = {
    value: T;
    label: ReactNode;
};

export type SegmentedControlProps<T extends string> = {
    options: readonly SegmentedControlOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Names the group for assistive tech; nothing is rendered visibly. */
    ariaLabel: string;
    className?: string;
};

/**
 * One pill track holding mutually exclusive values, like the light/dark
 * toggle: the chosen segment is filled, the others sit on the track. A value
 * selector, so the choice shows by fill only — no border or ring, apart from
 * the keyboard focus ring. Same height as a small TabButton.
 */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
}: SegmentedControlProps<T>) {
    return (
        <fieldset
            aria-label={ariaLabel}
            className={cn(
                "polli:m-0 polli:inline-flex polli:min-w-0 polli:items-center polli:gap-0.5 polli:rounded-full polli:border-0 polli:bg-theme-bg-subtle polli:p-0.5",
                className,
            )}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "polli-control polli:rounded-full polli:px-3 polli:py-1 polli:text-sm polli:font-medium polli:leading-normal polli:transition-colors polli:duration-200",
                            selected
                                ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
                                : "polli:text-theme-text-base polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </fieldset>
    );
}

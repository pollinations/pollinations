import type { FC } from "react";
import { cn } from "../lib/cn.ts";

export type SwitchStatus = "off" | "on" | "invalid";

export type SwitchProps = {
    checked: boolean;
    onChange: (next: boolean) => void;
    /** Visual status. Drives track colour only. Defaults to `checked ? "on" : "off"`. */
    status?: SwitchStatus;
    /** Accessible label (aria-label). Not rendered visibly. */
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

// Switch is theme-independent. Universal switch palette:
//  off   — pale neutral grey (so the white thumb stays visible)
//  on    — soft green (universal "enabled" affordance)
//  invalid — soft red (incomplete / error / setup needed)
const trackClasses: Record<SwitchStatus, string> = {
    off: "polli:bg-gray-200",
    on: "polli:bg-intent-success-bg-light",
    invalid: "polli:bg-intent-danger-bg-light",
};

/**
 * Binary toggle primitive. Universal palette — does NOT follow the page
 * theme. Three states: off (white), on (soft green), invalid (soft red,
 * for "enabled but needs attention").
 *
 * `checked` drives thumb position; `status` drives track colour. So
 * `checked={true} status="invalid"` renders thumb-right with a red track.
 */
export const Switch: FC<SwitchProps> = ({
    checked,
    onChange,
    status,
    ariaLabel,
    disabled = false,
    className,
}) => {
    const effectiveStatus: SwitchStatus = status ?? (checked ? "on" : "off");
    const resolvedAriaLabel =
        ariaLabel ?? (checked ? "Turn off toggle" : "Turn on toggle");

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={resolvedAriaLabel}
            onClick={() => onChange(!checked)}
            disabled={disabled}
            className={cn(
                "polli-control polli:relative polli:inline-flex polli:h-7 polli:w-12 polli:shrink-0 polli:items-center polli:rounded-full polli:transition polli:disabled:cursor-not-allowed polli:disabled:opacity-60",
                trackClasses[effectiveStatus],
                className,
            )}
        >
            <span
                className={cn(
                    "polli:inline-block polli:h-5 polli:w-5 polli:rounded-full polli:bg-white polli:shadow-sm polli:transition-transform",
                    checked ? "polli:translate-x-6" : "polli:translate-x-1",
                )}
            />
        </button>
    );
};

import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type SwitchStatus = "off" | "on" | "invalid";
export type SwitchSize = "sm" | "md" | "lg";

export type SwitchProps = {
    checked: boolean;
    onChange: (next: boolean) => void;
    /** Track colour. Defaults to `checked ? "on" : "off"`. */
    status?: SwitchStatus;
    /** Accessible label (aria-label). Not rendered visibly. */
    ariaLabel?: string;
    disabled?: boolean;
    size?: SwitchSize;
    /**
     * A two-way choice (light/dark) rather than on/off: the thumb carries the
     * current side's icon, the other sits faint on the empty side, and the
     * track stays neutral in both positions.
     */
    icons?: { off: ReactNode; on: ReactNode };
    className?: string;
};

// Track, thumb and icon geometry per size. The thumb sits 2px inside a 1px
// border, so its travel is the inner width minus both insets and itself.
const sizes: Record<
    SwitchSize,
    {
        track: string;
        thumb: string;
        travel: string;
        icon: string;
        ghostOff: string;
        ghostOn: string;
    }
> = {
    sm: {
        track: "polli:h-5 polli:w-9",
        thumb: "polli:h-3.5 polli:w-3.5",
        travel: "polli:translate-x-4",
        icon: "polli:h-2.5 polli:w-2.5",
        ghostOff: "polli:right-[5px]",
        ghostOn: "polli:left-[5px]",
    },
    md: {
        track: "polli:h-7 polli:w-[52px]",
        thumb: "polli:h-5 polli:w-5",
        travel: "polli:translate-x-[26px]",
        icon: "polli:h-3.5 polli:w-3.5",
        ghostOff: "polli:right-[7px]",
        ghostOn: "polli:left-[7px]",
    },
    lg: {
        track: "polli:h-9 polli:w-16",
        thumb: "polli:h-7 polli:w-7",
        travel: "polli:translate-x-[30px]",
        icon: "polli:h-4 polli:w-4",
        ghostOff: "polli:right-[9px]",
        ghostOn: "polli:left-[9px]",
    },
};

// On fills with the theme accent; invalid (on, but needs attention) is red.
const trackClasses: Record<SwitchStatus, string> = {
    off: "polli:bg-surface-opaque",
    on: "polli:bg-theme-text-soft",
    invalid: "polli:bg-intent-danger-text",
};

/**
 * Binary toggle, in three sizes. `checked` moves the thumb; `status` colours
 * the track, so `checked status="invalid"` is thumb-right on red. With
 * `icons` it is a two-way choice and the track stays neutral.
 */
export const Switch: FC<SwitchProps> = ({
    checked,
    onChange,
    status,
    ariaLabel,
    disabled = false,
    size = "md",
    icons,
    className,
}) => {
    const geometry = sizes[size];
    const track = icons ? "off" : (status ?? (checked ? "on" : "off"));

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={
                ariaLabel ?? (checked ? "Turn off toggle" : "Turn on toggle")
            }
            onClick={() => onChange(!checked)}
            disabled={disabled}
            className={cn(
                "polli-control polli:relative polli:inline-block polli:shrink-0 polli:cursor-pointer polli:rounded-full polli:border polli:border-theme-text-strong/10 polli:transition-colors polli:disabled:cursor-not-allowed polli:disabled:opacity-60",
                geometry.track,
                trackClasses[track],
                className,
            )}
        >
            {icons && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "polli:absolute polli:top-1/2 polli:flex polli:-translate-y-1/2 polli:text-theme-text-strong/40 polli:[&>svg]:h-full polli:[&>svg]:w-full",
                        geometry.icon,
                        checked ? geometry.ghostOn : geometry.ghostOff,
                    )}
                >
                    {checked ? icons.off : icons.on}
                </span>
            )}
            <span
                className={cn(
                    "polli:absolute polli:top-1/2 polli:left-0.5 polli:flex polli:-translate-y-1/2 polli:items-center polli:justify-center polli:rounded-full polli:bg-app-bg polli:text-theme-text-soft polli:transition-transform",
                    geometry.thumb,
                    checked ? geometry.travel : "polli:translate-x-0",
                )}
            >
                {icons && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:flex polli:[&>svg]:h-full polli:[&>svg]:w-full",
                            geometry.icon,
                        )}
                    >
                        {checked ? icons.on : icons.off}
                    </span>
                )}
            </span>
        </button>
    );
};

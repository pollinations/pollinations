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
    /** Same heights as `Button` sm / md / lg, so a switch lines up with one. */
    size?: SwitchSize;
    /**
     * A two-way choice (light/dark) rather than on/off: the thumb carries the
     * current side's icon, the other sits faint on the empty side, and the
     * track looks the same in both positions.
     */
    icons?: { off: ReactNode; on: ReactNode };
    /** A short value shown in the thumb, e.g. the amount a switch turns on. */
    thumbContent?: ReactNode;
    className?: string;
};

// Heights match Button (min-h-7 / 9 / 12). The thumb sits 3px inside a 1px
// border on every side, so its travel is the inner width minus both insets
// and itself.
const sizes: Record<
    SwitchSize,
    {
        track: string;
        thumb: string;
        travel: string;
        icon: string;
        text: string;
        ghostOff: string;
        ghostOn: string;
    }
> = {
    sm: {
        track: "polli:h-7 polli:w-[52px]",
        thumb: "polli:h-5 polli:w-5",
        travel: "polli:translate-x-6",
        icon: "polli:h-3.5 polli:w-3.5",
        text: "polli:text-[9px]",
        ghostOff: "polli:right-2",
        ghostOn: "polli:left-2",
    },
    md: {
        track: "polli:h-9 polli:w-16",
        thumb: "polli:h-7 polli:w-7",
        travel: "polli:translate-x-7",
        icon: "polli:h-4 polli:w-4",
        text: "polli:text-[11px]",
        ghostOff: "polli:right-[9px]",
        ghostOn: "polli:left-[9px]",
    },
    lg: {
        track: "polli:h-12 polli:w-[88px]",
        thumb: "polli:h-10 polli:w-10",
        travel: "polli:translate-x-10",
        icon: "polli:h-5 polli:w-5",
        text: "polli:text-sm",
        ghostOff: "polli:right-[13px]",
        ghostOn: "polli:left-[13px]",
    },
};

// On/off reads at a glance: grey when off, green when on, red when on but
// needing attention. A two-way choice (icons) keeps the outlined Button's
// accent look, since neither side is "off". Thumbs carry their own text
// colour; the green one stays dark on the white thumb in both modes.
type SwitchLook = SwitchStatus | "choice";
const trackClasses: Record<SwitchLook, string> = {
    off: "polli:border-theme-text-strong/15 polli:bg-theme-bg-subtle polli:hover:border-theme-text-strong/30",
    on: "polli:border-intent-success-bg-bright polli:bg-intent-success-bg-bright",
    invalid: "polli:border-intent-danger-text polli:bg-intent-danger-bg-light",
    choice: "polli:border-theme-text-soft polli:bg-theme-bg-active/30 polli:hover:bg-theme-bg-active/60 polli:[.dark_&]:bg-transparent polli:[.dark_&]:hover:bg-theme-text-soft/10",
};
const thumbClasses: Record<SwitchLook, string> = {
    off: "polli:bg-theme-text-muted/60 polli:text-app-bg",
    on: "polli:bg-intent-success-text-on-bright polli:text-[oklch(0.42_0.17_140)]",
    invalid: "polli:bg-intent-danger-text polli:text-app-bg",
    choice: "polli:bg-theme-text-soft polli:text-app-bg",
};

/**
 * Binary toggle, in `Button`'s sizes: grey off, green on. `checked` moves the thumb;
 * `status` colours it, so `checked status="invalid"` is thumb-right in red.
 * With `icons` it is a two-way choice with a solid thumb on both sides.
 */
export const Switch: FC<SwitchProps> = ({
    checked,
    onChange,
    status,
    ariaLabel,
    disabled = false,
    size = "md",
    icons,
    thumbContent,
    className,
}) => {
    const geometry = sizes[size];
    const look: SwitchLook = icons
        ? "choice"
        : (status ?? (checked ? "on" : "off"));

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
                "polli-control polli:relative polli:inline-block polli:shrink-0 polli:cursor-pointer polli:rounded-full polli:border polli:transition-colors polli:disabled:cursor-not-allowed polli:disabled:opacity-60",
                geometry.track,
                trackClasses[look],
                className,
            )}
        >
            {icons && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "polli:absolute polli:top-1/2 polli:flex polli:-translate-y-1/2 polli:text-theme-text-soft/50 polli:[&>svg]:h-full polli:[&>svg]:w-full",
                        geometry.icon,
                        checked ? geometry.ghostOn : geometry.ghostOff,
                    )}
                >
                    {checked ? icons.off : icons.on}
                </span>
            )}
            <span
                className={cn(
                    "polli:absolute polli:top-1/2 polli:left-[3px] polli:flex polli:-translate-y-1/2 polli:items-center polli:justify-center polli:rounded-full polli:transition-[transform,background-color]",
                    geometry.thumb,
                    thumbClasses[look],
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
                {thumbContent != null && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:font-bold polli:leading-none polli:tabular-nums",
                            geometry.text,
                        )}
                    >
                        {thumbContent}
                    </span>
                )}
            </span>
        </button>
    );
};

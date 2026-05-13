import type { FC } from "react";
import { cn } from "../../../util.ts";

export type SwitchStatus = "off" | "on" | "draft";

type SwitchProps = {
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
//  draft — soft red (incomplete / error / setup needed)
const trackClasses: Record<SwitchStatus, string> = {
    off: "bg-gray-200",
    on: "bg-[oklch(0.935_0.06_158)]",
    draft: "bg-[oklch(0.935_0.045_25)]",
};

/**
 * Binary toggle primitive. Universal palette — does NOT follow the page
 * theme. Three states: off (white), on (soft green), draft (soft red,
 * for "enabled but error / setup incomplete").
 *
 * `checked` drives thumb position; `status` drives track colour. So
 * `checked={true} status="draft"` renders thumb-right with a red track
 * — the auto top-up case where the user has the toggle on but Stripe
 * reported an issue.
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
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-ring-focus disabled:cursor-not-allowed disabled:opacity-60",
                trackClasses[effectiveStatus],
                className,
            )}
        >
            <span
                className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    checked ? "translate-x-6" : "translate-x-1",
                )}
            />
        </button>
    );
};

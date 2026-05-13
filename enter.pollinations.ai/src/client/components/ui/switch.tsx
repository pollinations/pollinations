import type { FC } from "react";
import { cn } from "../../../util.ts";

export type SwitchStatus = "off" | "on" | "draft" | "ready";

type SwitchProps = {
    checked: boolean;
    onChange: (next: boolean) => void;
    /** Visual status. Defaults to `checked ? "on" : "off"`. */
    status?: SwitchStatus;
    label?: string;
    disabled?: boolean;
    className?: string;
};

// `draft` and `ready` are intent-coloured (theme-independent); `off` and `on`
// read from the page's `data-theme` cascade.
const trackClasses: Record<SwitchStatus, string> = {
    off: "bg-theme-bg-subtle border-theme-border-soft",
    on: "bg-theme-chip-bg border-theme-border",
    draft: "bg-intent-danger-bg-light border-intent-danger-border",
    ready: "bg-intent-success-bg-strong border-intent-success-border",
};

// Thumb position follows the visual "on-ness" of the status, not just
// `checked`: `on` and `ready` push the thumb right.
const isVisuallyOn = (status: SwitchStatus): boolean =>
    status === "on" || status === "ready";

/**
 * Binary toggle primitive. Reads page theme via cascade for `off`/`on`;
 * uses semantic intent vars for `draft` (danger) and `ready` (success).
 *
 * The label/description block is the parent's responsibility — render it
 * adjacent to `<Switch>` so callers control layout.
 */
export const Switch: FC<SwitchProps> = ({
    checked,
    onChange,
    status,
    label,
    disabled = false,
    className,
}) => {
    const effectiveStatus: SwitchStatus = status ?? (checked ? "on" : "off");
    const ariaLabel = label ?? (checked ? "Turn off toggle" : "Turn on toggle");

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            onClick={() => onChange(!checked)}
            disabled={disabled}
            className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-ring-focus disabled:cursor-not-allowed disabled:opacity-60",
                trackClasses[effectiveStatus],
                className,
            )}
        >
            <span
                className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    isVisuallyOn(effectiveStatus)
                        ? "translate-x-6"
                        : "translate-x-1",
                )}
            />
        </button>
    );
};

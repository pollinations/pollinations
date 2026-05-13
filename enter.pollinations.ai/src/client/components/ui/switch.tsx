import type { FC } from "react";
import { cn } from "../../../util.ts";

export type SwitchStatus = "off" | "on" | "draft" | "ready";

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

// `draft` and `ready` are intent-coloured (theme-independent); `off` and `on`
// read from the page's `data-theme` cascade.
const trackClasses: Record<SwitchStatus, string> = {
    off: "bg-theme-bg-subtle border-theme-border-soft",
    on: "bg-theme-chip-bg border-theme-border",
    draft: "bg-intent-danger-bg-light border-intent-danger-border",
    ready: "bg-intent-success-bg-strong border-intent-success-border",
};

/**
 * Binary toggle primitive. Reads page theme via cascade for `off`/`on`;
 * uses semantic intent vars for `draft` (danger) and `ready` (success).
 *
 * The two axes are orthogonal: `checked` drives thumb position (left/right),
 * `status` drives track colour. So `checked={true} status="draft"` correctly
 * renders thumb-RIGHT with a red track ("enabled but failing") — the auto
 * top-up case where the user has the toggle on but Stripe reported an issue.
 *
 * Note: `checked={false} status="draft"` (red track, thumb left) is a
 * valid combination but unused in current consumers — the auto top-up panel
 * derives `checked` as `toggleStatus !== "off"`, so a `draft` status always
 * comes paired with `checked=true`.
 *
 * The label/description block is the parent's responsibility — render it
 * adjacent to `<Switch>` so callers control layout.
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
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-ring-focus disabled:cursor-not-allowed disabled:opacity-60",
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

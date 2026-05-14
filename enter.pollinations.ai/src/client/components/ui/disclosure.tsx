import type { FC, ReactNode } from "react";
import { cn } from "../../../util.ts";
import { ChevronIcon } from "./chevron-icon.tsx";

type DisclosureProps = {
    /** Header content (label, hint, etc). */
    label: ReactNode;
    expanded: boolean;
    onToggle: () => void;
    children: ReactNode;
    disabled?: boolean;
    /** Outer wrapper classes — base bg, border, etc. */
    wrapperClassName?: string;
    /** Trigger hover classes. Defaults to `hover:bg-theme-bg-active`. */
    hoverClassName?: string;
    /** Trigger focus classes. */
    focusClassName?: string;
    /** Expanded panel classes. Defaults to a top border separator. */
    panelClassName?: string;
    /** Accessible label for the toggle button when label is non-text. */
    ariaLabel?: string;
};

/**
 * Collapsible row primitive. One chevron, one hover/rounded behaviour for
 * every disclosure in the app. Use this for any "click to reveal nested
 * content" UI — permission groups, model selectors, advanced settings.
 *
 * For dropdown/popover triggers (date pickers, menus) use a button with
 * <ChevronIcon /> directly — that's a different interaction.
 */
export const Disclosure: FC<DisclosureProps> = ({
    label,
    expanded,
    onToggle,
    children,
    disabled = false,
    wrapperClassName,
    hoverClassName = "hover:bg-theme-bg-active",
    focusClassName,
    panelClassName = "border-t border-theme-border px-3 pt-3 pb-3",
    ariaLabel,
}) => (
    <div
        className={cn(
            "rounded-lg border transition-all",
            wrapperClassName,
            disabled && "opacity-50",
        )}
    >
        <button
            type="button"
            aria-expanded={expanded}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onToggle}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                expanded ? "rounded-t-lg" : "rounded-lg",
                !disabled && hoverClassName,
                focusClassName,
                disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
        >
            <div className="flex-1 min-w-0">{label}</div>
            <ChevronIcon expanded={expanded} className="text-theme-text-soft" />
        </button>
        {expanded && <div className={panelClassName}>{children}</div>}
    </div>
);

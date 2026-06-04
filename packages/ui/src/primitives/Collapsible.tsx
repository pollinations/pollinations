import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "./ChevronIcon.tsx";

export type CollapsibleProps = {
    /** Header content (label, hint, etc). */
    label: ReactNode;
    expanded: boolean;
    onToggle: () => void;
    children: ReactNode;
    disabled?: boolean;
    /** Outer wrapper classes — base bg, border, etc. */
    wrapperClassName?: string;
    /** Trigger hover classes. Defaults to `polli:hover:bg-theme-bg-active`. */
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
 * every collapsible in the UI. Use this for any "click to reveal nested
 * content" UI — nested settings, grouped controls, optional details.
 *
 * For dropdown/popover triggers (date pickers, menus) use a button with
 * <ChevronIcon /> directly — that's a different interaction.
 */
export const Collapsible: FC<CollapsibleProps> = ({
    label,
    expanded,
    onToggle,
    children,
    disabled = false,
    wrapperClassName,
    hoverClassName = "polli:hover:bg-theme-bg-active",
    focusClassName,
    panelClassName = "polli:border-t polli:border-theme-border polli:px-3 polli:pt-3 polli:pb-3",
    ariaLabel,
}) => (
    <div
        className={cn(
            "polli:rounded-lg polli:border polli:transition-all",
            wrapperClassName,
            disabled && "polli:opacity-50",
        )}
    >
        <button
            type="button"
            aria-expanded={expanded}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onToggle}
            className={cn(
                "polli-control polli:w-full polli:flex polli:items-center polli:gap-3 polli:px-3 polli:py-2 polli:text-left polli:transition-colors",
                expanded ? "polli:rounded-t-lg" : "polli:rounded-lg",
                !disabled && hoverClassName,
                focusClassName,
                disabled ? "polli:cursor-not-allowed" : "polli:cursor-pointer",
            )}
        >
            <div className="polli:flex-1 polli:min-w-0">{label}</div>
            <ChevronIcon
                expanded={expanded}
                className="polli:text-theme-text-soft"
            />
        </button>
        {expanded && <div className={panelClassName}>{children}</div>}
    </div>
);

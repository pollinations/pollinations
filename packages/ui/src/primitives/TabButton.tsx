import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type TabButtonOwnProps = {
    active: boolean;
    /** Omit when rendering as a link (`as`) and navigation carries the change. */
    onClick?: () => void;
    children: ReactNode;
    size?: "lg" | "md" | "sm";
    variant?: "soft" | "ghost";
    intent?: "neutral";
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

/**
 * Polymorphic like Button, so a tab that navigates can render a real anchor
 * instead of a click handler — middle-click, right-click and crawlers all
 * depend on that. Defaults to <button>, so existing call sites are unchanged.
 */
export type TabButtonProps<T extends ElementType = "button"> =
    TabButtonOwnProps & { as?: T } & Omit<
            ComponentPropsWithoutRef<T>,
            keyof TabButtonOwnProps | "as"
        >;

/**
 * Shared pill shape (no colors) — used by every TabButton variant.
 *
 * `transition-colors`, not `transition-all`: only background and text colour
 * change between the variants, and `all` additionally animates any layout
 * property that happens to differ — which is the usual cause of a control
 * jittering under the pointer on hover.
 */
const tabButtonBaseClass =
    "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:font-medium polli:leading-normal polli:transition-colors polli:duration-200";

const tabButtonSizeClass = {
    lg: "polli:px-5 polli:py-2 polli:text-lg",
    md: "polli:px-4 polli:py-1.5 polli:text-base",
    sm: "polli:px-3 polli:py-1.5 polli:text-sm",
} as const;

const variantClasses = {
    // The default tab look: borderless and monochrome. Selected uses `bg-active`
    // — the same light resting fill as the site's normal buttons. Both states
    // deepen to `bg-hover` and use the theme's hover label color. Non-selected
    // uses the quiet `bg-subtle` token until then.
    soft: {
        base: "",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
        inactive:
            "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
    },
    // Transparent until hovered or selected — for multi-select toggles and
    // inline rows where a filled idle pill would read as a hard selection.
    ghost: {
        base: "polli:border polli:border-transparent",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
        inactive:
            "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
    },
} as const;

export function TabButton<T extends ElementType = "button">({
    as,
    active,
    onClick,
    children,
    size = "md",
    variant = "soft",
    intent,
    ariaLabel,
    disabled = false,
    className,
    ...rest
}: TabButtonProps<T>) {
    const Component: ElementType = as || "button";
    const isButton = Component === "button";
    const classes = variantClasses[variant];

    return (
        <Component
            {...rest}
            {...(isButton ? { type: "button", disabled } : {})}
            onClick={onClick}
            aria-label={ariaLabel}
            // aria-pressed is for toggles; a link that navigates announces its
            // selected state with aria-current instead.
            {...(isButton
                ? { "aria-pressed": active }
                : { "aria-current": active ? "page" : undefined })}
            className={cn(
                tabButtonBaseClass,
                classes.base,
                intent === "neutral"
                    ? "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:hover:bg-theme-bg-hover"
                    : active
                      ? classes.active
                      : classes.inactive,
                disabled && "polli:cursor-not-allowed polli:opacity-50",
                tabButtonSizeClass[size],
                className,
            )}
        >
            {children}
        </Component>
    );
}

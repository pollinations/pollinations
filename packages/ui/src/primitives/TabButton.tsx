import type {
    ComponentPropsWithoutRef,
    ElementType,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";

type TabButtonOwnProps = {
    /** `mixed`: a group toggle where only some of its items are selected. */
    active: boolean | "mixed";
    /** Omit when rendering as a link (`as`) and navigation carries the change. */
    onClick?: () => void;
    children: ReactNode;
    size?: "lg" | "md" | "sm" | "xs";
    variant?: "soft" | "ghost";
    /**
     * `amber` and `green` fill the selected pill with the wallet's pale paid
     * and Quest Pollen chip colours, which read at the same strength together.
     * `brand` is site navigation: bold labels, the brand accent for the
     * current page and a lighter preview of it on hover.
     */
    intent?: "neutral" | "amber" | "green" | "brand";
    /** Muted secondary text after the label, e.g. a model's creator. */
    detail?: ReactNode;
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
    xs: "polli:px-2.5 polli:py-1 polli:text-xs",
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
        mixed: "polli:bg-theme-bg-active/45 polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
        inactive:
            "polli:bg-theme-bg-subtle polli:text-theme-text-base polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
    },
    // Transparent until hovered or selected — for multi-select toggles and
    // inline rows where a filled idle pill would read as a hard selection.
    ghost: {
        base: "polli:border polli:border-transparent",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
        mixed: "polli:bg-theme-bg-active/45 polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
        inactive:
            "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover",
    },
} as const;

// Wallet chip pairs: selected fills with the pale tint and deep label; hover
// previews that fill. Unselected green keeps its green label so it stays
// recognisable next to amber; unselected amber keeps the neutral label.
const intentClasses = {
    amber: {
        active: "polli:bg-paid-pale polli:text-paid-deep",
        inactive:
            "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-paid-pale/60",
    },
    green: {
        active: "polli:bg-tier-pale polli:text-tier-deep",
        inactive:
            "polli:bg-transparent polli:text-tier-deep polli:hover:bg-tier-pale/60",
    },
    // Site navigation: the current page is the one full brand pill; hover
    // only previews it, so "where you are" never doubles up.
    brand: {
        active: "polli:bg-brand-accent polli:font-bold polli:text-brand-dark",
        inactive:
            "polli:bg-transparent polli:font-bold polli:text-theme-text-strong polli:hover:bg-brand-accent/60 polli:hover:text-brand-dark",
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
    detail,
    ariaLabel,
    disabled = false,
    className,
    ...rest
}: TabButtonProps<T>) {
    const Component: ElementType = as || "button";
    const isButton = Component === "button";
    const colors =
        intent === "neutral"
            ? variantClasses.soft
            : intent
              ? {
                    ...intentClasses[intent],
                    mixed: intentClasses[intent].active,
                }
              : variantClasses[variant];
    const handleClick = disabled
        ? (event: ReactMouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
          }
        : onClick;

    return (
        <Component
            {...rest}
            {...(isButton ? { type: "button", disabled } : {})}
            {...(!isButton && disabled
                ? { "aria-disabled": true, tabIndex: -1 }
                : {})}
            {...(Component === "a" && disabled ? { href: undefined } : {})}
            onClick={handleClick}
            {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
            // aria-pressed is for toggles; a link that navigates announces its
            // selected state with aria-current instead.
            {...(isButton
                ? { "aria-pressed": active }
                : { "aria-current": active === true ? "page" : undefined })}
            className={cn(
                tabButtonBaseClass,
                variantClasses[variant].base,
                active === "mixed"
                    ? colors.mixed
                    : active
                      ? colors.active
                      : colors.inactive,
                disabled &&
                    "polli:pointer-events-none polli:cursor-not-allowed polli:opacity-50",
                tabButtonSizeClass[size],
                className,
            )}
        >
            {children}
            {detail != null && (
                <span className="polli:ml-1 polli:font-normal polli:opacity-70">
                    {detail}
                </span>
            )}
        </Component>
    );
}

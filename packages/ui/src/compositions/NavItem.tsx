import type { ComponentType, PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";

type BaseNavItemProps = {
    /** Current/selected item — fills with the accent + sets `aria-current`. */
    active?: boolean;
    /** Optional leading icon. */
    icon?: ComponentType<{ className?: string }>;
    /**
     * `md` (default). `sm`: compact, quiet rows for long menus such as docs —
     * smaller type, muted until hovered, a soft fill when active.
     */
    size?: "md" | "sm";
    className?: string;
};

// Neutral/quiet when inactive; filled with the accent when active. The leading
// icon is the section marker.
const base =
    "polli-control polli:flex polli:items-center polli:gap-2 polli:rounded-full polli:text-left polli:font-medium polli:whitespace-nowrap polli:transition-colors";
const sizeClasses = {
    md: {
        row: "polli:px-3 polli:py-2 polli:text-sm",
        icon: "polli:h-4 polli:w-4",
        active: "polli:bg-theme-bg-active polli:text-theme-text-strong",
        inactive:
            "polli:text-ink-800 polli:hover:bg-surface-opaque/60 polli:hover:text-ink-950",
    },
    sm: {
        row: "polli:px-3 polli:py-1.5 polli:text-[13px]",
        icon: "polli:h-3.5 polli:w-3.5",
        active: "polli:bg-theme-bg-subtle polli:text-theme-text-strong",
        inactive:
            "polli:text-theme-text-muted polli:hover:bg-theme-bg-subtle polli:hover:text-theme-text-strong",
    },
} as const;

export type NavItemProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseNavItemProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseNavItemProps | "as">;

/**
 * Minimal nav item — a pill that's neutral when inactive and filled with the
 * accent when active, with an optional leading icon. Polymorphic: `<NavItem>`
 * (button) for in-page nav, `<NavItem as={Link} active={…}>` for routed nav.
 * Shared by the enter dashboard rail and apps so both use one design.
 */
export function NavItem<T extends React.ElementType = "button">({
    as,
    active = false,
    icon: Icon,
    size = "md",
    className,
    children,
    ...rest
}: NavItemProps<T>) {
    const Component: React.ElementType = as || "button";
    return (
        <Component
            aria-current={active ? "page" : undefined}
            className={cn(
                base,
                sizeClasses[size].row,
                active ? sizeClasses[size].active : sizeClasses[size].inactive,
                className,
            )}
            {...rest}
        >
            {Icon ? (
                <Icon
                    className={cn(sizeClasses[size].icon, "polli:shrink-0")}
                />
            ) : null}
            {children}
        </Component>
    );
}

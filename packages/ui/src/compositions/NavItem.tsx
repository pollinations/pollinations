import type { ComponentType, PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";

type BaseNavItemProps = {
    /** Current/selected item — raised one notch + accent icon, sets `aria-current`. */
    active?: boolean;
    /** Optional leading icon. */
    icon?: ComponentType<{ className?: string }>;
    className?: string;
};

// Quiet when inactive; the selected item rises one ink notch and its leading
// icon takes the accent — selection is a place, not an action, so it never
// uses the solid accent fill.
const base =
    "polli-control polli:flex polli:items-center polli:gap-2.5 polli:rounded-full polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:whitespace-nowrap polli:transition-colors";
const activeClasses = "polli:bg-control-strong polli:text-theme-text-strong";
const inactiveClasses =
    "polli:text-theme-text-base polli:hover:bg-control polli:hover:text-theme-text-strong";

export type NavItemProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseNavItemProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseNavItemProps | "as">;

/**
 * Minimal nav item — a quiet pill that rises one notch when active, with an
 * optional leading icon that takes the accent when active. Polymorphic: `<NavItem>`
 * (button) for in-page nav, `<NavItem as={Link} active={…}>` for routed nav.
 * Shared by the enter dashboard rail and apps so both use one design.
 */
export function NavItem<T extends React.ElementType = "button">({
    as,
    active = false,
    icon: Icon,
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
                active ? activeClasses : inactiveClasses,
                className,
            )}
            {...rest}
        >
            {Icon ? (
                <Icon
                    className={cn(
                        "polli:h-4 polli:w-4 polli:shrink-0",
                        active && "polli:text-theme-text-soft",
                    )}
                />
            ) : null}
            {children}
        </Component>
    );
}

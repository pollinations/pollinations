import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

type BaseNavItemProps = {
    /** Section color via the `[data-theme]` cascade — tints the dot + active fill. */
    theme?: ThemeName;
    /** Current/selected item — fills with the section color + sets `aria-current`. */
    active?: boolean;
    className?: string;
};

// Same recipe as the enter dashboard sidebar item: neutral/quiet when inactive,
// section-colored dot always, filled with the section color when active.
const base =
    "polli-control polli:flex polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:whitespace-nowrap polli:transition-colors";
const activeClasses = "polli:bg-theme-bg-active polli:text-theme-text-strong";
const inactiveClasses =
    "polli:text-gray-800 polli:hover:bg-white/60 polli:hover:text-gray-950";
const dotClasses =
    "polli:h-2.5 polli:w-2.5 polli:shrink-0 polli:rounded-full polli:bg-theme-bg-hover polli:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]";

export type NavItemProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseNavItemProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseNavItemProps | "as">;

/**
 * Minimal nav item — a themed pill with a persistent section-color dot, neutral
 * when inactive and filled with the section color when active. Polymorphic:
 * `<NavItem>` (button) for in-page nav, `<NavItem as={Link} active={…}>` for
 * routed nav. Mirrors enter's sidebar item so both apps share one design.
 */
export function NavItem<T extends React.ElementType = "button">({
    as,
    theme,
    active = false,
    className,
    children,
    ...rest
}: NavItemProps<T>) {
    const Component: React.ElementType = as || "button";
    return (
        <Component
            data-theme={theme}
            aria-current={active ? "page" : undefined}
            className={cn(
                base,
                active ? activeClasses : inactiveClasses,
                className,
            )}
            {...rest}
        >
            <span aria-hidden="true" className={dotClasses} />
            {children}
        </Component>
    );
}

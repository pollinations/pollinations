import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn.ts";

type SurfaceVariant = "panel" | "card" | "card-themed";

const variantClasses: Record<SurfaceVariant, string> = {
    // Phones get tighter padding (and a matching radius) so nested cards keep
    // their width; from `sm` up the page has room for the full spacing.
    panel: "polli:rounded-3xl polli:bg-surface-block polli:p-4 polli:sm:rounded-block polli:sm:p-7",
    card: "polli:rounded-card polli:bg-surface-opaque polli:p-3.5 polli:sm:p-4",
    "card-themed":
        "polli:rounded-card polli:bg-theme-bg-pale polli:p-3.5 polli:sm:p-4",
};

type SurfaceOwnProps = {
    /**
     * Depth role — flat: each level is one tint step, never a shadow or border.
     * - `panel` — Level 1 block: sections and page groups
     * - `card` — Level 2 card inside a block (default)
     * - `card-themed` — Level 2 card carrying the accent tint
     */
    variant?: SurfaceVariant;
    className?: string;
};

/**
 * Polymorphic like Button, TabButton and LinkCard, so a card that is itself a
 * link renders one element instead of an anchor wrapping a div. Defaults to
 * <div>, so existing call sites are unchanged.
 */
export type SurfaceProps<T extends ElementType = "div"> = SurfaceOwnProps & {
    as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps | "as" | "color">;

export function Surface<T extends ElementType = "div">({
    as,
    variant = "card",
    className,
    children,
    ...rest
}: SurfaceProps<T>) {
    const Component: ElementType = as || "div";

    return (
        <Component
            {...rest}
            className={cn("polli:min-w-0", variantClasses[variant], className)}
        >
            {children}
        </Component>
    );
}

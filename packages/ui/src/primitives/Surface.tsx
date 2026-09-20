import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn.ts";

type SurfaceVariant = "panel" | "card" | "card-themed";

const variantClasses: Record<SurfaceVariant, string> = {
    panel: "polli:rounded-2xl polli:bg-theme-bg-pale polli:p-6 polli:shadow-container",
    card: "polli:rounded-xl polli:bg-surface-opaque polli:p-4 polli:shadow-well",
    "card-themed":
        "polli:rounded-xl polli:bg-theme-bg-pale polli:p-4 polli:shadow-well",
};

type SurfaceOwnProps = {
    /**
     * Depth role (all opaque, elevation via shadow not borders):
     * - `panel` — Level 1 container: themed bg, container shadow
     * - `card` — Level 2 well: neutral surface, well shadow (default)
     * - `card-themed` — themed well: theme-tinted, well shadow
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

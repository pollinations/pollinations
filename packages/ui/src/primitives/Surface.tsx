import type { ComponentPropsWithoutRef, FC, PropsWithChildren } from "react";
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

type SurfaceProps = PropsWithChildren<
    SurfaceOwnProps &
        Omit<ComponentPropsWithoutRef<"div">, keyof SurfaceOwnProps | "color">
>;

export const Surface: FC<SurfaceProps> = ({
    variant = "card",
    className,
    children,
    ...rest
}) => (
    <div
        {...rest}
        className={cn("polli:min-w-0", variantClasses[variant], className)}
    >
        {children}
    </div>
);

import type { ComponentPropsWithoutRef, FC, PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

type SurfaceVariant = "panel" | "card" | "card-themed";

const variantClasses: Record<SurfaceVariant, string> = {
    panel: "polli:rounded-2xl polli:border polli:border-theme-border polli:bg-theme-bg-subtle polli:p-6",
    card: "polli:rounded-xl polli:bg-surface-white polli:p-4",
    "card-themed": "polli:rounded-xl polli:bg-theme-bg-pale polli:p-4",
};

type SurfaceOwnProps = {
    /** Override the cascade theme for this surface's subtree. */
    theme?: ThemeName;
    /**
     * Visual role.
     * - `panel` — outer container: bordered, semi-transparent theme bg
     * - `card` — borderless white inner (default)
     * - `card-themed` — borderless theme-tinted inner (deeper than panel)
     */
    variant?: SurfaceVariant;
    className?: string;
};

type SurfaceProps = PropsWithChildren<
    SurfaceOwnProps &
        Omit<ComponentPropsWithoutRef<"div">, keyof SurfaceOwnProps | "color">
>;

export const Surface: FC<SurfaceProps> = ({
    theme,
    variant = "card",
    className,
    children,
    ...rest
}) => (
    <div
        {...rest}
        data-theme={theme}
        className={cn("polli:min-w-0", variantClasses[variant], className)}
    >
        {children}
    </div>
);

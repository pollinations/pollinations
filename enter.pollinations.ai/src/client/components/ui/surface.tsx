import type { ComponentPropsWithoutRef, FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";

type SurfaceVariant = "panel" | "card" | "card-themed";

const variantClasses: Record<SurfaceVariant, string> = {
    panel: "rounded-2xl border border-theme-border bg-theme-bg-subtle p-6",
    card: "rounded-xl bg-surface-white p-4",
    "card-themed": "rounded-xl bg-theme-bg-active p-4",
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
        className={cn("min-w-0", variantClasses[variant], className)}
    >
        {children}
    </div>
);

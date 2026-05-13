import type { ComponentPropsWithoutRef, FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";
import type { IntentName, ThemeName } from "../layout/dashboard-theme.ts";

type SurfaceTone = "white" | "tinted";
type SurfaceSize = "card" | "panel";

// Intent backgrounds for semantic surfaces (e.g. error containers).
const intentBg: Record<IntentName, string> = {
    danger: "bg-intent-danger-bg-light",
    success: "bg-intent-success-bg-light",
    paid: "bg-intent-paid",
    alpha: "bg-intent-alpha-bg",
};

// Intent borders. `paid` and `alpha` map to their bg vars (no dedicated
// border var yet); `danger`/`success` use the explicit border vars.
const intentBorder: Record<IntentName, string> = {
    danger: "border-intent-danger-border",
    success: "border-intent-success-border",
    paid: "border-intent-paid",
    alpha: "border-intent-alpha-bg",
};

const sizeClasses: Record<SurfaceSize, string> = {
    card: "rounded-xl border p-4",
    panel: "rounded-2xl border p-6",
};

type SurfaceOwnProps = {
    /** Override the cascade theme for this surface's subtree. */
    theme?: ThemeName;
    /** Visual tone: white (CSS-var, mode-aware) or theme-tinted. Default `white`. */
    tone?: SurfaceTone;
    /** Padding/radius preset. Default `card`. */
    size?: SurfaceSize;
    /** Semantic intent. Wins over `theme` and `tone` for bg + border. */
    intent?: IntentName;
    className?: string;
};

type SurfaceProps = PropsWithChildren<
    SurfaceOwnProps &
        Omit<ComponentPropsWithoutRef<"div">, keyof SurfaceOwnProps | "color">
>;

/**
 * Bordered surface primitive. Two sizes (card/panel), two tones (white/tinted),
 * theme-aware via the cascade. Use `intent` for semantic surfaces (error,
 * success, paid, alpha) — intent overrides both `tone` and `theme` colors.
 *
 * Reads `bg-surface-white` (mode-aware) for `tone="white"`,
 * `bg-theme-bg-tinted` (cascade) for `tone="tinted"`,
 * and `border-theme-border` (cascade) for the border by default.
 */
export const Surface: FC<SurfaceProps> = ({
    theme,
    tone = "white",
    size = "card",
    intent,
    className,
    children,
    ...rest
}) => {
    const toneBg = tone === "white" ? "bg-surface-white" : "bg-theme-bg-tinted";
    const resolvedBg = intent ? intentBg[intent] : toneBg;
    const resolvedBorder = intent
        ? intentBorder[intent]
        : "border-theme-border";

    return (
        <div
            {...rest}
            data-theme={theme}
            className={cn(
                "min-w-0",
                sizeClasses[size],
                resolvedBorder,
                resolvedBg,
                className,
            )}
        >
            {children}
        </div>
    );
};

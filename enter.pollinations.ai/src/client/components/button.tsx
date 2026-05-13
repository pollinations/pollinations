import type { Link, LinkProps } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { cn } from "../../util.ts";
import type { IntentName, ThemeName } from "./layout/dashboard-theme.ts";

const sizes = {
    small: "px-2 pt-0.5 pb-1",
    medium: "px-4 pt-1.5 pb-2",
    large: "px-6 py-3",
} as const;

// Cascade-driven base classes (read [data-theme] vars).
const themeWeightClasses = {
    light:
        "bg-theme-button-light-bg text-theme-button-light-text " +
        "hover:bg-theme-button-light-hover transition-colors",
    strong:
        "bg-theme-button-strong-bg text-theme-button-strong-text " +
        "hover:bg-theme-button-strong-hover transition-colors",
} as const;

// Intent → weight class lookup. Theme-independent (semantic).
// `paid` and `alpha` only define `light` — strong CTAs in those intents are
// uncommon; add when needed (YAGNI).
type IntentWeights = { strong?: string; light: string };
const intentWeightClasses: Record<IntentName, IntentWeights> = {
    danger: {
        light:
            "bg-intent-danger-bg-light text-intent-danger-text " +
            "hover:bg-intent-danger-border transition-colors",
        strong:
            "bg-intent-danger-bg-strong text-intent-danger-text-on-bg " +
            "hover:bg-intent-danger-bg-hover transition-colors",
    },
    success: {
        light:
            "bg-intent-success-bg-light text-intent-success-text " +
            "hover:bg-intent-success-border transition-colors",
        strong:
            "bg-intent-success-bg-strong text-intent-success-text-on-bg " +
            "hover:bg-intent-success-bg-hover transition-colors",
    },
    paid: {
        // Strong intentionally omitted — no current callsite. Falls back to light.
        light: "bg-intent-paid text-intent-paid-deep hover:bg-intent-paid-hover transition-colors",
    },
    alpha: {
        // Strong intentionally omitted — no current callsite. Falls back to light.
        light: "bg-intent-alpha-bg text-intent-alpha-text transition-colors",
    },
};

type ButtonWeight = "light" | "strong";

type BaseButtonProps = {
    /** Override the cascade theme for this button's subtree. Ignored when `intent` is set. */
    theme?: ThemeName;
    /** Semantic intent (danger/success/paid/alpha). Wins over `theme`. */
    intent?: IntentName;
    weight?: ButtonWeight;
    size?: keyof typeof sizes;
    className?: string;
    disabled?: boolean;
};

const buttonClasses = ({
    theme: _theme,
    intent,
    weight = "strong",
    size,
    className,
    disabled,
}: BaseButtonProps & { disabled?: boolean }) => {
    const colorClasses = intent
        ? (intentWeightClasses[intent][weight] ??
          intentWeightClasses[intent].light)
        : themeWeightClasses[weight];
    return cn(
        "inline-flex items-center justify-center rounded-full self-center placeholder-green-950 font-medium leading-normal box-border",
        disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:filter hover:brightness-105 cursor-pointer",
        colorClasses,
        sizes[size || "medium"],
        className,
    );
};

type ButtonElement =
    | React.ElementType<{}, "a">
    | React.ElementType<{}, "div">
    | React.ElementType<{}, "button">;

type ButtonAsElementProps<T extends ButtonElement> =
    PropsWithChildren<BaseButtonProps> & {
        as?: T extends typeof Link ? never : T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps>;

type ButtonAsLinkProps = PropsWithChildren<BaseButtonProps> & {
    as: typeof Link;
} & Omit<LinkProps, keyof BaseButtonProps>;

type ButtonProps<T extends React.ElementType> = T extends ButtonElement
    ? ButtonAsElementProps<T>
    : ButtonAsLinkProps;

export function Button<T extends React.ElementType>({
    as,
    children,
    theme,
    intent,
    weight,
    size,
    className,
    disabled,
    ...buttonProps
}: ButtonProps<T>) {
    const Component = as || "button";

    return (
        <Component
            // Cascade override only applies when `intent` is unset.
            data-theme={intent ? undefined : theme}
            className={buttonClasses({
                theme,
                intent,
                weight,
                size,
                className,
                disabled,
            })}
            disabled={disabled}
            {...buttonProps}
        >
            {children}
        </Component>
    );
}

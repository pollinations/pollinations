import type { Link, LinkProps } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { cn } from "../../util.ts";
import type { ThemeName } from "./layout/dashboard-theme.ts";

/** Button only supports `danger`. Paid/alpha live on Chip; success is gone. */
type ButtonIntent = "danger";

const sizes = {
    small: "px-2 pt-0.5 pb-1",
    medium: "px-4 pt-1.5 pb-2",
    large: "px-6 py-3",
} as const;

// Cascade-driven base — reads [data-theme] vars.
const themeClasses =
    "bg-theme-bg-active text-theme-text-base " +
    "hover:bg-theme-bg-hover transition-colors";

// Single intent: danger. Soft recipe — light tile + deep text, slightly
// deeper bg on hover. No filled CTAs anywhere.
const intentClasses: Record<ButtonIntent, string> = {
    danger:
        "bg-intent-danger-bg-light text-intent-danger-text " +
        "hover:bg-[oklch(0.88_0.075_25)] transition-colors",
};

type BaseButtonProps = {
    /** Override the cascade theme for this button's subtree. Ignored when `intent` is set. */
    theme?: ThemeName;
    /** Only `"danger"` for now. */
    intent?: ButtonIntent;
    size?: keyof typeof sizes;
    className?: string;
    disabled?: boolean;
};

const buttonClasses = ({
    theme: _theme,
    intent,
    size,
    className,
    disabled,
}: BaseButtonProps & { disabled?: boolean }) => {
    const colorClasses = intent ? intentClasses[intent] : themeClasses;
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

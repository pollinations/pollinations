import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

/** Button only supports `danger`. Label/status color recipes live on Chip. */
type ButtonIntent = "danger";

const sizes = {
    small: "polli:px-2 polli:pt-0.5 polli:pb-1",
    medium: "polli:px-4 polli:pt-1.5 polli:pb-2",
    large: "polli:px-6 polli:py-3",
} as const;

// Cascade-driven base — reads [data-theme] vars.
const themeClasses =
    "polli:bg-theme-bg-active polli:text-theme-text-base " +
    "polli:hover:bg-theme-bg-hover polli:transition-colors";

// Single intent: danger. Soft recipe — light tile + deep text, slightly
// deeper bg on hover. No filled CTAs anywhere.
const intentClasses: Record<ButtonIntent, string> = {
    danger:
        "polli:bg-intent-danger-bg-light polli:text-intent-danger-text " +
        "polli:hover:bg-intent-danger-bg-hover polli:transition-colors",
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
        "polli-control polli:inline-flex polli:items-center polli:justify-center polli:rounded-full polli:self-center polli:font-medium polli:leading-normal polli:box-border",
        disabled
            ? "polli:opacity-50 polli:cursor-not-allowed"
            : "polli:hover:filter polli:hover:brightness-105 polli:cursor-pointer",
        colorClasses,
        sizes[size || "medium"],
        className,
    );
};

export type ButtonProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseButtonProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps | "as">;

export function Button<T extends React.ElementType = "button">({
    as,
    children,
    theme,
    intent,
    size,
    className,
    disabled,
    ...buttonProps
}: ButtonProps<T>) {
    const Component: React.ElementType = as || "button";

    return (
        <Component
            // Cascade override only applies when `intent` is unset.
            data-theme={intent ? undefined : theme}
            data-intent={intent}
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

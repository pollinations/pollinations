import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";

/** `danger` (red) and `info` (edit/links, blue). Label recipes live on Chip. */
type ButtonIntent = "danger" | "info";

const sizes = {
    sm: "polli:px-2 polli:pt-0.5 polli:pb-1",
    md: "polli:px-4 polli:pt-1.5 polli:pb-2",
    lg: "polli:px-6 polli:py-3",
} as const;

// Cascade-driven base — reads [data-theme] vars.
const themeClasses =
    "polli:bg-theme-bg-active polli:text-theme-text-strong " +
    "polli:hover:bg-theme-bg-hover polli:transition-colors";

// Soft intent recipes — light tile + deep text, slightly deeper bg on hover.
// No filled CTAs anywhere.
const intentClasses: Record<ButtonIntent, string> = {
    danger:
        "polli:bg-intent-danger-bg-light polli:text-intent-danger-text " +
        "polli:hover:bg-intent-danger-bg-hover polli:transition-colors",
    info:
        "polli:bg-intent-info-bg-light polli:text-intent-info-text " +
        "polli:hover:bg-intent-info-bg-hover polli:transition-colors",
};

type BaseButtonProps = {
    /** Optional semantic recipe; omit for the ambient theme button. */
    intent?: ButtonIntent;
    size?: keyof typeof sizes;
    className?: string;
    disabled?: boolean;
};

const buttonClasses = ({
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
        sizes[size || "md"],
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
    intent,
    size,
    className,
    disabled,
    ...buttonProps
}: ButtonProps<T>) {
    const Component: React.ElementType = as || "button";

    return (
        <Component
            data-intent={intent}
            className={buttonClasses({
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

import type { PropsWithChildren, MouseEvent as ReactMouseEvent } from "react";
import { cn } from "../lib/cn.ts";

/** Semantic soft-fill roles. Label recipes live on Chip. */
type ButtonIntent = "danger" | "info" | "neutral";
export type ButtonAppearance = "pill" | "raised";

const pillSizes = {
    xs: "polli:h-5 polli:px-1.5 polli:py-0 polli:text-[11px] polli:leading-none",
    sm: "polli:px-2 polli:pt-0.5 polli:pb-1",
    md: "polli:px-4 polli:pt-1.5 polli:pb-2",
    lg: "polli:px-6 polli:py-3",
} as const;

const raisedSizes = {
    xs: "polli:px-2 polli:py-1 polli:text-xs",
    sm: "polli:px-4 polli:py-2 polli:text-sm",
    md: "polli:px-7 polli:py-3.5 polli:text-base",
    lg: "polli:px-8 polli:py-4 polli:text-lg",
} as const;

const appearanceClasses: Record<ButtonAppearance, string> = {
    pill: "polli:rounded-full",
    raised:
        "polli:rounded-xl polli:border-r-[3px] polli:border-b-[3px] polli:border-solid " +
        "polli:border-theme-text-strong/20 polli:hover:border-theme-text-strong/45",
};

// Cascade-driven base — reads [data-theme] vars.
const themeClasses =
    "polli:bg-theme-bg-active polli:text-theme-text-strong " +
    "polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover polli:transition-colors";

// Soft intent recipes — light tile + deep text, slightly deeper bg on hover.
// No filled CTAs anywhere.
const intentClasses: Record<ButtonIntent, string> = {
    danger:
        "polli:bg-intent-danger-bg-light polli:text-intent-danger-text " +
        "polli:hover:bg-intent-danger-bg-hover polli:transition-colors",
    info:
        "polli:bg-intent-info-bg-light polli:text-intent-info-text " +
        "polli:hover:bg-intent-info-bg-hover polli:transition-colors",
    neutral:
        "polli:bg-theme-bg-subtle polli:text-theme-text-base " +
        "polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover polli:transition-colors",
};

type BaseButtonProps = {
    /** Optional semantic recipe; omit for the ambient theme button. */
    intent?: ButtonIntent;
    /** `raised` is the stronger website CTA treatment. */
    appearance?: ButtonAppearance;
    size?: keyof typeof pillSizes;
    className?: string;
    disabled?: boolean;
};

const buttonClasses = ({
    intent,
    appearance = "pill",
    size,
    className,
    disabled,
}: BaseButtonProps & { disabled?: boolean }) => {
    const colorClasses = intent ? intentClasses[intent] : themeClasses;
    const sizeClasses = appearance === "raised" ? raisedSizes : pillSizes;
    return cn(
        "polli-control polli:inline-flex polli:items-center polli:justify-center polli:self-center polli:font-medium polli:leading-normal polli:box-border",
        disabled
            ? "polli:opacity-50 polli:cursor-not-allowed"
            : "polli:hover:filter polli:hover:brightness-105 polli:cursor-pointer",
        colorClasses,
        appearanceClasses[appearance],
        sizeClasses[size || "md"],
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
    appearance,
    size,
    className,
    disabled,
    ...buttonProps
}: ButtonProps<T>) {
    const Component: React.ElementType = as || "button";
    const isButton = Component === "button";
    const isAnchor = Component === "a";
    const buttonType = (
        buttonProps as {
            type?: "button" | "submit" | "reset";
        }
    ).type;
    const onClick = (
        buttonProps as {
            onClick?: (event: ReactMouseEvent) => void;
        }
    ).onClick;
    const handleClick = disabled
        ? (event: ReactMouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
          }
        : onClick;

    return (
        <Component
            {...buttonProps}
            data-intent={intent}
            {...(isButton ? { type: buttonType ?? "button", disabled } : {})}
            {...(!isButton && disabled
                ? { "aria-disabled": true, tabIndex: -1 }
                : {})}
            {...(isAnchor && disabled ? { href: undefined } : {})}
            onClick={handleClick}
            className={buttonClasses({
                intent,
                appearance,
                size,
                className,
                disabled,
            })}
        >
            {children}
        </Component>
    );
}

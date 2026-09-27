import type {
    PropsWithChildren,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";

/** Semantic action roles. Label recipes live on Chip. */
type ButtonIntent = "danger" | "info" | "neutral" | "brand" | "commit";
export type ButtonAppearance = "pill" | "raised";

const pillSizes = {
    icon: "polli:h-12 polli:w-12 polli:p-0",
    xs: "polli:h-5 polli:px-1.5 polli:py-0 polli:text-[11px] polli:leading-none",
    sm: "polli:min-h-7 polli:px-2 polli:pt-0.5 polli:pb-1",
    md: "polli:min-h-9 polli:px-4 polli:pt-1.5 polli:pb-2",
    lg: "polli:min-h-12 polli:px-6 polli:py-3",
} as const;

const raisedSizes = {
    icon: "polli:h-12 polli:w-12 polli:p-0",
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

// Flat fills only — no outlines. Primary actions (the default, `brand`,
// `commit`) are the solid accent: the one bright fill on the page, identical
// in both modes. Everything else is a tint that steps up one notch on hover.
const solid =
    "polli:bg-theme-bg-solid polli:text-theme-text-on-solid polli:transition-[filter,background-color]";
const themeClasses = solid;
const intentClasses: Record<ButtonIntent, string> = {
    brand: solid,
    commit: solid,
    danger:
        "polli:bg-intent-danger-bg-light polli:text-intent-danger-text " +
        "polli:hover:bg-intent-danger-bg-hover polli:focus-visible:bg-intent-danger-bg-hover polli:transition-colors",
    info:
        "polli:bg-intent-info-bg-light polli:text-intent-info-text " +
        "polli:hover:bg-intent-info-bg-hover polli:transition-colors",
    // Secondary actions never take the accent: one step stronger ink on hover.
    neutral:
        "polli:bg-control polli:text-theme-text-strong " +
        "polli:hover:bg-control-strong polli:transition-colors",
};

type BaseButtonProps = {
    icon?: ReactNode;
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
        "polli-control polli:inline-flex polli:items-center polli:justify-center polli:self-center polli:font-body polli:text-sm polli:font-medium polli:leading-normal polli:box-border polli:border polli:border-transparent",
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
    icon,
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
            {icon && (
                <span
                    aria-hidden="true"
                    className="polli:mr-2 polli:flex polli:size-4 polli:shrink-0 polli:[&>svg]:size-full"
                >
                    {icon}
                </span>
            )}
            {children}
        </Component>
    );
}

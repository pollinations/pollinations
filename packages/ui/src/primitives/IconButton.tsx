import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Tooltip } from "./Tooltip.tsx";

/** `danger` (delete, red) and `info` (edit/links, blue). */
export type IconButtonIntent = "danger" | "info";

const intentClasses: Record<IconButtonIntent, string> = {
    danger: "polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
    info: "polli:bg-intent-info-bg-light polli:text-intent-info-text",
};

const intentHoverClasses: Record<IconButtonIntent, string> = {
    danger: "polli:hover:bg-intent-danger-bg-hover",
    info: "polli:hover:bg-intent-info-bg-hover",
};

// Default (no intent): cascade-driven theme tile, deeper on hover.
const defaultClasses = "polli:bg-theme-bg-active polli:text-theme-text-soft";
const defaultHoverClasses =
    "polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover";

export type IconButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "title"
> & {
    intent?: IconButtonIntent;
    title?: string;
    tooltip?: ReactNode;
    tooltipAlign?: "start" | "center";
    tooltipClampToViewport?: boolean;
    children: ReactNode;
    className?: string;
    size?: "sm" | "md";
};

const sizeClasses = {
    sm: "polli:h-6 polli:w-6 polli:rounded",
    md: "polli:h-9 polli:w-9 polli:rounded-full",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    (
        {
            intent,
            title,
            tooltip,
            tooltipAlign,
            tooltipClampToViewport,
            children,
            className,
            size = "sm",
            disabled = false,
            ...buttonProps
        },
        ref,
    ) => {
        const button = (
            <button
                {...buttonProps}
                ref={ref}
                type="button"
                disabled={disabled}
                aria-label={buttonProps["aria-label"] ?? title}
                data-intent={intent}
                className={cn(
                    "polli-control polli:inline-flex polli:items-center polli:justify-center polli:transition-colors",
                    disabled
                        ? "polli:cursor-not-allowed polli:opacity-50"
                        : "polli:cursor-pointer",
                    sizeClasses[size],
                    intent ? intentClasses[intent] : defaultClasses,
                    !disabled &&
                        (intent
                            ? intentHoverClasses[intent]
                            : defaultHoverClasses),
                    className,
                )}
            >
                {children}
            </button>
        );

        const tooltipContent = tooltip ?? title;
        if (!tooltipContent) return button;

        return (
            <Tooltip
                triggerAs="span"
                content={tooltipContent}
                align={tooltipAlign}
                clampToViewport={tooltipClampToViewport}
                tapEnabled={false}
            >
                {button}
            </Tooltip>
        );
    },
);

IconButton.displayName = "IconButton";

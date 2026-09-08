import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Tooltip } from "./Tooltip.tsx";

/** `danger` (delete, red) and `info` (edit/links, blue). */
export type IconButtonIntent = "danger" | "info";
export type IconButtonVariant = "tile" | "ghost";

const intentClasses: Record<IconButtonIntent, string> = {
    danger:
        "polli:bg-intent-danger-bg-light polli:hover:bg-intent-danger-bg-hover " +
        "polli:text-intent-danger-text",
    info:
        "polli:bg-intent-info-bg-light polli:hover:bg-intent-info-bg-hover " +
        "polli:text-intent-info-text",
};

const variantClasses: Record<IconButtonVariant, string> = {
    tile:
        "polli:bg-theme-bg-active polli:hover:bg-theme-bg-hover " +
        "polli:text-theme-text-soft polli:hover:text-theme-text-strong",
    ghost:
        "polli:bg-transparent polli:hover:bg-transparent " +
        "polli:text-theme-text-muted polli:hover:text-theme-text-soft",
};

export type IconButtonProps = {
    intent?: IconButtonIntent;
    variant?: IconButtonVariant;
    pressed?: boolean;
    title?: string;
    tooltip?: ReactNode;
    tooltipAlign?: "start" | "center";
    tooltipClampToViewport?: boolean;
    onClick: () => void;
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
            variant = "tile",
            pressed,
            title,
            tooltip,
            tooltipAlign,
            tooltipClampToViewport,
            onClick,
            children,
            className,
            size = "sm",
        },
        ref,
    ) => {
        const button = (
            <button
                ref={ref}
                type="button"
                onClick={onClick}
                aria-label={title}
                aria-pressed={pressed}
                data-intent={intent}
                className={cn(
                    "polli-control polli:inline-flex polli:cursor-pointer polli:items-center polli:justify-center polli:transition-colors",
                    sizeClasses[size],
                    intent ? intentClasses[intent] : variantClasses[variant],
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

import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/** IconButton only supports `danger` (delete icons). */
type IconButtonIntent = "danger";

const intentClasses: Record<IconButtonIntent, string> = {
    danger:
        "polli:bg-intent-danger-bg-light polli:hover:bg-[oklch(0.88_0.075_25)] " +
        "polli:text-intent-danger-text",
};

// Default (no intent): cascade-driven theme tile, deeper on hover.
const defaultClasses =
    "polli:bg-theme-bg-active polli:hover:bg-theme-bg-hover " +
    "polli:text-theme-text-soft polli:hover:text-theme-text-strong";

type IconButtonProps = {
    intent?: IconButtonIntent;
    title?: string;
    onClick: () => void;
    children: ReactNode;
    className?: string;
};

export const IconButton: FC<IconButtonProps> = ({
    intent,
    title,
    onClick,
    children,
    className,
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={cn(
            "polli:inline-flex polli:h-6 polli:w-6 polli:cursor-pointer polli:items-center polli:justify-center polli:rounded polli:transition-colors",
            intent ? intentClasses[intent] : defaultClasses,
            className,
        )}
    >
        {children}
    </button>
);

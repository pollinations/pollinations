import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";

/** IconButton only supports `danger` (delete icons). */
type IconButtonIntent = "danger";

const intentClasses: Record<IconButtonIntent, string> = {
    danger:
        "bg-intent-danger-bg-light hover:bg-intent-danger-border " +
        "text-intent-danger-text",
};

// Default (no intent): cascade-driven theme tile, deeper on hover.
const defaultClasses =
    "bg-theme-bg-active hover:bg-theme-bg-hover " +
    "text-theme-text-soft hover:text-theme-text-strong";

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
            "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors",
            intent ? intentClasses[intent] : defaultClasses,
            className,
        )}
    >
        {children}
    </button>
);

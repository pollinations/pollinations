import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import type { IntentName } from "../layout/dashboard-theme.ts";

// Intent → quiet bg + soft text that strengthens on hover. Mirrors the
// gray default's visual quietness (subtle chrome, strong on hover).
const intentClasses: Record<IntentName, string> = {
    danger:
        "bg-intent-danger-bg-light hover:bg-intent-danger-bg-strong " +
        "text-intent-danger-text hover:text-intent-danger-text-on-bg",
    success:
        "bg-intent-success-bg-light hover:bg-intent-success-bg-strong " +
        "text-intent-success-text hover:text-intent-success-text-on-bg",
    paid: "bg-intent-paid/20 hover:bg-intent-paid text-intent-paid-deep hover:text-white",
    alpha: "bg-intent-alpha-bg hover:bg-intent-alpha-text text-intent-alpha-text hover:text-intent-alpha-bg",
};

// Default (no intent): cascade-driven, quiet utility chrome.
const defaultClasses =
    "bg-theme-bg-subtle hover:bg-theme-bg-active " +
    "text-theme-text-soft hover:text-theme-text-strong";

type IconButtonProps = {
    intent?: IntentName;
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

import { XIcon } from "@pollinations/ui";
import type { ReactNode } from "react";

export const editableControlClass =
    "rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong";

export function dirtyControlClass(dirty: boolean, className = "") {
    return [
        className,
        dirty
            ? "border-intent-danger-border bg-intent-danger-bg-light text-intent-danger-text"
            : "",
    ]
        .filter(Boolean)
        .join(" ");
}

export function DirtyValue({
    children,
    dirty,
}: {
    children: ReactNode;
    dirty: boolean;
}) {
    if (!dirty) return <>{children}</>;
    return (
        <span className="font-medium text-intent-danger-text">{children}</span>
    );
}

export function ResetCellButton({
    kind = "reset",
    onClick,
    title = "Reset value",
}: {
    kind?: "reset" | "undo";
    onClick: () => void;
    title?: string;
}) {
    const className =
        kind === "undo"
            ? "border-theme-border/70 bg-theme-bg-active text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong"
            : "border-intent-danger-border bg-intent-danger-bg-light text-intent-danger-text hover:bg-intent-danger-bg-hover";

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={title}
            title={title}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors ${className}`}
        >
            {kind === "undo" ? (
                <UndoIcon className="h-3.5 w-3.5" />
            ) : (
                <XIcon className="h-3.5 w-3.5" />
            )}
        </button>
    );
}

function UndoIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            role="presentation"
        >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-1" />
        </svg>
    );
}

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

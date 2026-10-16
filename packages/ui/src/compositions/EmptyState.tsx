import type { ReactNode } from "react";

export type EmptyStateProps = {
    children: ReactNode;
};

/**
 * Where content would be but isn't: nothing yet, nothing matching, or a feed
 * that couldn't load. A dashed outline marks the empty slot; the note says
 * why.
 */
export function EmptyState({ children }: EmptyStateProps) {
    return (
        <p className="polli:rounded-card polli:border polli:border-dashed polli:border-theme-border polli:px-5 polli:py-8 polli:text-center polli:font-body polli:text-sm polli:text-theme-text-muted">
            {children}
        </p>
    );
}

import type { ReactNode } from "react";

/** Compact status for both initial loading and background updates. */
export function LoadingStatus({ children }: { children: ReactNode }) {
    return (
        <output className="polli:flex polli:items-center polli:gap-2 polli:font-body polli:text-sm polli:text-theme-text-muted">
            <span
                aria-hidden="true"
                className="polli:h-4 polli:w-4 polli:shrink-0 polli:animate-spin polli:motion-reduce:animate-none polli:rounded-full polli:border-2 polli:border-current polli:border-r-transparent"
            />
            {children}
        </output>
    );
}

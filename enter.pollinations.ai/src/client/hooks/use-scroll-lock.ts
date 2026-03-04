import { useEffect } from "react";

/**
 * Locks page scroll while the hook is mounted (or while `enabled` is true).
 * Restores the original overflow values on cleanup.
 */
export function useScrollLock(enabled = true): void {
    useEffect(() => {
        if (!enabled) return;

        const originalBody = document.body.style.overflow;
        const originalHtml = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalBody;
            document.documentElement.style.overflow = originalHtml;
        };
    }, [enabled]);
}

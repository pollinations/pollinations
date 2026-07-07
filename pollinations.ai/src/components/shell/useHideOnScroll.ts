import { useEffect, useState } from "react";

/**
 * Returns `true` when a sticky header should hide. Reads scroll from the
 * element `#${scrollElementId}` (NOT window — the shell body is
 * overflow:hidden and `#app-scroll` owns scroll). Hides on scroll-down,
 * shows on scroll-up and always near the top.
 */
export function useHideOnScroll(
    scrollElementId: string,
    threshold = 16,
): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const el = document.getElementById(scrollElementId);
        if (!el) return;
        let lastY = el.scrollTop;
        const onScroll = () => {
            const y = el.scrollTop;
            if (y < threshold) {
                setHidden(false);
            } else if (Math.abs(y - lastY) > 4) {
                setHidden(y > lastY);
            }
            lastY = y;
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [scrollElementId, threshold]);

    return hidden;
}

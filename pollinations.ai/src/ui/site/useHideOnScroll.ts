import { useEffect, useState } from "react";

/**
 * Direction-aware, not velocity-aware.
 *
 * Velocity gating ("hide only on a fast flick") makes one gesture produce two
 * different outcomes depending on how hard you scrolled, which reads as a bug
 * rather than as intent. Direction plus a distance threshold states in one
 * sentence: past `revealAt`, scrolling down hides it and any scroll up brings
 * it straight back.
 *
 * The old site's useHeaderVisibility only showed the header at scrollY < 10 —
 * once you scrolled it was gone until you returned to the very top.
 */
export function useHideOnScroll({
    revealAt = 120,
    minDelta = 6,
}: {
    revealAt?: number;
    minDelta?: number;
} = {}): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setHidden(false);
            return;
        }

        let lastY = window.scrollY;
        let frame = 0;

        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const y = window.scrollY;
                const delta = y - lastY;
                if (Math.abs(delta) < minDelta) return;
                lastY = y;
                setHidden(y > revealAt && delta > 0);
            });
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [revealAt, minDelta]);

    return hidden;
}

/**
 * True once the page has moved at all. Used to reveal the desk-colored
 * dissolve only while the transparent header overlaps content — at rest the
 * header remains indistinguishable from the desk it sits on.
 */
export function useScrolled(at = 4): boolean {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                setScrolled(window.scrollY > at);
            });
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [at]);

    return scrolled;
}

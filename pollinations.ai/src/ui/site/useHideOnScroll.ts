import { useEffect, useState } from "react";

const REVEAL_AT = 120;
const MIN_DELTA = 6;
const SCROLLED_AT = 4;

/**
 * Direction-aware, not velocity-aware.
 *
 * Velocity gating ("hide only on a fast flick") makes one gesture produce two
 * different outcomes depending on how hard you scrolled, which reads as a bug
 * rather than as intent. Direction plus a distance threshold states in one
 * sentence: past `REVEAL_AT`, scrolling down hides it and any scroll up brings
 * it straight back.
 */
export function useHideOnScroll(): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
                if (Math.abs(delta) < MIN_DELTA) return;
                lastY = y;
                setHidden(y > REVEAL_AT && delta > 0);
            });
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return hidden;
}

/**
 * True once the page has moved at all. Used to reveal the desk-colored
 * dissolve only while the transparent header overlaps content — at rest the
 * header remains indistinguishable from the desk it sits on.
 */
export function useScrolled(): boolean {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                setScrolled(window.scrollY > SCROLLED_AT);
            });
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return scrolled;
}

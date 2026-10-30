import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PolliSprite } from "./PolliSprite";

type Point = { x: number; y: number };
type FlightPoint = Point & { face: 1 | -1 };

/** Cards she lands on carry this class. */
export const POLLI_PERCH = "site-polli-perch";

const WIDTH = 70; // 2px per pixel of her 35-wide grid
const HEIGHT = 68;
const PERCH_INSET = 72; // from the card's right edge, clear of its ↗ icon
const DWELL_MS = 300;
const STEPS = 12; // keyframes per flight

/**
 * One arc from `from` to `to`, lifted in the middle by up to 120px. She faces
 * the way she flies.
 */
export function flightPath(from: Point, to: Point): FlightPoint[] {
    const lift = Math.min(120, Math.hypot(to.x - from.x, to.y - from.y) / 3);
    // A quadratic curve peaks halfway to its control point.
    const control = {
        x: (from.x + to.x) / 2,
        y: Math.min(from.y, to.y) - 2 * lift,
    };
    const face = to.x < from.x ? -1 : 1;
    return Array.from({ length: STEPS }, (_, index) => {
        const t = index / (STEPS - 1);
        const along = (a: number, c: number, b: number) =>
            (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b;
        return {
            x: along(from.x, control.x, to.x),
            y: along(from.y, control.y, to.y),
            face,
        };
    });
}

const place = ({ x, y, face }: FlightPoint) =>
    `translate(${x}px, ${y}px) scaleX(${face})`;

/**
 * Polli, the brand bee, flies to the card the pointer rests on and hovers on
 * its top edge. Pointer devices only, and never under reduced motion.
 */
export function PolliFlight() {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        setEnabled(
            window.matchMedia(
                "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
            ).matches,
        );
    }, []);

    return enabled ? createPortal(<Polli />, document.body) : null;
}

function Polli() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const polli = ref.current;
        if (!polli) return;
        let perch: Element | null = null;
        let pending: Element | null = null;
        let dwell: ReturnType<typeof setTimeout> | undefined;
        let face: 1 | -1 = 1;

        // Document coordinates, so she scrolls with the card.
        const perchPoint = (card: Element): FlightPoint => {
            const box = card.getBoundingClientRect();
            // Whole pixels keep her edges crisp once she lands.
            return {
                x: Math.round(box.right + window.scrollX - PERCH_INSET - WIDTH),
                y: Math.round(box.top + window.scrollY - HEIGHT + 8),
                face,
            };
        };

        // Where she is now, mid-flight included. Her first flight starts just
        // inside the right edge, above the target, so the page never scrolls
        // sideways.
        const current = (to: Point): Point => {
            if (polli.dataset.state === "away") {
                return {
                    x: window.scrollX + window.innerWidth - WIDTH,
                    y: to.y - 160,
                };
            }
            for (const animation of polli.getAnimations()) {
                animation.commitStyles();
                animation.cancel();
            }
            const matrix = new DOMMatrix(getComputedStyle(polli).transform);
            return { x: matrix.m41, y: matrix.m42 };
        };

        const fly = (card: Element) => {
            perch = card;
            const to = perchPoint(card);
            const from = current(to);
            const path = flightPath(from, to);
            face = path[0].face;
            const distance = Math.hypot(to.x - from.x, to.y - from.y);
            polli.dataset.state = "flying";
            const flight = polli.animate(
                path.map((point) => ({ transform: place(point) })),
                {
                    duration: Math.min(1200, Math.max(500, distance / 1.2)),
                    easing: "ease-in-out",
                    fill: "forwards",
                },
            );
            flight.onfinish = () => {
                flight.commitStyles();
                flight.cancel();
                polli.dataset.state = "perched";
            };
        };

        const onOver = (event: PointerEvent) => {
            const card = (event.target as Element).closest(`.${POLLI_PERCH}`);
            if (!card || card === perch || card === pending) return;
            clearTimeout(dwell);
            pending = card;
            dwell = setTimeout(() => {
                pending = null;
                fly(card);
            }, DWELL_MS);
        };

        // Passing over a card on the way somewhere else is not a request.
        const onOut = (event: PointerEvent) => {
            if (pending?.contains(event.relatedTarget as Node | null)) return;
            clearTimeout(dwell);
            pending = null;
        };

        const onResize = () => {
            if (perch && polli.dataset.state === "perched") {
                polli.style.transform = place(perchPoint(perch));
            }
        };

        document.addEventListener("pointerover", onOver);
        document.addEventListener("pointerout", onOut);
        window.addEventListener("resize", onResize);
        return () => {
            clearTimeout(dwell);
            document.removeEventListener("pointerover", onOver);
            document.removeEventListener("pointerout", onOut);
            window.removeEventListener("resize", onResize);
        };
    }, []);

    return (
        <div ref={ref} className="site-polli" data-state="away">
            <PolliSprite />
        </div>
    );
}

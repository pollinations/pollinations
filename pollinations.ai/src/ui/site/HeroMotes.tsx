import { cn } from "@pollinations/ui";
import { type CSSProperties, useRef } from "react";
import { useInView } from "./useInView";

/** Where each mote starts on the art (%), how long it drifts (s), its delay
 * (s) and sideways drift (px). Fixed, so every visit looks the same. */
const MOTES = [
    { x: 48, y: 30, duration: 7, delay: 0, drift: 10 },
    { x: 57, y: 62, duration: 9, delay: -3, drift: -12 },
    { x: 63, y: 18, duration: 8, delay: -5, drift: 8 },
    { x: 69, y: 48, duration: 11, delay: -1, drift: -6 },
    { x: 74, y: 76, duration: 6, delay: -4, drift: 12 },
    { x: 79, y: 34, duration: 10, delay: -7, drift: -10 },
    { x: 84, y: 58, duration: 7, delay: -2, drift: 6 },
    { x: 88, y: 14, duration: 9, delay: -6, drift: -8 },
    { x: 92, y: 70, duration: 8, delay: -3, drift: 10 },
    { x: 96, y: 40, duration: 11, delay: -8, drift: -12 },
];

/**
 * Pollen drifting over the hero art, glowing as fireflies at night. The layer
 * covers the art's own box and takes its fade, pauses off screen, and is
 * hidden under reduced motion.
 */
export function HeroMotes({ wide }: { wide: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref);

    return (
        <div
            ref={ref}
            aria-hidden="true"
            data-paused={inView ? undefined : ""}
            className={cn(
                "site-motes hero-scene absolute inset-x-0 top-0 aspect-[3/2] sm:aspect-[2048/854]",
                wide && "md:left-auto md:w-[66%] lg:w-[76%]",
            )}
        >
            {MOTES.map(({ x, y, duration, delay, drift }) => (
                <span
                    key={`${x}-${y}`}
                    className="site-mote"
                    style={
                        {
                            left: `${x}%`,
                            top: `${y}%`,
                            "--mote-duration": `${duration}s`,
                            "--mote-delay": `${delay}s`,
                            "--mote-drift": `${drift}px`,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}

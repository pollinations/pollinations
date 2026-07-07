import { cn } from "@pollinations/ui";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import "./bee.css";

const FLYBY_EVENT = "site-bee-flyby";
const FIRST_DELAY_MS = 15_000;
const MIN_INTERVAL_MS = 120_000;
const MAX_INTERVAL_MS = 300_000;
const ROUTE_CHANGE_CHANCE = 0.2;

type Flight = { path: string; duration: number; heading: "right" | "left" };

function reducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Lazy S-curve across the current viewport, off-screen to off-screen. */
function buildFlight(): Flight {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const heading: Flight["heading"] = Math.random() < 0.5 ? "right" : "left";
    const y = () => Math.round(h * (0.15 + Math.random() * 0.5));
    const [x0, x1] = heading === "right" ? [-64, w + 64] : [w + 64, -64];
    const mid = (x0 + x1) / 2;
    const path = `path("M ${x0} ${y()} C ${mid} ${y()}, ${mid} ${y()}, ${x1} ${y()}")`;
    const duration = 9_000 + Math.random() * 5_000;
    return { path, duration, heading };
}

/** Mount once (root layout). Sends the bee across the viewport now and then. */
export function BeeFlyby() {
    const [flight, setFlight] = useState<Flight | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flyingRef = useRef(false);

    const launch = useCallback(() => {
        if (flyingRef.current || reducedMotion()) return;
        flyingRef.current = true;
        setFlight(buildFlight());
    }, []);

    const scheduleNext = useCallback(
        (delay: number) => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(launch, delay);
        },
        [launch],
    );

    // First flyby after a polite delay; parked bees can request one any time.
    useEffect(() => {
        if (reducedMotion()) return;
        scheduleNext(FIRST_DELAY_MS);
        window.addEventListener(FLYBY_EVENT, launch);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            window.removeEventListener(FLYBY_EVENT, launch);
        };
    }, [launch, scheduleNext]);

    // Sometimes tag along on navigation (skip the initial mount).
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const lastPath = useRef(pathname);
    useEffect(() => {
        if (lastPath.current === pathname) return;
        lastPath.current = pathname;
        if (Math.random() < ROUTE_CHANGE_CHANCE) launch();
    }, [pathname, launch]);

    const handleDone = () => {
        flyingRef.current = false;
        setFlight(null);
        scheduleNext(
            MIN_INTERVAL_MS +
                Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS),
        );
    };

    if (!flight) return null;
    return (
        <div
            aria-hidden="true"
            className="site-bee"
            data-heading={flight.heading}
            style={
                {
                    "--site-bee-path": flight.path,
                    "--site-bee-duration": `${Math.round(flight.duration)}ms`,
                } as React.CSSProperties
            }
            onAnimationEnd={(event) => {
                if (event.animationName === "site-bee-fly") handleDone();
            }}
        />
    );
}

/** Decorative parked bee; clicking it launches a flyby (easter egg). */
export function ParkedBee({ className }: { className?: string }) {
    return (
        <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className={cn("site-bee-parked", className)}
            onClick={() => window.dispatchEvent(new Event(FLYBY_EVENT))}
        />
    );
}

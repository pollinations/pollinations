import { cn, ScrollArea } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import type { DirectoryApp } from "../../data/publicStats";
import { AppTile } from "./cards";

const layouts = {
    featured: {
        image: "aspect-[16/7]",
        item: "w-[92%] shrink-0 sm:w-[64%] lg:w-[44%]",
    },
    compact: {
        image: "h-30",
        item: "w-59 shrink-0",
    },
} as const;

export function AppCarousel({
    apps,
    size = "featured",
    ariaLabel = "Featured apps",
    className,
}: {
    apps: DirectoryApp[];
    size?: keyof typeof layouts;
    ariaLabel?: string;
    className?: string;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startScroll: number;
    } | null>(null);
    const suppressClick = useRef(false);
    const [paused, setPaused] = useState(false);
    const layout = layouts[size];

    useEffect(() => {
        if (
            paused ||
            apps.length < 2 ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }
        const container = scroller.current;
        if (!container) return;

        let frame = 0;
        let previous: number | null = null;
        const tick = (time: number) => {
            const first = container.querySelector<HTMLElement>(
                '[data-loop-copy="0"][data-loop-index="0"]',
            );
            const repeated = container.querySelector<HTMLElement>(
                '[data-loop-copy="1"][data-loop-index="0"]',
            );
            const cycle =
                first && repeated ? repeated.offsetLeft - first.offsetLeft : 0;
            if (previous !== null && cycle > 0) {
                const elapsed = Math.min(time - previous, 32);
                container.scrollLeft += (cycle / 40_000) * elapsed;
                if (container.scrollLeft >= cycle) {
                    container.scrollLeft -= cycle;
                }
            }
            previous = time;
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [apps.length, paused]);

    if (apps.length === 0) return null;

    return (
        <section
            aria-roledescription="carousel"
            aria-label={ariaLabel}
            className={cn("flex min-w-0 flex-col gap-3", className)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <ScrollArea
                ref={scroller}
                axis="x"
                tabIndex={0}
                className="apps-featured-rail cursor-grab select-none pb-4 active:cursor-grabbing"
                onClickCapture={(event) => {
                    if (suppressClick.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        suppressClick.current = false;
                    }
                }}
                onPointerDown={(event) => {
                    setPaused(true);
                    suppressClick.current = false;
                    if (event.pointerType === "mouse" && event.button === 0) {
                        drag.current = {
                            pointerId: event.pointerId,
                            startX: event.clientX,
                            startScroll: event.currentTarget.scrollLeft,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }
                }}
                onPointerMove={(event) => {
                    if (drag.current?.pointerId !== event.pointerId) return;
                    const distance = event.clientX - drag.current.startX;
                    if (Math.abs(distance) > 5) suppressClick.current = true;
                    event.currentTarget.scrollLeft =
                        drag.current.startScroll - distance;
                }}
                onPointerUp={(event) => {
                    if (drag.current?.pointerId === event.pointerId) {
                        drag.current = null;
                        event.currentTarget.releasePointerCapture(
                            event.pointerId,
                        );
                    }
                    setPaused(false);
                }}
                onPointerCancel={() => {
                    drag.current = null;
                    setPaused(false);
                }}
            >
                <div className="flex items-stretch gap-4">
                    {[0, 1].map((copy) =>
                        apps.map((app, index) => (
                            <article
                                key={`${copy}-${app.name}`}
                                data-loop-copy={copy}
                                data-loop-index={index}
                                aria-hidden={copy === 1 ? true : undefined}
                                aria-roledescription={
                                    copy === 0 ? "slide" : undefined
                                }
                                aria-label={
                                    copy === 0
                                        ? `${index + 1} of ${apps.length}`
                                        : undefined
                                }
                                className={layout.item}
                            >
                                <AppTile
                                    app={app}
                                    imageClassName={layout.image}
                                    className="h-full w-full"
                                    tabIndex={copy === 1 ? -1 : undefined}
                                />
                            </article>
                        )),
                    )}
                </div>
            </ScrollArea>
        </section>
    );
}

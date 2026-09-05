import { ArrowRightIcon, IconButton, ScrollArea } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import type { DirectoryApp } from "../../data/publicStats";
import { AppTile, SpotlightTile } from "./cards";

const TILE_IMAGE_CLASS = "h-30";
const TILE_ITEM_CLASS = "w-59 shrink-0";

export function SpotlightCarousel({ apps }: { apps: DirectoryApp[] }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        setActiveIndex((index) => (apps.length ? index % apps.length : 0));
    }, [apps.length]);

    useEffect(() => {
        if (
            paused ||
            apps.length < 2 ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }

        const interval = window.setInterval(() => {
            setDirection(1);
            setActiveIndex((index) => (index + 1) % apps.length);
        }, 5_500);

        return () => window.clearInterval(interval);
    }, [apps.length, paused]);

    const app = apps[activeIndex];
    if (!app) return null;

    const move = (step: 1 | -1) => {
        setDirection(step);
        setActiveIndex((index) => (index + step + apps.length) % apps.length);
    };

    return (
        <section
            aria-label="Featured apps"
            aria-roledescription="carousel"
            className="min-w-0 overflow-hidden"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={(event) => {
                if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                    setPaused(false);
                }
            }}
        >
            <SpotlightTile
                app={app}
                direction={direction === -1 ? "back" : "forward"}
                action={
                    apps.length > 1 ? (
                        <div className="flex items-center gap-1.5">
                            <IconButton
                                size="sm"
                                aria-label="Previous featured app"
                                onClick={() => move(-1)}
                                className="bg-theme-bg-subtle text-theme-text-strong shadow-none"
                            >
                                <ArrowRightIcon className="size-3.5 rotate-180" />
                            </IconButton>
                            <IconButton
                                size="sm"
                                aria-label="Next featured app"
                                onClick={() => move(1)}
                                className="bg-theme-bg-subtle text-theme-text-strong shadow-none"
                            >
                                <ArrowRightIcon className="size-3.5" />
                            </IconButton>
                        </div>
                    ) : undefined
                }
            />
        </section>
    );
}

export function AppCarousel({
    apps,
    ariaLabel,
}: {
    apps: DirectoryApp[];
    ariaLabel: string;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startScroll: number;
    } | null>(null);
    const suppressClick = useRef(false);
    const [paused, setPaused] = useState(false);

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
            className="flex min-w-0 flex-col gap-3"
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
                                className={TILE_ITEM_CLASS}
                            >
                                <AppTile
                                    app={app}
                                    imageClassName={TILE_IMAGE_CLASS}
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

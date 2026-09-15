import { ArrowRightIcon, IconButton, useColorMode } from "@pollinations/ui";
import { useCallback, useEffect, useRef } from "react";
import type { JourneySelection } from "./pollen-connect-journey-state";
import { ScreenContent, ScreenViewer } from "./pollen-connect-preview";
import { useReview } from "./review";

export function ScreenGallery({
    entrance,
    desktop,
}: {
    entrance: JourneySelection;
    desktop: boolean;
}) {
    const { mode } = useColorMode();
    const review = useReview();
    const root = useRef<HTMLElement>(null);
    const entry = review?.screen;
    const pages = review?.screens ?? [];
    const index = pages.findIndex((page) => page.id === entry?.id);
    const previous = pages[index - 1];
    const next = pages[index + 1];
    const selectScreen = review?.selectScreen;
    const moveScreen = useCallback(
        (event: KeyboardEvent) => {
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
            )
                return;
            const target = event.target as HTMLElement | null;
            if (
                target?.closest?.(
                    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"]',
                )
            )
                return;
            event.preventDefault();
            const destination = event.key === "ArrowRight" ? next : previous;
            if (!destination) return;
            // Keep keyboard focus in the viewer when replacing a focused iframe.
            root.current?.focus({ preventScroll: true });
            selectScreen?.(destination.id);
        },
        [next, previous, selectScreen],
    );

    useEffect(() => {
        window.addEventListener("keydown", moveScreen);
        return () => window.removeEventListener("keydown", moveScreen);
    }, [moveScreen]);

    if (!entry) return null;

    return (
        <section
            ref={root}
            className="screens-gallery"
            aria-label={`${entrance.world} screens`}
            tabIndex={-1}
        >
            <nav
                className="screens-gallery-navigation"
                aria-label="Screen navigation"
                data-theme="neutral"
            >
                <IconButton
                    size="md"
                    title="Previous screen"
                    tooltip={
                        previous
                            ? `Previous screen: ${previous.title} (←)`
                            : "First screen"
                    }
                    disabled={!previous}
                    onClick={() => previous && selectScreen?.(previous.id)}
                >
                    <ArrowRightIcon className="polli:h-4 polli:w-4 polli:rotate-180" />
                </IconButton>
                <IconButton
                    size="md"
                    title="Next screen"
                    tooltip={
                        next ? `Next screen: ${next.title} (→)` : "Last screen"
                    }
                    disabled={!next}
                    onClick={() => next && selectScreen?.(next.id)}
                >
                    <ArrowRightIcon className="polli:h-4 polli:w-4" />
                </IconButton>
            </nav>
            <article className="screens-gallery-item" data-screen-id={entry.id}>
                <ScreenViewer entry={entry} desktop={desktop}>
                    <ScreenContent
                        key={`${entry.id}-${mode}`}
                        entry={entry}
                        scrollable
                        onKeyDown={moveScreen}
                    />
                </ScreenViewer>
            </article>
        </section>
    );
}

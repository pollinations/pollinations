import { ScrollArea, useColorMode } from "@pollinations/ui";
import { useEffect, useRef } from "react";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import type { DashboardPreviewSelection } from "./pollen-connect-dashboard";
import { galleryCardsForFlow } from "./pollen-connect-gallery-data";
import type { JourneySelection } from "./pollen-connect-journey-state";
import { ScreenContent, ScreenViewer } from "./pollen-connect-preview";
import { useReview } from "./review";

export function ScreenGallery({
    entrance,
    desktop,
    selection,
    overrides = {},
}: {
    entrance: JourneySelection;
    desktop: boolean;
    selection?: DashboardPreviewSelection;
    overrides?: Record<string, string>;
}) {
    const { mode } = useColorMode();
    const review = useReview();
    const root = useRef<HTMLDivElement>(null);
    const selectedScreen = review?.screen?.id;
    const pages = review
        ? review.screens
        : galleryCardsForFlow(entrance.world, entrance.section);
    useEffect(() => {
        const card = root.current?.querySelector<HTMLElement>(
            `[data-screen-id="${selectedScreen}"]`,
        );
        card?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [selectedScreen]);

    function moveScreen(event: KeyboardEvent, from = selectedScreen) {
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
            target?.closest(
                'input, textarea, select, [contenteditable="true"], [role="slider"]',
            )
        )
            return;
        const index = pages.findIndex((entry) => entry.id === from);
        if (index < 0) return;
        const next = pages[index + (event.key === "ArrowRight" ? 1 : -1)];
        event.preventDefault();
        if (!next) return;
        review?.selectScreen(next.id);
        root.current
            ?.querySelector<HTMLButtonElement>(
                `[data-screen-id="${next.id}"] .connect-screen-select`,
            )
            ?.focus({ preventScroll: true });
    }

    return (
        <div className="screens-gallery">
            <ScrollArea
                ref={root}
                axis="both"
                className="screens-gallery-scroll"
                onKeyDown={(event) => moveScreen(event.nativeEvent)}
            >
                <section
                    className={`screens-gallery-grid ${desktop ? "screens-gallery-desktop" : ""}`}
                    aria-label={`${entrance.world} screens`}
                >
                    {pages.map((entry: CanvasScreen) => {
                        const variant =
                            selection?.screen === entry.id
                                ? selection.variant
                                : 0;
                        const select = () => review?.selectScreen(entry.id);
                        return (
                            <article
                                key={entry.id}
                                className="screens-gallery-item"
                                data-screen-id={entry.id}
                                data-selected={
                                    selectedScreen === entry.id || undefined
                                }
                            >
                                <ScreenViewer
                                    entry={entry}
                                    desktop={desktop}
                                    selected={selectedScreen === entry.id}
                                    onSelect={select}
                                >
                                    <ScreenContent
                                        key={`${entry.id}-${mode}-${variant}`}
                                        overrides={overrides}
                                        entry={entry}
                                        variant={variant}
                                        scrollable
                                        onOpen={select}
                                        onKeyDown={(event) =>
                                            moveScreen(event, entry.id)
                                        }
                                    />
                                </ScreenViewer>
                            </article>
                        );
                    })}
                </section>
            </ScrollArea>
        </div>
    );
}

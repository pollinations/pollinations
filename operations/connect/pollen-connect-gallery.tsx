import { Button, ScrollArea, useColorMode } from "@pollinations/ui";
import { useEffect, useRef } from "react";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import type { DashboardPreviewSelection } from "./pollen-connect-dashboard";
import { galleryCardsForFlow } from "./pollen-connect-gallery-data";
import type { JourneySelection } from "./pollen-connect-journey-state";
import { ScreenContent, ScreenOwnership } from "./pollen-connect-preview";
import { useReview } from "./review";

export function ScreenGallery({
    entrance,
    desktop,
    onSelect,
    selection,
    overrides = {},
}: {
    entrance: JourneySelection;
    desktop: boolean;
    selection?: DashboardPreviewSelection;
    overrides?: Record<string, string>;
    onSelect: (
        entry: CanvasScreen,
        variant: number,
        order: CanvasScreen[],
    ) => void;
}) {
    const { mode } = useColorMode();
    const review = useReview();
    const root = useRef<HTMLDivElement>(null);
    const selectionKey = `${entrance.world}:${entrance.section}`;
    const previousFlow = useRef(selectionKey);
    useEffect(() => {
        if (previousFlow.current === selectionKey) return;
        previousFlow.current = selectionKey;
        root.current?.scrollTo({ top: 0, left: 0 });
    }, [selectionKey]);
    const selectedScreen = review?.screen?.id;
    useEffect(() => {
        const card = [
            ...(root.current?.querySelectorAll<HTMLElement>(
                "[data-screen-id]",
            ) ?? []),
        ].find((entry) => entry.dataset.screenId === selectedScreen);
        card?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [selectedScreen]);
    const pages = review
        ? review.screens
        : galleryCardsForFlow(entrance.world, entrance.section);
    const showOwnership =
        ["device", "admin"].includes(entrance.world) ||
        (entrance.world === "app" && entrance.section === "main");
    return (
        <div className="screens-gallery">
            <ScrollArea
                ref={root}
                axis="both"
                className="screens-gallery-scroll"
            >
                <section
                    className="screens-gallery-group"
                    aria-label={entrance.world}
                >
                    <div
                        className={`screens-gallery-grid ${desktop ? "screens-gallery-desktop" : ""}`}
                        data-show-owner={showOwnership || undefined}
                    >
                        {pages.map((entry) => {
                            const variant =
                                selection?.screen === entry.id
                                    ? selection.variant
                                    : 0;
                            return (
                                <article
                                    key={entry.id}
                                    className="screens-gallery-item"
                                    data-screen-id={entry.id}
                                    data-selected={
                                        selectedScreen === entry.id || undefined
                                    }
                                >
                                    <Button
                                        className="screens-gallery-card"
                                        aria-label={`Inspect ${entry.title}`}
                                        aria-current={
                                            selectedScreen === entry.id
                                                ? "true"
                                                : undefined
                                        }
                                        onClick={() => {
                                            review?.selectScreen(entry.id);
                                            onSelect(entry, variant, pages);
                                        }}
                                    >
                                        <span className="canvas-phone screens-gallery-preview">
                                            <ScreenContent
                                                key={`${entry.id}-${mode}-${variant}`}
                                                overrides={overrides}
                                                entry={entry}
                                                variant={variant}
                                                scrollable
                                                onOpen={() => {
                                                    review?.selectScreen(
                                                        entry.id,
                                                    );
                                                    onSelect(
                                                        entry,
                                                        variant,
                                                        pages,
                                                    );
                                                }}
                                            />
                                        </span>
                                    </Button>
                                    <div
                                        className="screens-gallery-caption"
                                        data-show-owner={
                                            showOwnership || undefined
                                        }
                                    >
                                        <div className="screens-gallery-title">
                                            <strong>{entry.title}</strong>
                                        </div>
                                        {showOwnership && (
                                            <ScreenOwnership entry={entry} />
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </ScrollArea>
        </div>
    );
}

import { Button, Chip, ScrollArea, useColorMode } from "@pollinations/ui";
import { useEffect, useRef } from "react";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import { galleryCardsForFlow } from "./pollen-connect-gallery-data";
import type { JourneySelection } from "./pollen-connect-journey-state";
import { ScreenContent } from "./pollen-connect-preview";

export function ScreenGallery({
    entrance,
    desktop,
    onSelect,
}: {
    entrance: JourneySelection;
    desktop: boolean;
    onSelect: (
        entry: CanvasScreen,
        variant: number,
        order: CanvasScreen[],
    ) => void;
}) {
    const { mode } = useColorMode();
    const root = useRef<HTMLDivElement>(null);
    const selectionKey = `${entrance.world}:${entrance.section}`;
    const previousFlow = useRef(selectionKey);
    useEffect(() => {
        if (previousFlow.current === selectionKey) return;
        previousFlow.current = selectionKey;
        root.current?.scrollTo({ top: 0, left: 0 });
    }, [selectionKey]);
    const pages = galleryCardsForFlow(entrance.world, entrance.section);
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
                    >
                        {pages.map((entry) => {
                            const optionCount = Math.max(
                                1,
                                entry.variants?.length ?? 0,
                            );
                            return (
                                <article
                                    key={entry.id}
                                    className="screens-gallery-item"
                                >
                                    <div className="screens-gallery-caption polli:gap-2">
                                        <strong>{entry.title}</strong>
                                        <Chip
                                            intent="neutral"
                                            size="sm"
                                            aria-label={`${optionCount} ${optionCount === 1 ? "option" : "options"}`}
                                        >
                                            {optionCount}
                                        </Chip>
                                    </div>
                                    <Button
                                        className="screens-gallery-card"
                                        aria-label={`Inspect ${entry.title}`}
                                        onClick={() =>
                                            onSelect(entry, 0, pages)
                                        }
                                    >
                                        <span className="canvas-phone screens-gallery-preview">
                                            <ScreenContent
                                                key={`${entry.id}-${mode}`}
                                                entry={entry}
                                            />
                                        </span>
                                    </Button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </ScrollArea>
        </div>
    );
}

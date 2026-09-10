import { Button, IconButton, ScrollArea, useColorMode } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
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
    const [variants, setVariants] = useState<Record<string, number>>({});
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
                            const key = `${selectionKey}:${entry.id}`;
                            const variant = (variants[key] ?? 0) % optionCount;
                            const changeVariant = (direction: number) =>
                                setVariants((current) => ({
                                    ...current,
                                    [key]:
                                        ((current[key] ?? 0) +
                                            direction +
                                            optionCount) %
                                        optionCount,
                                }));
                            return (
                                <article
                                    key={entry.id}
                                    className="screens-gallery-item"
                                >
                                    <div className="screens-gallery-caption">
                                        <strong>{entry.title}</strong>
                                        <div className="screens-gallery-options">
                                            {optionCount > 1 && (
                                                <>
                                                    <IconButton
                                                        variant="ghost"
                                                        title={`Previous option for ${entry.title}`}
                                                        tooltip={false}
                                                        onClick={() =>
                                                            changeVariant(-1)
                                                        }
                                                    >
                                                        <span aria-hidden="true">
                                                            ‹
                                                        </span>
                                                    </IconButton>
                                                    <span
                                                        className="screens-gallery-option-name"
                                                        aria-live="polite"
                                                    >
                                                        {
                                                            entry.variants?.[
                                                                variant
                                                            ].label
                                                        }
                                                    </span>
                                                    <IconButton
                                                        variant="ghost"
                                                        title={`Next option for ${entry.title}`}
                                                        tooltip={false}
                                                        onClick={() =>
                                                            changeVariant(1)
                                                        }
                                                    >
                                                        <span aria-hidden="true">
                                                            ›
                                                        </span>
                                                    </IconButton>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        className="screens-gallery-card"
                                        aria-label={`Inspect ${entry.title}`}
                                        onClick={() =>
                                            onSelect(entry, variant, pages)
                                        }
                                    >
                                        <span className="canvas-phone screens-gallery-preview">
                                            <ScreenContent
                                                key={`${entry.id}-${mode}-${variant}`}
                                                entry={entry}
                                                variant={variant}
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
